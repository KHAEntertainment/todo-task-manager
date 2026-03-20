import { createRequire } from "module";

const require = createRequire(import.meta.url);
const TASKS_MODULE_PATH = "/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js";

const TYPE_LABELS: Record<string, string> = {
  EPIC: "🎯 EPIC",
  TASK: "📋 TASK",
  STORY: "📄 STORY",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "⏸ OPEN",
  IN_PROGRESS: "🔄 IN_PROGRESS",
  COMPLETED: "✅ COMPLETED",
  CANCELLED: "🚫 CANCELLED",
  BLOCKED: "🛑 BLOCKED",
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "🚨 HIGH",
  MEDIUM: "⚠️ MEDIUM",
  LOW: "📌 LOW",
};

const PRIORITY_ORDER: Record<string, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

const ACTIVE_STATUSES = new Set(["OPEN", "IN_PROGRESS", "BLOCKED"]);

// Known agent IDs for task discovery
const KNOWN_AGENTS = new Set(["planner", "coder", "albert"]);

// In-memory store for session-to-agent mapping (for before_agent_start injection)
let lastSessionInfo: { agentId?: string; sessionKey?: string; sessionId?: string } = {};

type PluginCommandContext = {
  args?: string;
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
};

type PluginCommandPayload = {
  text: string;
  isError?: boolean;
};

function getTasksModule() {
  delete require.cache[TASKS_MODULE_PATH];
  return require(TASKS_MODULE_PATH);
}

function tokenizeArgs(input: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (quote) {
      if (char === "\\" && index + 1 < input.length) {
        current += input[index + 1];
        index += 1;
        continue;
      }

      if (char === quote) {
        quote = null;
        continue;
      }

      current += char;
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }

    // Handle both regular hyphen and em-dash as whitespace delimiters
    if (/\s/.test(char) || char === '−' || char === '—') {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse a list of command tokens into positional arguments and option flags.
 *
 * @param tokens - Array of tokens produced from a tokenized command string (e.g., words and `--name` tokens)
 * @returns An object with:
 *  - `positional`: the tokens that do not start with `--`, in original order.
 *  - `options`: a map of option names (without the `--` prefix) to either a string value (the next token) or `true` when the option is provided without a value.
 */
function parseOptions(tokens: string[]) {
  const positional: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const name = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith("--")) {
      options[name] = true;
      continue;
    }

    options[name] = next;
    index += 1;
  }

  return { positional, options };
}

/**
 * Retrieve tasks filtered by active status and optional priority.
 *
 * @param showAll - If true, include tasks of any status; if false, include only active tasks (`OPEN`, `IN_PROGRESS`, `BLOCKED`).
 * @param priorityFilter - If provided, include only tasks whose `priority` equals this value; tasks missing `priority` are treated as `"MEDIUM"`.
 * @returns The list of tasks that match the requested filters.
 */
function filterTasks(showAll: boolean, priorityFilter?: string | null) {
  const { readTasks } = getTasksModule();
  let tasks = readTasks();
  if (!showAll) {
    tasks = tasks.filter((task: { status: string }) => ACTIVE_STATUSES.has(task.status));
  }
  if (priorityFilter) {
    tasks = tasks.filter((task: { priority?: string }) => (task.priority || "MEDIUM") === priorityFilter);
  }
  return tasks;
}

/**
 * Sorts tasks by active status, priority, and identifier.
 *
 * Tasks that have a status in the active set appear before other tasks. Within the same
 * status group tasks are ordered by priority with `HIGH` before `MEDIUM` before `LOW`.
 * Ties are broken by lexicographic comparison of the task `id`.
 *
 * @param tasks - Array of task objects containing at least `id` and `status`; `priority` may be omitted.
 * @returns A new array containing the same tasks ordered as described above.
 */
