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

const ACTIVE_STATUSES = new Set(["OPEN", "IN_PROGRESS", "BLOCKED"]);

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

type TelegramButton = {
  text: string;
  callback_data: string;
};

type TelegramButtons = TelegramButton[][];

type PluginCommandPayload = {
  text: string;
  isError?: boolean;
  channelData?: {
    telegram?: {
      buttons?: TelegramButtons;
    };
  };
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

function formatActionHints(task: { id: string; status: string }) {
  const hints = [];
  if (task.status === "OPEN") {
    hints.push(`[🎯 Claim: /task claim ${task.id}]`);
  }
  hints.push(`[✅ Complete: /task complete ${task.id}]`);
  hints.push(`[⏸ Pause: /task pause ${task.id}]`);
  hints.push(`[🔄 Unassign: /task unassign ${task.id}]`);
  hints.push(`[👤 Reassign: /task assign ${task.id} --assignee coder]`);
  hints.push(`[✏️ Edit: /task edit ${task.id} --title \"...\" --prompt \"...\" --type TASK --assignee coder]`);
  hints.push(`[❌ Delete: /task delete ${task.id}]`);
  return hints.join(" ");
}

function formatPriority(priority?: string): string {
  return PRIORITY_LABELS[priority || "MEDIUM"] || PRIORITY_LABELS.MEDIUM;
}

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
  blockedBy?: string[];
  blockedReason?: string;
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

  if (task.status === "BLOCKED" && Array.isArray(task.blockedBy) && task.blockedBy.length > 0) {
    lines.push(`Blocked by: ${task.blockedBy.join(", ")}`);
    if (task.blockedReason) {
      lines.push(`Reason: ${task.blockedReason}`);
    }
  }

  if (task.prompt) {
    lines.push(`Prompt: ${task.prompt}`);
  }

  if (ACTIVE_STATUSES.has(task.status)) {
    lines.push(formatActionHints(task));
  }

  return lines.join("\n");
}

