import { createRequire } from "module";

const require = createRequire(import.meta.url);
const TASKS_MODULE_PATH = "/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js";

const TYPE_LABELS: Record<string, string> = {
  EPIC: "\uD83C\uDFD7\uFE0F EPIC",
  TASK: "\uD83D\uDCCB TASK",
  STORY: "\uD83D\uDCC4 STORY",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "\u23F8\uFE0F OPEN",
  IN_PROGRESS: "\uD83D\uDD04 IN_PROGRESS",
  COMPLETED: "\u2705 COMPLETED",
  CANCELLED: "\uD83D\uDEAB CANCELLED",
  BLOCKED: "\uD83D\uDEA7 BLOCKED",
};

const ACTIVE_STATUSES = new Set(["OPEN", "IN_PROGRESS", "BLOCKED"]);

type PluginCommandContext = {
  args?: string;
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

    if (/\s/.test(char)) {
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

function filterTasks(showAll: boolean) {
  const { readTasks } = getTasksModule();
  const tasks = readTasks();
  if (showAll) {
    return tasks;
  }

  return tasks.filter((task: { status: string }) => ACTIVE_STATUSES.has(task.status));
}

function sortTasks(tasks: Array<{ id: string; status: string }>) {
  return [...tasks].sort((left, right) => {
    const statusDelta =
      Number(ACTIVE_STATUSES.has(right.status)) - Number(ACTIVE_STATUSES.has(left.status));
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function formatActionHints(task: { id: string }) {
  return [
    `[\u2705 Complete: /task complete ${task.id}]`,
    `[\u23F8\uFE0F Pause: /task pause ${task.id}]`,
    `[\u274C Delete: /task delete ${task.id}]`,
  ].join(" ");
}

function formatTask(task: {
  id: string;
  type: string;
  status: string;
  title: string;
  assignedTo?: string;
  dependsOn?: string[];
  prompt?: string;
}) {
  const lines = [
    `${TYPE_LABELS[task.type] || task.type} ${task.id}`,
    `${STATUS_LABELS[task.status] || task.status} ${task.title}`,
  ];

  if (task.assignedTo) {
    lines.push(`Assignee: ${task.assignedTo}`);
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

function formatTaskList({ showAll = false }: { showAll?: boolean } = {}): PluginCommandPayload {
  const { TASKS_FILE } = getTasksModule();
  const tasks = sortTasks(filterTasks(showAll));
  const header = showAll
    ? "\uD83D\uDCC2 Todo Task Manager - All Tasks"
    : "\uD83D\uDCC2 Todo Task Manager - Active Tasks";

  if (tasks.length === 0) {
    return {
      text: showAll
        ? `${header}\nTasks file: ${TASKS_FILE}\n\nNo tasks found.\nUse /task add "Title" --prompt "Full prompt" to create one.`
        : `${header}\nTasks file: ${TASKS_FILE}\n\nNo active tasks.\nUse /task add "Title" --prompt "Full prompt" to create one.`,
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

function buildUsage() {
  return [
    "Task Manager commands:",
    "/tasks",
    "/tasks all",
    "/task add \"Title\" --prompt \"Full prompt\" --assignee coder --type TASK",
    "/task complete task_001",
    "/task pause task_001",
    "/task delete task_001",
  ].join("\n");
}

async function handleTasksCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const showAll = (ctx.args || "").trim().toLowerCase() === "all";
  return formatTaskList({ showAll });
}

async function handleTaskCommand(ctx: PluginCommandContext): Promise<PluginCommandPayload> {
  const args = (ctx.args || "").trim();
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

      const { addTask } = getTasksModule();
      const task = addTask({
        type: String(options.type || "TASK").toUpperCase(),
        title,
        prompt: String(options.prompt || ""),
        assignedTo: String(options.assignee || ""),
        dependsOn,
      });

      return {
        text: `Created ${task.id}\n${TYPE_LABELS[task.type]} ${task.title}\n${STATUS_LABELS[task.status]}`,
      };
    }

    const id = tokens[0];
    if (!id) {
      return { text: `Usage: /task ${action} task_001` };
    }

    if (action === "complete") {
      const { updateTaskStatus } = getTasksModule();
      const task = updateTaskStatus(id, "COMPLETED");
      return { text: `Updated ${task.id} -> ${STATUS_LABELS[task.status]}` };
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

    return { text: buildUsage() };
  } catch (error) {
    return {
      text: `Task command failed: ${error instanceof Error ? error.message : String(error)}`,
      isError: true,
    };
  }
}

export function registerTaskManagerCommands(api: {
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
}) {
  registerTaskManagerCommands(api);
}
