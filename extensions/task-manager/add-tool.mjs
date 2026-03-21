import fs from "fs";

const file = "/home/openclaw/projects/todo-task-manager/extensions/task-manager/index.ts";
let content = fs.readFileSync(file, "utf8");

const toolRegistration = `

  api.registerTool({
    name: "task_manager",
    description: "Manage Todo tasks. Agents MUST use this tool to interact with their assigned tasks (claim, complete, status, etc).",
    schema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          description: "Action to perform: list, add, claim, complete, status, delete",
          enum: ["list", "add", "claim", "complete", "status", "delete"]
        },
        taskId: {
          type: "string",
          description: "Task ID (required for claim, complete, status, delete)"
        },
        title: {
          type: "string",
          description: "Task title (required for add)"
        },
        prompt: {
          type: "string",
          description: "Full task prompt (optional for add)"
        },
        assignee: {
          type: "string",
          description: "Agent to assign the task to (optional for add)"
        },
        priority: {
          type: "string",
          description: "Task priority (HIGH, MEDIUM, LOW) (optional for add)"
        },
        status: {
          type: "string",
          description: "New status for the task (required for action=status) (e.g. IN_PROGRESS, PAUSED, BLOCKED)"
        }
      }
    },
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
          
          let eventAction = "paused";
          if (status.toUpperCase() === "IN_PROGRESS") eventAction = "resumed";
          if (status.toUpperCase() === "CANCELLED") eventAction = "cancelled";

          logTaskEvent({ taskId: task.id, action: eventAction, actor: agentId, timestamp: new Date().toISOString() });
          return { success: true, message: \`Task status updated: \${task.id} -> \${task.status}\`, task };
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

content = content.replace(
  /export default function register\(api.*\{/,
  `export default function register(api: any) {${toolRegistration}`
);

fs.writeFileSync(file, content, "utf8");
console.log("Tool registered!");
