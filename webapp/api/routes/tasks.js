/**
 * Task API routes for Express
 */

const express = require('express');
const router = express.Router();
const tasks = require('../../data/tasks');

// GET /api/tasks — list all tasks
router.get('/', (req, res) => {
  try {
    const all = tasks.getTasks();
    const { status, priority, assignee } = req.query;
    let filtered = all;

    if (status) {
      filtered = filtered.filter(t => t.status === status.toUpperCase());
    }
    if (priority) {
      filtered = filtered.filter(t => t.priority === priority.toUpperCase());
    }
    if (assignee) {
      filtered = filtered.filter(t =>
        t.assignedTo?.toLowerCase() === assignee.toLowerCase()
      );
    }

    // Sort: OPEN/IN_PROGRESS/BLOCKED first (by priority), then COMPLETED/CANCELLED
    const ACTIVE_STATUSES = new Set(['OPEN', 'IN_PROGRESS', 'BLOCKED']);
    const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

    filtered.sort((a, b) => {
      const aActive = ACTIVE_STATUSES.has(a.status);
      const bActive = ACTIVE_STATUSES.has(b.status);
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aPri = PRIORITY_ORDER[a.priority] ?? 1;
      const bPri = PRIORITY_ORDER[b.priority] ?? 1;
      if (aPri !== bPri) return aPri - bPri;
      return a.id.localeCompare(b.id);
    });

    res.json({ tasks: filtered, total: filtered.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/tasks/:id — get single task
router.get('/:id', (req, res) => {
  try {
    const task = tasks.getTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — create task
router.post('/', (req, res) => {
  try {
    const { type, title, prompt, assignedTo, dependsOn, priority } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    const task = tasks.addTask({
      type: type || 'TASK',
      title: title.trim(),
      prompt: prompt || '',
      assignedTo: assignedTo || '',
      dependsOn: Array.isArray(dependsOn) ? dependsOn : [],
      priority: priority || 'MEDIUM',
    });
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/tasks/:id — update task
router.put('/:id', (req, res) => {
  try {
    const existing = tasks.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    const allowed = ['title', 'prompt', 'type', 'assignedTo', 'dependsOn', 'priority', 'status', 'claimedBy', 'claimedAt', 'blockedBy', 'blockedReason'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const updated = tasks.updateTask(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — delete task
router.delete('/:id', (req, res) => {
  try {
    const deleted = tasks.deleteTask(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/complete — mark complete
router.post('/:id/complete', (req, res) => {
  try {
    const existing = tasks.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    const updated = tasks.completeTask(req.params.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/:id/claim — claim task
router.post('/:id/claim', (req, res) => {
  try {
    const { assignee = 'user' } = req.body;
    const existing = tasks.getTask(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });
    const updated = tasks.claimTask(req.params.id, assignee);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
