import { createRequire } from "node:module";
import { Type } from "@sinclair/typebox";

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

/**
 * Log task events for audit trail.
 * Stub implementation - extend as needed with persistent logging.
 */
function logTaskEvent(event: { taskId: string; action: string; actor: string; target?: string; timestamp: string }) {
  // TODO: Implement persistent event logging (file, database, etc.)
  // For now, just log to console for debugging
  console.log(`[TASK_EVENT] ${event.timestamp} - ${event.action} - Task: ${event.taskId} - Actor: ${event.actor}${event.target ? ` - Target: ${event.target}` : ''}`);
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
 * Validate a priority value against the allowed set.
 *
 * @param value - The raw priority value to validate (can be string, boolean, or any type from options)
 * @returns The uppercased priority if valid ("HIGH", "MEDIUM", or "LOW"), or null if invalid
 */
function validatePriority(value: string | boolean | undefined | null): string | null {
  if (!value || typeof value === "boolean") {
    return null;
  }
  const normalized = String(value).toUpperCase();
  const { TASK_PRIORITIES } = getTasksModule();
  return TASK_PRIORITIES.includes(normalized) ? normalized : null;
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


const COMMANDS_REF = `## 🛠️ Task Commands Reference

| Command | Description |
|---------|-------------|
| /task claim <id> | Claim an open task |
| /task complete <id> | Mark task as complete |
| /task pause <id> | Pause a task |
| /task unassign <id> | Remove assignee |
| /task assign <id> --assignee <name> | Reassign task |
| /task edit <id> --title "..." --prompt "..." --type TASK --assignee <name> | Edit task details |
| /task delete <id> | Delete task |`;

function formatTaskDetailed(task: any) {
  const lines = [`### ${task.id} — ${task.status}`];
  lines.push(`Title: ${task.title}`);
  if (task.assignedTo) lines.push(`Assignee: ${task.assignedTo}`);
  if (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) {
    lines.push(`Depends on: ${task.dependsOn.join(", ")}`);
  }
  if (task.prompt && task.prompt !== task.title) {
    lines.push(`Prompt: ${task.prompt}`);
  }
  return lines.join("\n");
}

function formatTaskTableRow(task: any) {
  const assignee = task.assignedTo || "—";
  const deps = (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) ? task.dependsOn.join(", ") : "—";
  return `| ${task.id} | ${task.status} | ${task.title} | ${assignee} | ${deps} |`;
}

function formatTaskList({ showAll = false, detailed = false }: { showAll?: boolean, detailed?: boolean } = {}): PluginCommandPayload {
  const { TASKS_FILE } = getTasksModule();
  const tasks = sortTasks(filterTasks(showAll));
  
  const header = showAll ? "# 📋 Todo Task Manager - All Tasks" : "# 📋 Todo Task Manager - Active Tasks";

  if (tasks.length === 0) {
    return {
      text: `${header}\nTasks file: ${TASKS_FILE}\n\nNo tasks found.\nUse /task add "Title" --prompt "Full prompt" to create one.`
    };
  }

  let text = `${header}\nTasks file: ${TASKS_FILE}\n\n`;

  if (detailed) {
    text += tasks.map(formatTaskDetailed).join("\n\n---\n\n");
  } else {
    text += "Use /tasks:commands for available functions.\n\n---\n\n";
    text += "| ID | Status | Title | Assignee | Dependencies |\n";
    text += "|:---|:-------|:------|:---------|:-------------|\n";
    text += tasks.map(formatTaskTableRow).join("\n");
  }

  return { text };
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
  
  // Commands reference
  if (tokens.includes("commands") || tokens.includes(":commands") || args.includes("commands") || args.includes(":commands")) {
    return { text: COMMANDS_REF };
  }

  // Parse flags
  const showAll = tokens.includes("all");
  const detailed = tokens.includes("detailed") || tokens.includes("--detailed") || tokens.includes("full");

  // By default, use minimal table view
  if (!showAll && !detailed) {
    return formatMinimalTaskList({ showAll });
  }

  // Detailed view or 'all' shows full details
  return formatTaskList({ showAll, detailed });
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
      const priority = validatePriority(rawPriority);
      if (!priority) {
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
        text: `Updated ${task.id} -> ${STATUS_LABELS[task.status]}\n${formatTaskDetailed(task)}`,
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
      let validatedPriority: string | undefined = undefined;
      if (options.priority !== undefined) {
        const priority = validatePriority(options.priority);
        if (!priority) {
          return {
            text: `Invalid priority: ${options.priority}. Valid priorities: ${TASK_PRIORITIES.join(", ")}`,
          };
        }
        validatedPriority = priority;
      }

      const { updateTask } = getTasksModule();
      const task = updateTask(id, {
        title: options.title !== undefined ? String(options.title) : undefined,
        prompt: options.prompt !== undefined ? String(options.prompt) : undefined,
        type: options.type !== undefined ? String(options.type).toUpperCase() : undefined,
        assignedTo: options.assignee !== undefined ? String(options.assignee) : undefined,
        priority: validatedPriority,
      });
      return {
        text: `Updated ${task.id}\n${formatTaskDetailed(task)}`,
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
  formatTaskDetailed,
  formatTaskList,
  getTasksModule,
  handleTaskCommand,
  handleTasksCommand,
  parseOptions,
  tokenizeArgs,
};

export default function register(api: any) {

  api.registerTool({
    name: "task_manager",
    description: "Manage Todo tasks. Agents MUST use this tool to interact with their assigned tasks (claim, complete, status, etc).",
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("list"),
          Type.Literal("add"),
          Type.Literal("claim"),
          Type.Literal("complete"),
          Type.Literal("status"),
          Type.Literal("delete"),
          Type.Literal("pause"),
          Type.Literal("edit"),
        ],
        {
          description: "Action to perform: list, add, claim, complete, status, delete, pause, edit",
        },
      ),
      taskId: Type.Optional(Type.String({
        description: "Task ID (required for claim, complete, status, delete)"
      })),
      title: Type.Optional(Type.String({
        description: "Task title (required for add)"
      })),
      prompt: Type.Optional(Type.String({
        description: "Full task prompt (optional for add)"
      })),
      assignee: Type.Optional(Type.String({
        description: "Agent to assign the task to (optional for add)"
      })),
      priority: Type.Optional(Type.String({
        description: "Task priority (HIGH, MEDIUM, LOW) (optional for add)"
      })),
      status: Type.Optional(Type.Union(
        [
          Type.Literal("OPEN"),
          Type.Literal("IN_PROGRESS"),
          Type.Literal("COMPLETED"),
          Type.Literal("CANCELLED"),
          Type.Literal("BLOCKED"),
          Type.Literal("PAUSED"),
        ],
        {
          description: "New status for the task (required for action=status). Allowed values: OPEN, IN_PROGRESS, COMPLETED, CANCELLED, BLOCKED, PAUSED",
        },
      )),
    }),
    execute: async (params, ctx) => {
      const { action, taskId, title, prompt, assignee, priority, status } = params;
      const { readTasks, addTask, claimTask, completeTask, updateTaskStatus, deleteTask } = getTasksModule();
      const agentId = ctx.agentId || "unknown";

      try {
        if (action === "list") {
          const result = readTasks();
          return { success: true, message: "Tasks retrieved", tasks: result };
        }
        
        if (action === "add") {
          if (!title) throw new Error("Missing title for task");
          const task = addTask({
            title,
            prompt: prompt || title,
            type: "TASK",
            assignedTo: assignee || "",
            priority: (priority || "MEDIUM").toUpperCase(),
            dependsOn: []
          });
          logTaskEvent({ taskId: task.id, action: "assigned", actor: agentId, target: task.assignedTo || "unassigned", timestamp: new Date().toISOString() });
          return { success: true, message: `Task created: ${task.id}`, task };
        }

        if (!taskId) throw new Error("Missing taskId for action");

        if (action === "claim") {
          const task = claimTask(taskId, agentId);
          logTaskEvent({ taskId: task.id, action: "claimed", actor: agentId, target: task.assignedTo, timestamp: new Date().toISOString() });
          return { success: true, message: `Task claimed: ${task.id}`, task };
        }

        if (action === "complete") {
          const task = completeTask(taskId, agentId);
          logTaskEvent({ taskId: task.id, action: "completed", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: `Task completed: ${task.id}`, task };
        }

        if (action === "status") {
          if (!status) throw new Error("Missing status for action=status");
          const task = updateTaskStatus(taskId, status.toUpperCase());

          let eventAction = "status_changed";
          if (status.toUpperCase() === "IN_PROGRESS") eventAction = "resumed";
          if (status.toUpperCase() === "CANCELLED") eventAction = "cancelled";
          if (status.toUpperCase() === "BLOCKED") eventAction = "paused";
          if (status.toUpperCase() === "COMPLETED") eventAction = "completed";

          logTaskEvent({ taskId: task.id, action: eventAction, actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: `Task status updated: ${task.id} -> ${task.status}`, task };
        }

        if (action === "delete") {
          deleteTask(taskId);
          logTaskEvent({ taskId, action: "cancelled", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: `Task deleted: ${taskId}` };
        }

        if (action === "pause") {
          const task = updateTaskStatus(taskId, "BLOCKED");
          logTaskEvent({ taskId: task.id, action: "paused", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: `Task paused: ${task.id}`, task };
        }

        if (action === "edit") {
          const { updateTask } = getTasksModule();
          const updates: any = {};
          if (params.title !== undefined) updates.title = params.title;
          if (params.prompt !== undefined) updates.prompt = params.prompt;
          if (params.assignee !== undefined) updates.assignedTo = params.assignee;
          const task = updateTask(taskId, updates);
          logTaskEvent({ taskId: task.id, action: "edited", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: `Task edited: ${task.id}`, task };
        }

        throw new Error(`Unknown action: ${action}`);
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  });
  
  registerTaskManagerCommands(api);
  registerSessionHooks(api);
}

function formatMinimalTaskList({ showAll = false }: { showAll?: boolean } = {}): PluginCommandPayload {
  const { TASKS_FILE } = getTasksModule();
  const tasks = sortTasks(filterTasks(showAll));
  
  const header = showAll ? "# 📋 Todo Task Manager - All Tasks" : "# 📋 Todo Task Manager - Active Tasks";

  if (tasks.length === 0) {
    return {
      text: `${header}\nTasks file: ${TASKS_FILE}\n\nNo active tasks.\nUse /task add "Title" to create one.`,
    };
  }

  const assignee = (task: any) => task.assignedTo || "—";
  const deps = (task: any) => (Array.isArray(task.dependsOn) && task.dependsOn.length > 0) ? task.dependsOn.join(", ") : "—";

  const rows = tasks.map(task => 
    `| ${task.id} | ${task.status} | ${task.title} | ${assignee(task)} | ${deps(task)} |`
  ).join("\n");

  return {
    text: `${header}\nTasks file: ${TASKS_FILE}\n\n| ID | Status | Title | Assignee | Dependencies |\n|:---|:-------|:------|:---------|:-------------|\n${rows}`,
  };
}