function formatTaskList({ showAll = false, priorityFilter, showBlocked, page = 0 }: { showAll?: boolean; priorityFilter?: string | null; showBlocked?: boolean; page?: number } = {}): PluginCommandPayload {
  const { TASKS_FILE } = getTasksModule();
  let tasks = filterTasks(showAll, priorityFilter);

  // Filter for blocked tasks if requested
  if (showBlocked) {
    tasks = tasks.filter((task: { status: string }) => task.status === "BLOCKED");
  }

  tasks = sortTasks(tasks);

  let header = showAll
    ? "📋 Todo Task Manager - All Tasks"
    : "📋 Todo Task Manager - Active Tasks";
  if (showBlocked) {
    header = "📋 Todo Task Manager - Blocked Tasks";
  }
  if (priorityFilter) {
    header += ` [${formatPriority(priorityFilter)}]`;
  }

  if (tasks.length === 0) {
    return {
      text: showAll
        ? `${header}\nTasks file: ${TASKS_FILE}\n\nNo tasks found.\nUse /task add "Title" --prompt "Full prompt" to create one.`
        : `${header}\nTasks file: ${TASKS_FILE}\n\nNo active tasks.\nUse /task add "Title" --prompt "Full prompt" to create one.`,
    };
  }

  // Pagination: show max 5 tasks per page
  const TASKS_PER_PAGE = 5;
  const totalPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
  const startIdx = page * TASKS_PER_PAGE;
  const pageTasks = tasks.slice(startIdx, startIdx + TASKS_PER_PAGE);

  const body = pageTasks.map(formatTask).join("\n\n");

  // Build inline buttons for each visible task
  const buttonRows: TelegramButton[][] = pageTasks.map((task: { id: string; status: string; claimedBy?: string }) => {
    const rows: TelegramButton[] = [];

    // Complete button (always show for active tasks)
    rows.push({ text: `✅ Complete ${task.id}`, callback_data: `/task complete ${task.id}` });

    // Claim/Resume button
    if (task.status === "OPEN" || task.status === "BLOCKED") {
      rows.push({ text: `🙋 Claim ${task.id}`, callback_data: `/task claim ${task.id}` });
    }
    if (task.status === "BLOCKED") {
      rows.push({ text: `▶️ Resume ${task.id}`, callback_data: `/task status ${task.id} IN_PROGRESS` });
    }

    // Pause button (for non-completed tasks)
    if (task.status !== "COMPLETED" && task.status !== "CANCELLED") {
      rows.push({ text: `⏸ Pause ${task.id}`, callback_data: `/task pause ${task.id}` });
    }

    // View details button
    rows.push({ text: `👁 View ${task.id}`, callback_data: `/task view ${task.id}` });

    return rows;
  });

  // Add Next/Previous pagination buttons if needed
  if (totalPages > 1) {
    const navRow: TelegramButton[] = [];
    if (page > 0) {
      navRow.push({ text: "⬅️ Prev", callback_data: `/tasks page ${page - 1}` });
    }
    navRow.push({ text: `📄 ${page + 1}/${totalPages}`, callback_data: `/tasks page ${page}` });
    if (page < totalPages - 1) {
      navRow.push({ text: "Next ➡️", callback_data: `/tasks page ${page + 1}` });
    }
    buttonRows.push(navRow);
  }

  return {
    text: `${header}\nTasks file: ${TASKS_FILE}\n\n${body}`,
    channelData: {
      telegram: {
        buttons: buttonRows.length > 0 ? buttonRows : undefined,
      },
    },
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

function buildUsage() {
  return [
    "Task Manager commands:",
    "/tasks",
    "/tasks all",
    "/tasks blocked",
    "/tasks --priority HIGH",
    "/task add \"Title\" --prompt \"Full prompt\" --assignee coder --type TASK --priority HIGH --depends task_001,task_002",
    "/task claim task_001",
    "/task complete task_001",
    "/task pause task_001",
    "/task unassign task_001",
    "/task assign task_001 --assignee coder",
    "/task edit task_001 --title \"New title\" --prompt \"New prompt\" --type TASK --priority HIGH --depends task_001",
    "/task delete task_001",
  ].join("\n");
}

async function handleTasksCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const args = (ctx.args || "").trim();
  const tokens = tokenizeArgs(args);
  const { options } = parseOptions(tokens);
  const showAll = tokens.some(t => t.toLowerCase() === "all");
  const showBlocked = tokens.some(t => t.toLowerCase() === "blocked");
  const priorityFilter = options.priority ? String(options.priority).toUpperCase() : null;

  // Parse page number from "page N" token
  let page = 0;
  const pageIndex = tokens.findIndex(t => t.toLowerCase() === "page");
  if (pageIndex !== -1 && tokens[pageIndex + 1]) {
    const pageNum = parseInt(tokens[pageIndex + 1], 10);
    if (!isNaN(pageNum) && pageNum >= 0) {
      page = pageNum;
    }
  }

  return formatTaskList({ showAll, priorityFilter, showBlocked, page });
}

async function handleTaskCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const args = (ctx.args || "").trim();
  // Use agentId from context (preferred) or fall back to lastSessionInfo
  const agentId = ctx.agentId || lastSessionInfo.agentId || "";

  // Detect if this was triggered by a button click (Telegram echoes callback_data as "/task ...")
  const isButtonTriggered = args.startsWith("/task ");

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
          text: "Usage: /task add \"Title\" --prompt \"Full prompt\" --assignee coder --type TASK --priority HIGH",
        };
      }

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

      const dependsOn = String(options.depends || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

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
      const msg = `✅ Completed ${task.id}: "${task.title}"`;
      return {
        text: isButtonTriggered ? msg : `Updated ${task.id} -> ${STATUS_LABELS[task.status]}\n${formatTask(task)}`,
      };
    }

    if (action === "claim") {
      const { claimTask } = getTasksModule();
      const task = claimTask(id, agentId);
      const msg = `✅ Claimed ${task.id}: "${task.title}"\nClaimed by: ${task.claimedBy}`;
      return { text: isButtonTriggered ? msg : `Claimed ${task.id} -> ${STATUS_LABELS[task.status]}\nClaimed by: ${task.claimedBy} at ${new Date(task.claimedAt!).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}` };
    }

    if (action === "pause" || action === "status") {
      const { updateTaskStatus } = getTasksModule();
      // Handle "/task status {id} {status}" syntax from buttons
      let newStatus = "BLOCKED";
      if (action === "status" && tokens.length > 0) {
        newStatus = tokens[0].toUpperCase();
      }
      const task = updateTaskStatus(id, newStatus);
      const msg = `⏸ ${task.id}: "${task.title}" is now ${STATUS_LABELS[task.status]}`;
      return { text: isButtonTriggered ? msg : `Updated ${task.id} -> ${STATUS_LABELS[task.status]}` };
    }

    if (action === "view") {
      const task = findTaskOrThrow(id);
      return { text: formatTask(task) };
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

      const dependsOn = options.depends !== undefined
        ? String(options.depends)
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;

      const { updateTask } = getTasksModule();
      const task = updateTask(id, {
        title: options.title !== undefined ? String(options.title) : undefined,
        prompt: options.prompt !== undefined ? String(options.prompt) : undefined,
        type: options.type !== undefined ? String(options.type).toUpperCase() : undefined,
        assignedTo: options.assignee !== undefined ? String(options.assignee) : undefined,
        priority: options.priority !== undefined ? String(options.priority).toUpperCase() : undefined,
        dependsOn,
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
