/**
 * Task Manager Web App — Frontend JS
 */

const API = '/api/tasks';

let currentFilters = {};

// ─── Fetch Helpers ────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(API + path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(API + path, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Render ────────────────────────────────────────────────────────

function renderTasks(tasks) {
  const container = document.getElementById('task-list');
  const count = document.getElementById('task-count');

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="loading">No tasks found. Create one!</div>';
    count.textContent = '';
    return;
  }

  container.innerHTML = tasks.map(renderTaskCard).join('');

  const active = tasks.filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status)).length;
  count.textContent = `${active} active · ${tasks.length} total`;
}

function renderTaskCard(task) {
  const typeBadge = `<span class="badge badge-type-${task.type.toLowerCase()}">${task.type}</span>`;
  const statusBadge = `<span class="badge badge-status-${task.status.toLowerCase().replace('_', '-')}">${formatStatus(task.status)}</span>`;
  const priorityBadge = `<span class="badge badge-priority-${task.priority.toLowerCase()}">${formatPriority(task.priority)} ${task.priority}</span>`;
  const assigneeBadge = task.assignedTo
    ? `<span class="badge badge-assignee">👤 ${task.assignedTo}</span>`
    : '';

  const blockedInfo = task.blockedBy && task.blockedBy.length > 0
    ? `<div class="task-depends">🚫 Blocked by: ${task.blockedBy.join(', ')} — ${task.blockedReason || 'dependencies not met'}</div>`
    : '';

  const promptInfo = task.prompt
    ? `<div class="task-prompt">${escapeHtml(task.prompt)}</div>`
    : '';

  const dependsInfo = task.dependsOn && task.dependsOn.length > 0
    ? `<div class="task-depends">📎 Depends on: ${task.dependsOn.join(', ')}</div>`
    : '';

  const isDone = ['COMPLETED', 'CANCELLED'].includes(task.status);

  const actions = isDone
    ? `<button class="btn-danger" onclick="onDelete('${task.id}')">Delete</button>`
    : `
      <button class="btn-success" onclick="onComplete('${task.id}')">✅ Complete</button>
      ${task.status === 'OPEN' || task.status === 'BLOCKED' ? `<button class="btn-info" onclick="onClaim('${task.id}')">🙋 Claim</button>` : ''}
      ${task.status === 'BLOCKED' ? `<button class="btn-warning" onclick="onResume('${task.id}')">▶️ Resume</button>` : ''}
      ${task.status === 'IN_PROGRESS' ? `<button class="btn-blocked" onclick="onPause('${task.id}')">⏸ Pause</button>` : ''}
      <button class="btn-ghost" onclick="onEdit('${task.id}')">✏️ Edit</button>
      <button class="btn-danger" onclick="onDelete('${task.id}')">Delete</button>
    `;

  return `
    <div class="task-card">
      <div class="task-card-header">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-id">${task.id}</div>
      </div>
      <div class="task-meta">
        ${typeBadge}
        ${statusBadge}
        ${priorityBadge}
        ${assigneeBadge}
      </div>
      ${blockedInfo}
      ${dependsInfo}
      ${promptInfo}
      <div class="task-actions">${actions}</div>
    </div>
  `;
}

// ─── Actions ───────────────────────────────────────────────────────

async function loadTasks() {
  try {
    const params = new URLSearchParams();
    if (currentFilters.status) params.set('status', currentFilters.status);
    if (currentFilters.priority) params.set('priority', currentFilters.priority);
    if (currentFilters.assignee) params.set('assignee', currentFilters.assignee);
    const qs = params.toString();
    const data = await apiGet(qs ? `?${qs}` : '');
    renderTasks(data.tasks || []);
  } catch (err) {
    document.getElementById('task-list').innerHTML =
      `<div class="loading" style="color:var(--danger)">Error: ${escapeHtml(err.message)}</div>`;
  }
}

async function onComplete(id) {
  try {
    await apiPost(`/${id}/complete`, {});
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

async function onClaim(id) {
  try {
    await apiPost(`/${id}/claim`, { assignee: 'webapp-user' });
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

async function onResume(id) {
  try {
    await apiPut(`/${id}`, { status: 'IN_PROGRESS' });
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

async function onPause(id) {
  try {
    await apiPut(`/${id}`, { status: 'BLOCKED' });
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

async function onDelete(id) {
  if (!confirm(`Delete ${id}?`)) return;
  try {
    await apiDelete(`/${id}`);
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
}

// ─── Add / Edit Modal ─────────────────────────────────────────────

let editingId = null;

function openModal(task = null) {
  const modal = document.getElementById('task-modal');
  const title = document.getElementById('modal-title');
  const form = document.getElementById('task-form');

  editingId = task ? task.id : null;
  title.textContent = task ? `Edit ${task.id}` : 'New Task';

  document.getElementById('task-id').value = task ? task.id : '';
  document.getElementById('task-title').value = task ? task.title : '';
  document.getElementById('task-prompt').value = task ? (task.prompt || '') : '';
  document.getElementById('task-type').value = task ? task.type : 'TASK';
  document.getElementById('task-priority').value = task ? task.priority : 'MEDIUM';
  document.getElementById('task-assignee').value = task ? (task.assignedTo || '') : '';
  document.getElementById('task-depends').value = task ? (task.dependsOn || []).join(', ') : '';

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('task-modal').classList.add('hidden');
  editingId = null;
}

async function onEdit(id) {
  try {
    const task = await apiGet(`/${id}`);
    openModal(task);
  } catch (err) { alert('Error: ' + err.message); }
}

async function onAddClick() {
  openModal();
}

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const dependsRaw = document.getElementById('task-depends').value;
  const dependsOn = dependsRaw
    ? dependsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const payload = {
    title: document.getElementById('task-title').value.trim(),
    prompt: document.getElementById('task-prompt').value.trim(),
    type: document.getElementById('task-type').value,
    priority: document.getElementById('task-priority').value,
    assignedTo: document.getElementById('task-assignee').value.trim(),
    dependsOn,
  };

  try {
    if (editingId) {
      await apiPut(`/${editingId}`, payload);
    } else {
      await apiPost('/', payload);
    }
    closeModal();
    await loadTasks();
  } catch (err) { alert('Error: ' + err.message); }
});

document.getElementById('btn-add-task').addEventListener('click', onAddClick);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

// ─── Filters ───────────────────────────────────────────────────────

function applyFilters() {
  currentFilters = {
    status: document.getElementById('filter-status').value,
    priority: document.getElementById('filter-priority').value,
    assignee: document.getElementById('filter-assignee').value.trim(),
  };
  loadTasks();
}

function clearFilters() {
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-assignee').value = '';
  currentFilters = {};
  loadTasks();
}

document.getElementById('btn-apply-filters').addEventListener('click', applyFilters);
document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);

// ─── Utils ──────────────────────────────────────────────────────────

function formatStatus(s) {
  return { OPEN: '🔵 Open', IN_PROGRESS: '🟡 In Progress', BLOCKED: '🟠 Blocked', COMPLETED: '✅ Done', CANCELLED: '❌ Cancelled' }[s] || s;
}

function formatPriority(p) {
  return { HIGH: '🚨', MEDIUM: '⚠️', LOW: '📌' }[p] || '📌';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ──────────────────────────────────────────────────────────
loadTasks();
