#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Assume the tasks module is in the same directory for this script
// When copied to ~/.openclaw/workspace/skills/task-manager/, it will sit next to tasks.js
const TASKS_JS_PATH = "/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js";

try {
  const tasksModule = await import(TASKS_JS_PATH);
  
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: node task-cli.js <action> [taskId] [options...]");
    console.log("Actions: list, add, claim, complete, assign, unassign, pause, resume, delete, status");
    process.exit(0);
  }

  const action = args[0].toLowerCase();
  
  // Minimal CLI router based on tasks module exports
  switch (action) {
    case "list":
      const allTasks = tasksModule.readTasks();
      console.log(JSON.stringify(allTasks, null, 2));
      break;

    case "add":
      const { values: addOptions, positionals: addPos } = parseArgs({
        args: args.slice(1),
        options: {
          title: { type: "string" },
          prompt: { type: "string" },
          assignee: { type: "string" },
          priority: { type: "string" },
          type: { type: "string" },
          dependsOn: { type: "string", multiple: true }
        },
        allowPositionals: true
      });
      
      const title = addPos[0] || addOptions.title;
      if (!title) {
        console.error("Error: --title is required");
        process.exit(1);
      }
      
      const newTask = tasksModule.addTask({
        title,
        prompt: addOptions.prompt || title,
        assignedTo: addOptions.assignee || "",
        priority: addOptions.priority || "MEDIUM",
        type: addOptions.type || "TASK",
        dependsOn: addOptions.dependsOn || []
      });
      console.log(`Created Task: ${newTask.id}`);
      break;

    case "claim":
      if (!args[1]) throw new Error("Missing taskId");
      const agentId = args[2] || process.env.USER || "cli";
      const claimedTask = tasksModule.claimTask(args[1], agentId);
      console.log(`Claimed Task: ${claimedTask.id} by ${claimedTask.claimedBy}`);
      break;

    case "complete":
      if (!args[1]) throw new Error("Missing taskId");
      const completeAgentId = args[2] || process.env.USER || "cli";
      const completedTask = tasksModule.completeTask(args[1], completeAgentId);
      console.log(`Completed Task: ${completedTask.id}`);
      break;

    case "assign":
      if (!args[1] || !args[2]) throw new Error("Missing taskId or assignee");
      const assignedTask = tasksModule.updateTask(args[1], { assignedTo: args[2] });
      console.log(`Assigned Task: ${assignedTask.id} to ${assignedTask.assignedTo}`);
      break;
      
    case "unassign":
      if (!args[1]) throw new Error("Missing taskId");
      const unassignedTask = tasksModule.unassignTask(args[1]);
      console.log(`Unassigned Task: ${unassignedTask.id}`);
      break;

    case "pause":
    case "status":
      if (!args[1]) throw new Error("Missing taskId");
      const status = action === "pause" ? "PAUSED" : (args[2] ? args[2].toUpperCase() : "PAUSED");
      const statusTask = tasksModule.updateTaskStatus(args[1], status);
      console.log(`Updated Task Status: ${statusTask.id} -> ${statusTask.status}`);
      break;
      
    case "delete":
      if (!args[1]) throw new Error("Missing taskId");
      tasksModule.deleteTask(args[1]);
      console.log(`Deleted Task: ${args[1]}`);
      break;

    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }

} catch (err) {
  console.error(`CLI Error: ${err.message}`);
  process.exit(1);
}
