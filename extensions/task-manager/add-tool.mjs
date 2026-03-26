import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, "index.ts");
let content = fs.readFileSync(file, "utf8");

const toolRegistration = `

  api.registerTool({
    name: "task_manager",
    description: "Manage Todo tasks. Agents MUST use this tool to interact with their assigned tasks (claim, complete, status, etc).",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("add"),
        Type.Literal("claim"),
        Type.Literal("complete"),
        Type.Literal("status"),
        Type.Literal("delete"),
        Type.Literal("pause"),
        Type.Literal("edit"),
      ], {
        description: "Action to perform: list, add, claim, complete, status, delete, pause, edit",
      }),
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
      status: Type.Optional(Type.Union([
        Type.Literal("OPEN"),
        Type.Literal("IN_PROGRESS"),
        Type.Literal("COMPLETED"),
        Type.Literal("CANCELLED"),
        Type.Literal("BLOCKED"),
        Type.Literal("PAUSED"),
      ], {
        description: "New status for the task (required for action=status). Allowed values: OPEN, IN_PROGRESS, COMPLETED, CANCELLED, BLOCKED, PAUSED",
      })),
    }),
    execute: async (params, ctx) => {
      const { action, taskId, title, prompt, assignee, priority, status } = params;
      const { readTasks, addTask, claimTask, completeTask, updateTaskStatus, deleteTask } = getTasksModule();
      const agentId = ctx.agentId || "unknown";

      try {
        if (action === "list") {
          return readTasks();
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
          return { success: true, message: \`Task created: \${task.id}\`, task };
        }

        if (!taskId) throw new Error("Missing taskId for action");

        if (action === "claim") {
          const task = claimTask(taskId, agentId);
          logTaskEvent({ taskId: task.id, action: "claimed", actor: agentId, target: task.assignedTo, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task claimed: \${task.id}\`, task };
        }

        if (action === "complete") {
          const task = completeTask(taskId, agentId);
          logTaskEvent({ taskId: task.id, action: "completed", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task completed: \${task.id}\`, task };
        }

        if (action === "status") {
          if (!status) throw new Error("Missing status for action=status");
          const task = updateTaskStatus(taskId, status.toUpperCase());

          const statusMap = {
            "IN_PROGRESS": "resumed",
            "PAUSED": "paused",
            "CANCELLED": "cancelled",
            "BLOCKED": "blocked"
          };
          const eventAction = statusMap[status.toUpperCase()] || status.toUpperCase().toLowerCase();

          logTaskEvent({ taskId: task.id, action: eventAction, actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task status updated: \${task.id} -> \${task.status}\`, task };
        }

        if (action === "pause") {
          const task = updateTaskStatus(taskId, "PAUSED");
          logTaskEvent({ taskId: task.id, action: "paused", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task paused: \${task.id}\`, task };
        }

        if (action === "edit") {
          if (!title && !prompt && !priority && !assignee) {
            throw new Error("At least one field (title, prompt, priority, assignee) must be provided for edit");
          }
          const { readTasks, addTask, claimTask, completeTask, updateTaskStatus, deleteTask } = getTasksModule();
          const tasks = readTasks();
          const task = tasks.find(t => t.id === taskId);
          if (!task) throw new Error(\`Task not found: \${taskId}\`);

          if (title) task.title = title;
          if (prompt) task.prompt = prompt;
          if (priority) task.priority = priority.toUpperCase();
          if (assignee) task.assignedTo = assignee;

          logTaskEvent({ taskId: task.id, action: "edited", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task edited: \${task.id}\`, task };
        }

        if (action === "delete") {
          deleteTask(taskId);
          logTaskEvent({ taskId, action: "cancelled", actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task deleted: \${taskId}\` };
        }

        throw new Error(\`Unknown action: \${action}\`);
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  });`;

// Check if already injected (idempotency check)
if (content.includes("api.registerTool") || /registerTool\(/.test(content)) {
  console.log("Tool already registered - skipping injection");
  process.exit(0);
}

// Idempotently inject TypeBox import if not already present
const typeboxImport = `import { Type } from "@sinclair/typebox";`;
if (!content.includes(typeboxImport) && !content.includes(`from "@sinclair/typebox"`)) {
  // Insert after the last import statement
  const lastImportMatch = [...content.matchAll(/^import .+$/gm)].at(-1);
  if (lastImportMatch) {
    const insertPos = lastImportMatch.index + lastImportMatch[0].length;
    content = content.slice(0, insertPos) + "\n" + typeboxImport + content.slice(insertPos);
  } else {
    content = typeboxImport + "\n" + content;
  }
}

// Perform replacement
const originalContent = content;
content = content.replace(
  /export default function register\(api.*\{/,
  `export default function register(api: any) {${toolRegistration}`
);

// Verify replacement succeeded
if (content === originalContent) {
  console.error("ERROR: Failed to find 'export default function register(api' pattern in file");
  process.exit(1);
}

fs.writeFileSync(file, content, "utf8");
console.log("Tool registered!");