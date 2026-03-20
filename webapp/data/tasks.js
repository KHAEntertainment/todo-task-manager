/**
 * Data access layer for tasks.json
 * Modular — can be swapped for SQLite without changing the API layer above.
 */

const fs = require('fs');
const path = require('path');

const TASKS_FILE = '/home/openclaw/.openclaw/workspace/tasks/tasks.json';

function readStore() {
  const raw = fs.readFileSync(TASKS_FILE, 'utf8');
  return JSON.parse(raw);
}

function writeStore(store) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function getTasks() {
  const store = readStore();
  return store.tasks || [];
}

function getTask(id) {
  const store = readStore();
  return store.tasks.find(t => t.id === id) || null;
}

function addTask({ type = 'TASK', title, prompt = '', assignedTo = '', dependsOn = [], priority = 'MEDIUM' }) {
  const store = readStore();
  const id = `task_${String(store.lastTaskSequence + 1).padStart(3, '0')}`;
  const now = new Date().toISOString();
  const task = {
    id,
    type,
    title,
    prompt,
    assignedTo,
    dependsOn,
    blockedBy: [],
    blockedReason: '',
    priority,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  store.tasks.push(task);
  store.lastTaskSequence += 1;
  writeStore(store);
  return task;
}

function updateTask(id, updates) {
  const store = readStore();
  const idx = store.tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  store.tasks[idx] = {
    ...store.tasks[idx],
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };
  writeStore(store);
  return store.tasks[idx];
}

function deleteTask(id) {
  const store = readStore();
  const idx = store.tasks.findIndex(t => t.id === id);
  if (idx === -1) return false;
  store.tasks.splice(idx, 1);
  writeStore(store);
  return true;
}

function completeTask(id) {
  return updateTask(id, {
    status: 'COMPLETED',
    completedBy: 'webapp',
    completedAt: new Date().toISOString(),
  });
}

function claimTask(id, assignee) {
  return updateTask(id, {
    assignedTo: assignee,
    claimedBy: assignee,
    claimedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
  });
}

function nextId(store) {
  return `task_${String(store.lastTaskSequence + 1).padStart(3, '0')}`;
}

module.exports = {
  getTasks,
  getTask,
  addTask,
  updateTask,
  deleteTask,
  completeTask,
  claimTask,
};
