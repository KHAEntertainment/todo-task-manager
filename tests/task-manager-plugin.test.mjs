import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import {
  formatTaskList,
  handleTaskCommand,
  handleTasksCommand,
  parseOptions,
  tokenizeArgs,
} from "../extensions/task-manager/index.ts";

const require = createRequire(import.meta.url);
const TASKS_MODULE_PATH = "/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js";

function loadTasksModuleForHome(homeDir) {
  process.env.HOME = homeDir;
  delete require.cache[TASKS_MODULE_PATH];
  return require(TASKS_MODULE_PATH);
}

test("tokenizeArgs preserves quoted strings", () => {
  const tokens = tokenizeArgs('add "Build command layer" --prompt "full prompt" --assignee coder');
  assert.deepEqual(tokens, [
    "add",
    "Build command layer",
    "--prompt",
    "full prompt",
    "--assignee",
    "coder",
  ]);
});

test("parseOptions separates positional args and flags", () => {
  const parsed = parseOptions([
    "Build command layer",
    "--prompt",
    "full prompt",
    "--assignee",
    "coder",
    "--type",
    "story",
  ]);

  assert.deepEqual(parsed, {
    positional: ["Build command layer"],
    options: {
      prompt: "full prompt",
      assignee: "coder",
      type: "story",
    },
  });
});

test("tasks.js persists across module reloads", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "todo-task-manager-"));
  const tasksModule = loadTasksModuleForHome(tempHome);

  const added = tasksModule.addTask({
    title: "Persist me",
    prompt: "Persist this task across reloads",
    assignedTo: "coder",
  });

  assert.equal(added.id, "task_001");
  assert.equal(tasksModule.readTasks().length, 1);

  const reloadedModule = loadTasksModuleForHome(tempHome);
  const reloadedTasks = reloadedModule.readTasks();

  assert.equal(reloadedTasks.length, 1);
  assert.equal(reloadedTasks[0].title, "Persist me");
  assert.equal(reloadedTasks[0].prompt, "Persist this task across reloads");
});

test("command handlers update task state through tasks.js", async () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "todo-task-manager-"));
  const tasksModule = loadTasksModuleForHome(tempHome);

  const created = await handleTaskCommand({
    args: 'add "Implement slash commands" --prompt "Build task commands" --assignee coder',
  });
  assert.match(created.text, /Created task_001/);

  const listed = await handleTasksCommand({ args: "" });
  assert.match(listed.text, /Implement slash commands/);
  assert.match(listed.text, /\[✅ Complete: \/task complete task_001]/);

  const completed = await handleTaskCommand({ args: "complete task_001" });
  assert.match(completed.text, /COMPLETED/);
  assert.equal(tasksModule.readTasks()[0].status, "COMPLETED");

  const deleted = await handleTaskCommand({ args: "delete task_001" });
  assert.match(deleted.text, /Deleted task_001/);
  assert.equal(tasksModule.readTasks().length, 0);
});

test("formatTaskList reports empty state clearly", () => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "todo-task-manager-"));
  loadTasksModuleForHome(tempHome);
  const payload = formatTaskList({ showAll: false });
  assert.ok(payload.text.includes("Todo Task Manager"));
});