function sortTasks(tasks: Array<{ id: string; status: string; priority?: string }>) {
  const { TASK_PRIORITIES } = getTasksModule();

  return [...tasks].sort((left, right) => {
    const statusDelta =
      Number(ACTIVE_STATUSES.has(right.status)) - Number(ACTIVE_STATUSES.has(left.status));
    if (statusDelta !== 0) {
      return statusDelta;
    }

    // Secondary sort: priority (HIGH -> MEDIUM -> LOW)
    const leftPriority = left.priority || "MEDIUM";
    const rightPriority = right.priority || "MEDIUM";

    // Fallback for invalid priorities: map to MEDIUM (safe default)
    const leftNumeric = TASK_PRIORITIES.includes(leftPriority) ? PRIORITY_ORDER[leftPriority] : PRIORITY_ORDER["MEDIUM"];
    const rightNumeric = TASK_PRIORITIES.includes(rightPriority) ? PRIORITY_ORDER[rightPriority] : PRIORITY_ORDER["MEDIUM"];
    const priorityDelta = leftNumeric - rightNumeric;

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

/**
 * Return the display label for a task priority.
 *
 * @param priority - Optional priority identifier (e.g. `"HIGH"`, `"MEDIUM"`, `"LOW"`). If omitted or not found, `"MEDIUM"` is used.
 * @returns The decorated label string for the resolved priority (defaults to the medium priority label when omitted or unrecognized).
 */
function formatPriority(priority?: string): string {
  return PRIORITY_LABELS[priority || "MEDIUM"] || PRIORITY_LABELS.MEDIUM;
}

/**
 * Build a compact string of CLI-style action shortcuts for a task.
 *
 * @param task - The task object; its `id` is used to populate command examples and its `status` determines whether a claim hint is included.
 * @returns A single string containing space-separated action hints (claim when `status` is `"OPEN"`, complete, pause, unassign, assign, edit, and delete) with example `/task` commands populated with the task `id`.
 */
function formatActionHints(task: { id: string; status: string }) {
  const hints = [];
  if (task.status === "OPEN") {
    hints.push(`[🎯 Claim: /task claim ${task.id}]`);
  }
  hints.push(`[✅ Complete: /task complete ${task.id}]`);
  hints.push(`[⏸ Pause: /task pause ${task.id}]`);
  hints.push(`[🔄 Unassign: /task unassign ${task.id}]`);
  hints.push(`[👤 Reassign: /task assign ${task.id} --assignee coder]`);
  hints.push(`[✏️ Edit: /task edit ${task.id} --title \"...\" --prompt \"...\" --type TASK --priority HIGH --assignee coder]`);
  hints.push(`[❌ Delete: /task delete ${task.id}]`);
  return hints.join(" ");
}

/**
 * Render a task object as a multi-line human-readable string.
 *
 * @param task - Task properties:
 *   - `id`, `type`, `status`, `title`: core identifiers shown on the first lines.
 *   - `priority` (optional): rendered as a decorated priority label.
 *   - `assignedTo`, `claimedBy`, `claimedAt`, `completedBy`, `completedAt` (optional): shown as additional lines; timestamps are formatted in America/Los_Angeles when present.
 *   - `dependsOn` (optional): listed as comma-separated dependencies.
 *   - `prompt` (optional): included as a `Prompt:` line.
 *   Action hints are appended when the task's `status` is considered active.
 * @returns A multi-line string containing the task's priority label, type and id, status and title, followed by optional lines for assignee, claim/completion details, dependencies, prompt, and action hints when applicable.
 */
function formatTask(task: {
  id: string;
  type: string;
  status: string;
  title: string;
  priority?: string;
  assignedTo?: string;
  claimedBy?: string;
  claimedAt?: string;
  completedBy?: string;
  completedAt?: string;
  dependsOn?: string[];
  prompt?: string;
}) {
  const lines = [
    formatPriority(task.priority),
    `${TYPE_LABELS[task.type] || task.type} ${task.id}`,
    `${STATUS_LABELS[task.status] || task.status} ${task.title}`,
  ];

  if (task.assignedTo) {
    lines.push(`Assignee: ${task.assignedTo}`);
  }

  if (task.claimedBy) {
    const claimTime = task.claimedAt
      ? new Date(task.claimedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
      : "";
    lines.push(`Claimed by: ${task.claimedBy}${claimTime ? ` at ${claimTime}` : ""}`);
  }

  if (task.completedBy) {
    const completeTime = task.completedAt
      ? new Date(task.completedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
      : "";
    lines.push(`Completed by: ${task.completedBy}${completeTime ? ` at ${completeTime}` : ""}`);
  }

  if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
    lines.push(`Depends on: ${task.dependsOn.join(", ")}`);
  }

  if (task.prompt) {
    lines.push(`Prompt: ${task.prompt}`);
  }

  if (ACTIVE_STATUSES.has(task.status)) {
    lines.push(formatActionHints(task));
  }

  return lines.join("\n");
}

/**
 * Build a human-readable listing of tasks, optionally limited to active tasks or a priority.
 *
 * Generates a text payload containing a header (indicating "All" or "Active" tasks and an optional priority bracket),
 * the configured tasks file path, and either a formatted list of tasks or an appropriate empty-state message with
 * a usage hint for creating tasks.
 *
 * @param param0.showAll - When true, include all tasks; otherwise include only tasks with active statuses.
 * @param param0.priorityFilter - When provided, restrict tasks to the given priority (case-insensitive string such as "HIGH"); also appended to the header.
 * @returns A PluginCommandPayload whose `text` field contains the composed task list or an empty-state message.
 */
function formatTaskList({ showAll = false, priorityFilter }: { showAll?: boolean; priorityFilter?: string | null } = {}): PluginCommandPayload {
  const { TASKS_FILE } = getTasksModule();
  const tasks = sortTasks(filterTasks(showAll, priorityFilter));
  let header = showAll
    ? "📋 Todo Task Manager - All Tasks"
    : "📋 Todo Task Manager - Active Tasks";
  if (priorityFilter) {
    header += ` [${formatPriority(priorityFilter)}]`;
  }

  if (tasks.length === 0) {
    return {
      text: showAll
        ? `${header}\nTasks file: ${TASKS_FILE}\n\nNo tasks found.\nUse /task add "Title" --prompt "Full prompt" --priority HIGH to create one.`
        : `${header}\nTasks file: ${TASKS_FILE}\n\nNo active tasks.\nUse /task add "Title" --prompt "Full prompt" --priority HIGH to create one.`,
    };
  }

  const body = tasks.map(formatTask).join("\n\n");

  return {
    text: `${header}\nTasks file: ${TASKS_FILE}\n\n${body}`,
  };
}

function findTaskOrThrow(id: string) {
  const { readTasks } = getTasksModule();
  const task = readTasks().find((entry: { id: string }) => entry.id === id);
  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }
  return task;
}

/**
 * Provide a newline-separated usage guide of supported Todo Task Manager commands.
 *
 * The returned text contains example invocations for listing tasks and managing tasks
 * (add, claim, complete, pause, unassign, assign, edit, delete), including sample
 * options such as `--priority`, `--assignee`, and `--prompt`.
 *
 * @returns A single string with example command usages separated by newline characters.
 */
function buildUsage() {
  return [
    "Task Manager commands:",
    "/tasks",
    "/tasks all",
    "/tasks --priority HIGH",
    "/task add \"Title\" --prompt \"Full prompt\" --assignee coder --type TASK --priority HIGH",
    "/task claim task_001",
    "/task complete task_001",
    "/task pause task_001",
    "/task unassign task_001",
    "/task assign task_001 --assignee coder",
    "/task edit task_001 --title \"New title\" --prompt \"New prompt\" --type TASK --priority HIGH --assignee coder",
    "/task delete task_001",
  ].join("\n");
}

/**
 * Handle the `/tasks` command, returning a formatted list of tasks optionally filtered by visibility and priority.
 *
 * Recognizes the literal token `all` (case-insensitive) to include non-active tasks and the `--priority` option to filter by priority.
 *
 * @param ctx - Plugin command context; `ctx.args` is parsed for tokens and options
 * @returns A `PluginCommandPayload` containing the rendered task list and related metadata
 */
async function handleTasksCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const args = (ctx.args || "").trim();
  const tokens = tokenizeArgs(args);
  const { options } = parseOptions(tokens);
  const showAll = tokens.some(t => t.toLowerCase() === "all");
  const priorityFilter = options.priority ? String(options.priority).toUpperCase() : null;

  return formatTaskList({ showAll, priorityFilter });
}

/**
 * Handle the `/task` command and perform task management actions such as add, claim, complete, edit, assign, unassign, pause, and delete.
 *
 * @param ctx - The command context providing `args` and optionally `agentId` used to determine the acting agent and command arguments.
 * @returns A PluginCommandPayload with a human-readable `text` response. On internal failure the payload includes `isError: true` and `text` contains the error message.
 */
async function handleTaskCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const args = (ctx.args || "").trim();
  // Use agentId from context (preferred) or fall back to lastSessionInfo
  const agentId = ctx.agentId || lastSessionInfo.agentId || "";
  if (!args) {
    return { text: buildUsage() };
  }

  const tokens = tokenizeArgs(args);
  const action = (tokens.shift() || "").toLowerCase();

  if (!action) {
    return { text: buildUsage() };
  }

  try {
    if (action === "add") {
      const { positional, options } = parseOptions(tokens);
      const { TASK_TYPES, TASK_PRIORITIES } = getTasksModule();
      const title = positional.join(" ").trim();
      if (!title) {
        return {
          text: "Usage: /task add \"Title\" --prompt \"Full prompt\" --assignee coder --type TASK",
        };
      }

      const dependsOn = String(options.depends || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      // Validate and normalize type before toUpperCase()
      const rawType = options.type || "TASK";
      const type = String(rawType).toUpperCase();
      if (!TASK_TYPES.includes(type)) {
        return {
          text: `Invalid task type: ${rawType}. Valid types: ${TASK_TYPES.join(", ")}`,
        };
      }

      // Validate and normalize priority before toUpperCase()
      const rawPriority = options.priority || "MEDIUM";
      const priority = String(rawPriority).toUpperCase();
      if (!TASK_PRIORITIES.includes(priority)) {
        return {
          text: `Invalid priority: ${rawPriority}. Valid priorities: ${TASK_PRIORITIES.join(", ")}`,
        };
      }

      const { addTask } = getTasksModule();
      const task = addTask({
        type,
        title,
        prompt: String(options.prompt || ""),
        assignedTo: String(options.assignee || ""),
        dependsOn,
        priority,
      });

      return {
        text: `Created ${task.id}\n${formatPriority(task.priority)} ${TYPE_LABELS[task.type]} ${task.title}\n${STATUS_LABELS[task.status]}`,
      };
    }

    const id = tokens[0];
    if (!id) {
      return { text: `Usage: /task ${action} task_001` };
    }

    if (action === "complete") {
      const { completeTask } = getTasksModule();
      const task = completeTask(id, agentId);
      return {
        text: `Updated ${task.id} -> ${STATUS_LABELS[task.status]}\n${formatTask(task)}`,
      };
    }

    if (action === "claim") {
      const { claimTask } = getTasksModule();
      const task = claimTask(id, agentId);
      return { text: `Claimed ${task.id} -> ${STATUS_LABELS[task.status]}\nClaimed by: ${task.claimedBy} at ${new Date(task.claimedAt!).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` };
    }

    if (action === "pause") {
      const { updateTaskStatus } = getTasksModule();
      const task = updateTaskStatus(id, "BLOCKED");
      return { text: `Updated ${task.id} -> ${STATUS_LABELS[task.status]}` };
    }

    if (action === "delete") {
      const { deleteTask } = getTasksModule();
      findTaskOrThrow(id);
      deleteTask(id);
      return { text: `Deleted ${id}` };
    }

    if (action === "edit") {
      const { positional: _optsPositional, options } = parseOptions(tokens.slice(1));
      const { TASK_TYPES, TASK_PRIORITIES } = getTasksModule();

      // Validate and normalize type before toUpperCase()
      if (options.type !== undefined) {
        const type = String(options.type).toUpperCase();
        if (!TASK_TYPES.includes(type)) {
          return {
            text: `Invalid task type: ${options.type}. Valid types: ${TASK_TYPES.join(", ")}`,
          };
        }
      }

      // Validate and normalize priority before toUpperCase()
      if (options.priority !== undefined) {
        const priority = String(options.priority).toUpperCase();
        if (!TASK_PRIORITIES.includes(priority)) {
          return {
            text: `Invalid priority: ${options.priority}. Valid priorities: ${TASK_PRIORITIES.join(", ")}`,
          };
        }
      }

      const { updateTask } = getTasksModule();
      const task = updateTask(id, {
        title: options.title !== undefined ? String(options.title) : undefined,
        prompt: options.prompt !== undefined ? String(options.prompt) : undefined,
        type: options.type !== undefined ? String(options.type).toUpperCase() : undefined,
        assignedTo: options.assignee !== undefined ? String(options.assignee) : undefined,
        priority: options.priority !== undefined ? String(options.priority).toUpperCase() : undefined,
      });
      return {
        text: `Updated ${task.id}\n${formatTask(task)}`,
      };
    }

    if (action === "unassign") {
      const { unassignTask } = getTasksModule();
      const task = unassignTask(id);
      return {
        text: `Unassigned ${task.id} -> ${STATUS_LABELS[task.status]}`,
      };
    }

    if (action === "assign") {
      const { positional: _optsPositional, options } = parseOptions(tokens.slice(1));
      const assignee = options.assignee;
      if (!assignee) {
        return {
          text: "Usage: /task assign task_001 --assignee coder",
        };
      }
      const { assignTask } = getTasksModule();
      const task = assignTask(id, String(assignee));
      return {
        text: `Assigned ${task.id} -> ${STATUS_LABELS[task.status]} (Assignee: ${task.assignedTo})`,
      };
    }

    return { text: buildUsage() };
  } catch (error) {
    return {
      text: `Task command failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

function registerTaskManagerCommands(api: {
  registerCommand: (definition: {
    name: string;
    description: string;
    acceptsArgs: boolean;
    handler: (ctx: PluginCommandContext) => Promise<PluginCommandPayload>;
  }) => void;
}) {
  api.registerCommand({
    name: "tasks",
    description: "Show Todo Task Manager tasks",
    acceptsArgs: true,
    handler: handleTasksCommand,
  });

  api.registerCommand({
    name: "task",
    description: "Manage Todo Task Manager tasks",
    acceptsArgs: true,
    handler: handleTaskCommand,
  });
}

/**
 * Format tasks for agent discovery message (session start).
 * Matches PHASE2_PLAN.md spec format.
 */
function formatTaskDiscovery(agentId: string): string {
  const { readTasks } = getTasksModule();
  const allTasks = readTasks();

  // Filter to OPEN tasks assigned to this agent
  const agentTasks = allTasks.filter(
    (task: { assignedTo?: string; status: string }) =>
      task.assignedTo?.toLowerCase() === agentId.toLowerCase() &&
      task.status === "OPEN",
  );

  if (agentTasks.length === 0) {
    return "";
  }

  const lines: string[] = [
    "━━━━━━━━━━━━━━━━━━━━━━",
    "📋 You have OPEN tasks assigned to you:",
    "━━━━━━━━━━━━━━━━━━━━━━",
  ];

  for (const task of agentTasks) {
    lines.push("");
    lines.push(`${TYPE_LABELS[task.type] || task.type} ${task.id}: "${task.title}"`);
    if (task.prompt) {
      lines.push(`  Prompt: ${task.prompt}`);
    }
    lines.push(
      `  Actions: /task claim ${task.id} | /task complete ${task.id} | /task pause ${task.id}`,
    );
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

/**
 * Register session lifecycle hooks.
 * session_start: store agent/session info
 * before_agent_start: inject task discovery context
 */
function registerSessionHooks(api: {
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void };
}) {
  // session_start: capture agent context for later use in before_agent_start
  api.on("session_start", (event: { sessionId: string; sessionKey?: string; resumedFrom?: string }, ctx: { agentId?: string; sessionId: string; sessionKey?: string }) => {
    lastSessionInfo = {
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      sessionId: ctx.sessionId,
    };
    api.logger.info(`task-manager: session_start for agent=${ctx.agentId} session=${ctx.sessionId}`);
  });

  // before_agent_start: inject task discovery for known agents
  api.on("before_agent_start", (event: { prompt: string; messages?: unknown[] }, ctx: { agentId?: string; sessionKey?: string }) => {
    const agentId = ctx.agentId || lastSessionInfo.agentId;
    if (!agentId) return;

    // Only inject for known agents
    if (!KNOWN_AGENTS.has(agentId.toLowerCase())) {
      return;
    }

    const discovery = formatTaskDiscovery(agentId);
    if (!discovery) {
      return;
    }

    api.logger.info(`task-manager: injecting task discovery for agent=${agentId}`);

    return {
      prependContext: `<task-discovery>\n${discovery}\n</task-discovery>`,
    };
  });
}

export {
  buildUsage,
  formatTask,
  formatTaskList,
  getTasksModule,
  handleTaskCommand,
  handleTasksCommand,
  parseOptions,
  tokenizeArgs,
};

export default function register(api: {
  registerCommand: (definition: {
    name: string;
    description: string;
    acceptsArgs: boolean;
    handler: (ctx: PluginCommandContext) => Promise<PluginCommandPayload>;
  }) => void;
  on: (event: string, handler: (event: unknown, ctx: unknown) => unknown) => void;
  logger: { info: (msg: string) => void; warn: (msg: string) => void };
}) {
  registerTaskManagerCommands(api);
  registerSessionHooks(api);
}
