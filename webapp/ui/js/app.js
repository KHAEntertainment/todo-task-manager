/**
 * Task Manager Web App — Frontend JS
 * Telegram Mini App SDK Integration
 */

const API = '/api/tasks';

// ─── Telegram SDK Detection ─────────────────────────────────────
const tg = window.Telegram?.WebApp;
const isTelegram = !!(tg && tg.initData);

if (isTelegram) {
  tg.ready();
  tg.expand();
  try { tg.requestFullscreen(); } catch (_) { /* not supported in older clients */ }
  document.body.classList.add('tg-mode');
}

// ─── State ───────────────────────────────────────────────────────
let currentView = 'list'; // 'list' | 'detail' | 'form'
let selectedTask = null;
let editingId = null;
let currentFilters = {};
let lastMainHandler = null;
let lastSecHandler = null;

// ─── Telegram Theme Integration ──────────────────────────────────

function applyTelegramTheme() {
  if (!isTelegram) return;
  const tp = tg.themeParams;
  if (!tp) return;
  const root = document.documentElement.style;
  if (tp.bg_color) root.setProperty('--bg', tp.bg_color);
  if (tp.secondary_bg_color) root.setProperty('--surface', tp.secondary_bg_color);
  if (tp.section_bg_color) root.setProperty('--surface2', tp.section_bg_color);
  if (tp.text_color) root.setProperty('--text', tp.text_color);
  if (tp.hint_color) root.setProperty('--text-muted', tp.hint_color);
  if (tp.button_color) root.setProperty('--accent', tp.button_color);
  if (tp.accent_text_color) root.setProperty('--accent-hover', tp.accent_text_color);
  if (tp.destructive_text_color) root.setProperty('--danger', tp.destructive_text_color);
  if (tp.link_color) root.setProperty('--info', tp.link_color);
  if (tp.subtitle_text_color) root.setProperty('--border', tp.subtitle_text_color + '40');
  if (tp.header_bg_color) {
    tg.setHeaderColor(tp.header_bg_color);
  }
}

applyTelegramTheme();
if (isTelegram) {
  tg.onEvent('themeChanged', applyTelegramTheme);
}

// ─── Haptic Feedback ─────────────────────────────────────────────

function haptic(type, style) {
  if (!isTelegram || !tg.HapticFeedback) return;
  try {
    if (type === 'impact') tg.HapticFeedback.impactOccurred(style || 'light');
    else if (type === 'notification') tg.HapticFeedback.notificationOccurred(style || 'success');
    else if (type === 'selection') tg.HapticFeedback.selectionChanged();
  } catch (_) { /* older clients may not support all types */ }
}

// ─── Native Dialogs ──────────────────────────────────────────────

function confirmAction(message, callback) {
  if (isTelegram && tg.showConfirm) {
    tg.showConfirm(message, callback);
  } else {
    callback(window.confirm(message));
  }
}

function showAlert(message) {
  if (isTelegram && tg.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

// ─── Preference Storage ──────────────────────────────────────────

async function savePreference(key, value) {
  try {
    if (isTelegram && tg.DeviceStorage) {
      await tg.DeviceStorage.setItem('tm_' + key, value);
    } else {
      localStorage.setItem('tm_' + key, value);
    }
  } catch (_) { /* storage may be unavailable */ }
}

async function loadPreference(key) {
  try {
    if (isTelegram && tg.DeviceStorage) {
      return await tg.DeviceStorage.getItem('tm_' + key);
    }
    return localStorage.getItem('tm_' + key);
  } catch (_) { return null; }
}

// ─── Telegram User Info ──────────────────────────────────────────

function getTelegramUsername() {
  if (!isTelegram || !tg.initDataUnsafe?.user) return 'webapp-user';
  const user = tg.initDataUnsafe.user;
  return user.username || user.first_name || 'webapp-user';
}

// ─── sendData — Bot Communication ────────────────────────────────

function sendActionToBot(action, taskId, taskTitle) {
  if (!isTelegram || !tg.sendData) return;
  try {
    tg.sendData(JSON.stringify({ action, taskId, title: taskTitle }));
  } catch (_) { /* sendData may fail if not launched via web_app button */ }
}

// ─── Fetch Helpers ───────────────────────────────────────────────

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

// ─── View Navigation ─────────────────────────────────────────────

function navigateTo(view, task) {
  currentView = view;
  selectedTask = task || null;

  const listEl = document.getElementById('task-list');
  const detailEl = document.getElementById('task-detail');
  const filterBar = document.querySelector('.filter-bar');
  const countEl = document.getElementById('task-count');
  const formView = document.getElementById('task-form-view');
  const header = document.querySelector('.header');

  // Hide all views
  listEl.classList.add('hidden');
  detailEl.classList.add('hidden');
  formView.classList.add('hidden');
  filterBar.classList.remove('hidden');
  countEl.classList.remove('hidden');
  if (header) header.classList.remove('hidden');

  if (view === 'list') {
    listEl.classList.remove('hidden');
  } else if (view === 'detail') {
    detailEl.classList.remove('hidden');
    filterBar.classList.add('hidden');
    countEl.classList.add('hidden');
    renderDetailView(task);
  } else if (view === 'form') {
    if (isTelegram) {
      formView.classList.remove('hidden');
      filterBar.classList.add('hidden');
      countEl.classList.add('hidden');
      listEl.classList.add('hidden');
      if (header) header.classList.add('hidden');
      populateInlineForm(task);
    } else {
      listEl.classList.remove('hidden');
      openModal(task);
    }
  }

  updateBackButton();
  updateTelegramButtons();
}

// ─── BackButton ──────────────────────────────────────────────────

function updateBackButton() {
  if (!isTelegram || !tg.BackButton) return;
  if (currentView === 'list') {
    tg.BackButton.hide();
  } else {
    tg.BackButton.show();
  }
}

if (isTelegram && tg.BackButton) {
  tg.onEvent('backButtonClicked', () => {
    haptic('impact', 'light');
    if (currentView === 'form' && selectedTask) {
      navigateTo('detail', selectedTask);
    } else if (currentView === 'form' || currentView === 'detail') {
      navigateTo('list');
      loadTasks();
    } else {
      tg.close();
    }
  });
}

// ─── BottomButton + SecondaryButton ──────────────────────────────

function updateTelegramButtons() {
  if (!isTelegram) return;
  const btn = tg.MainButton;
  const secBtn = tg.SecondaryButton;
  if (!btn) return;

  // Detach previous handlers
  if (lastMainHandler) { try { btn.offClick(lastMainHandler); } catch (_) {} }
  if (lastSecHandler && secBtn) { try { secBtn.offClick(lastSecHandler); } catch (_) {} }

  if (currentView === 'list') {
    btn.text = 'Create Task';
    btn.color = tg.themeParams?.button_color || '#6c8aff';
    btn.textColor = tg.themeParams?.button_text_color || '#ffffff';
    lastMainHandler = () => {
      haptic('impact', 'light');
      navigateTo('form');
    };
    btn.onClick(lastMainHandler);
    btn.show();
    if (secBtn) secBtn.hide();

  } else if (currentView === 'detail' && selectedTask) {
    const status = selectedTask.status;
    const isDone = ['COMPLETED', 'CANCELLED'].includes(status);

    if (!isDone) {
      if (status === 'OPEN' || status === 'BLOCKED') {
        btn.text = status === 'BLOCKED' ? 'Resume Task' : 'Claim Task';
        lastMainHandler = () => {
          haptic('impact', 'medium');
          if (status === 'BLOCKED') {
            onResume(selectedTask.id);
          } else {
            onClaim(selectedTask.id);
          }
        };
      } else if (status === 'IN_PROGRESS') {
        btn.text = 'Complete Task';
        lastMainHandler = () => {
          haptic('impact', 'medium');
          onComplete(selectedTask.id);
        };
      }
      btn.color = tg.themeParams?.button_color || '#6c8aff';
      btn.textColor = tg.themeParams?.button_text_color || '#ffffff';
      btn.onClick(lastMainHandler);
      btn.show();
    } else {
      btn.hide();
    }

    // Secondary button for delete
    if (secBtn) {
      secBtn.text = 'Delete';
      lastSecHandler = () => {
        haptic('impact', 'heavy');
        onDelete(selectedTask.id);
      };
      secBtn.onClick(lastSecHandler);
      secBtn.show();
    }

  } else if (currentView === 'form') {
    btn.text = editingId ? 'Save Changes' : 'Save Task';
    btn.color = tg.themeParams?.button_color || '#6c8aff';
    btn.textColor = tg.themeParams?.button_text_color || '#ffffff';
    lastMainHandler = () => {
      haptic('impact', 'medium');
      submitInlineForm();
    };
    btn.onClick(lastMainHandler);
    btn.show();

    if (secBtn) {
      secBtn.text = 'Cancel';
      lastSecHandler = () => {
        haptic('impact', 'light');
        if (selectedTask) {
          navigateTo('detail', selectedTask);
        } else {
          navigateTo('list');
        }
      };
      secBtn.onClick(lastSecHandler);
      secBtn.show();
    }
  }
}

// ─── Render: Task List ───────────────────────────────────────────

function renderTasks(tasks) {
  const container = document.getElementById('task-list');
  const count = document.getElementById('task-count');

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="loading">No tasks found. Create one!</div>';
    count.textContent = '';
    return;
  }

  container.innerHTML = tasks.map(renderTaskCard).join('');

  // Attach click handlers for task cards in Telegram mode
  if (isTelegram) {
    container.querySelectorAll('.task-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        // Don't navigate if user clicked an action button
        if (e.target.closest('.task-actions')) return;
        const taskId = card.dataset.taskId;
        if (!taskId) return;
        haptic('selection');
        try {
          const task = await apiGet(`/${taskId}`);
          navigateTo('detail', task);
        } catch (err) {
          showAlert('Error: ' + err.message);
        }
      });
    });
  }

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

  // In Telegram mode, action buttons are handled via BottomButton in detail view
  const actions = isTelegram ? '' : (isDone
    ? `<div class="task-actions"><button class="btn-danger" onclick="onDelete('${task.id}')">Delete</button></div>`
    : `<div class="task-actions">
        <button class="btn-success" onclick="onComplete('${task.id}')">✅ Complete</button>
        ${task.status === 'OPEN' || task.status === 'BLOCKED' ? `<button class="btn-info" onclick="onClaim('${task.id}')">🙋 Claim</button>` : ''}
        ${task.status === 'BLOCKED' ? `<button class="btn-warning" onclick="onResume('${task.id}')">▶️ Resume</button>` : ''}
        ${task.status === 'IN_PROGRESS' ? `<button class="btn-blocked" onclick="onPause('${task.id}')">⏸ Pause</button>` : ''}
        <button class="btn-ghost" onclick="onEdit('${task.id}')">✏️ Edit</button>
        <button class="btn-danger" onclick="onDelete('${task.id}')">Delete</button>
      </div>`);

  return `
    <div class="task-card${isTelegram ? ' tg-clickable' : ''}" data-task-id="${task.id}">
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
      ${actions}
    </div>
  `;
}

// ─── Render: Detail View ─────────────────────────────────────────

function renderDetailView(task) {
  if (!task) return;
  const el = document.getElementById('task-detail');

  const typeBadge = `<span class="badge badge-type-${task.type.toLowerCase()}">${task.type}</span>`;
  const statusBadge = `<span class="badge badge-status-${task.status.toLowerCase().replace('_', '-')}">${formatStatus(task.status)}</span>`;
  const priorityBadge = `<span class="badge badge-priority-${task.priority.toLowerCase()}">${formatPriority(task.priority)} ${task.priority}</span>`;
  const assigneeBadge = task.assignedTo
    ? `<span class="badge badge-assignee">👤 ${task.assignedTo}</span>`
    : '';

  const blockedInfo = task.blockedBy && task.blockedBy.length > 0
    ? `<div class="detail-section"><div class="detail-label">Blocked By</div><div class="task-depends">🚫 ${task.blockedBy.join(', ')} — ${task.blockedReason || 'dependencies not met'}</div></div>`
    : '';

  const dependsInfo = task.dependsOn && task.dependsOn.length > 0
    ? `<div class="detail-section"><div class="detail-label">Dependencies</div><div class="task-depends">📎 ${task.dependsOn.join(', ')}</div></div>`
    : '';

  const promptInfo = task.prompt
    ? `<div class="detail-section"><div class="detail-label">Prompt / Notes</div><div class="detail-prompt">${escapeHtml(task.prompt)}</div></div>`
    : '';

  const claimedInfo = task.claimedBy
    ? `<div class="detail-meta-item"><span class="detail-label">Claimed by:</span> ${escapeHtml(task.claimedBy)}${task.claimedAt ? ' · ' + formatDate(task.claimedAt) : ''}</div>`
    : '';

  const completedInfo = task.completedBy
    ? `<div class="detail-meta-item"><span class="detail-label">Completed by:</span> ${escapeHtml(task.completedBy)}${task.completedAt ? ' · ' + formatDate(task.completedAt) : ''}</div>`
    : '';

  const isDone = ['COMPLETED', 'CANCELLED'].includes(task.status);

  // Non-Telegram: show action buttons inline
  const actions = isTelegram ? '' : `
    <div class="detail-actions">
      ${!isDone ? `<button class="btn btn-primary" onclick="onEdit('${task.id}')">✏️ Edit</button>` : ''}
      ${!isDone && (task.status === 'OPEN' || task.status === 'BLOCKED') ? `<button class="btn btn-info" onclick="onClaim('${task.id}')">🙋 Claim</button>` : ''}
      ${!isDone && task.status === 'IN_PROGRESS' ? `<button class="btn btn-success" onclick="onComplete('${task.id}')">✅ Complete</button>` : ''}
      ${!isDone && task.status === 'BLOCKED' ? `<button class="btn btn-warning" onclick="onResume('${task.id}')">▶️ Resume</button>` : ''}
      ${!isDone && task.status === 'IN_PROGRESS' ? `<button class="btn btn-blocked" onclick="onPause('${task.id}')">⏸ Pause</button>` : ''}
      <button class="btn btn-danger" onclick="onDelete('${task.id}')">🗑 Delete</button>
      <button class="btn btn-ghost" onclick="navigateTo('list'); loadTasks();">← Back</button>
    </div>`;

  el.innerHTML = `
    <div class="detail-card">
      <div class="detail-header">
        <h2 class="detail-title">${escapeHtml(task.title)}</h2>
        <div class="task-id">${task.id}</div>
      </div>
      <div class="task-meta">
        ${typeBadge} ${statusBadge} ${priorityBadge} ${assigneeBadge}
      </div>
      ${blockedInfo}
      ${dependsInfo}
      ${promptInfo}
      <div class="detail-section detail-timestamps">
        <div class="detail-meta-item"><span class="detail-label">Created:</span> ${formatDate(task.createdAt)}</div>
        ${task.updatedAt ? `<div class="detail-meta-item"><span class="detail-label">Updated:</span> ${formatDate(task.updatedAt)}</div>` : ''}
        ${claimedInfo}
        ${completedInfo}
      </div>
      ${actions}
    </div>
  `;

  // In Telegram mode, add edit button as a tappable area
  if (isTelegram && !isDone) {
    const editRow = document.createElement('div');
    editRow.className = 'detail-edit-row';
    editRow.innerHTML = '<button class="btn btn-ghost detail-edit-btn">✏️ Edit Task</button>';
    editRow.querySelector('button').addEventListener('click', () => {
      haptic('impact', 'light');
      navigateTo('form', task);
    });
    el.querySelector('.detail-card').appendChild(editRow);
  }
}

// ─── Inline Form (Telegram mode) ────────────────────────────────

function populateInlineForm(task) {
  const titleEl = document.getElementById('form-view-title');
  editingId = task ? task.id : null;
  titleEl.textContent = task ? `Edit ${task.id}` : 'New Task';

  document.getElementById('inline-task-id').value = task ? task.id : '';
  document.getElementById('inline-task-title').value = task ? task.title : '';
  document.getElementById('inline-task-prompt').value = task ? (task.prompt || '') : '';
  document.getElementById('inline-task-type').value = task ? task.type : 'TASK';
  document.getElementById('inline-task-priority').value = task ? task.priority : 'MEDIUM';
  document.getElementById('inline-task-assignee').value = task ? (task.assignedTo || '') : '';
  document.getElementById('inline-task-depends').value = task ? (task.dependsOn || []).join(', ') : '';
}

async function submitInlineForm() {
  const dependsRaw = document.getElementById('inline-task-depends').value;
  const dependsOn = dependsRaw
    ? dependsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const title = document.getElementById('inline-task-title').value.trim();
  if (!title) {
    showAlert('Title is required');
    return;
  }

  const payload = {
    title,
    prompt: document.getElementById('inline-task-prompt').value.trim(),
    type: document.getElementById('inline-task-type').value,
    priority: document.getElementById('inline-task-priority').value,
    assignedTo: document.getElementById('inline-task-assignee').value.trim(),
    dependsOn,
  };

  try {
    if (editingId) {
      await apiPut(`/${editingId}`, payload);
      haptic('notification', 'success');
    } else {
      await apiPost('/', payload);
      haptic('notification', 'success');
    }
    editingId = null;
    navigateTo('list');
    await loadTasks();
  } catch (err) {
    haptic('notification', 'error');
    showAlert('Error: ' + err.message);
  }
}

// ─── Actions ─────────────────────────────────────────────────────

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
    const task = await apiPost(`/${id}/complete`, {});
    haptic('notification', 'success');
    sendActionToBot('completed', id, task.title || selectedTask?.title || id);
    if (currentView === 'detail') {
      navigateTo('list');
    }
    await loadTasks();
  } catch (err) {
    haptic('notification', 'error');
    showAlert('Error: ' + err.message);
  }
}

async function onClaim(id) {
  try {
    const assignee = getTelegramUsername();
    const task = await apiPost(`/${id}/claim`, { assignee });
    haptic('notification', 'success');
    sendActionToBot('claimed', id, task.title || selectedTask?.title || id);
    if (currentView === 'detail') {
      navigateTo('list');
    }
    await loadTasks();
  } catch (err) {
    haptic('notification', 'error');
    showAlert('Error: ' + err.message);
  }
}

async function onResume(id) {
  try {
    await apiPut(`/${id}`, { status: 'IN_PROGRESS' });
    haptic('notification', 'success');
    if (currentView === 'detail') {
      const task = await apiGet(`/${id}`);
      selectedTask = task;
      renderDetailView(task);
      updateTelegramButtons();
    }
    await loadTasks();
  } catch (err) {
    haptic('notification', 'error');
    showAlert('Error: ' + err.message);
  }
}

async function onPause(id) {
  try {
    await apiPut(`/${id}`, { status: 'BLOCKED' });
    haptic('notification', 'success');
    if (currentView === 'detail') {
      const task = await apiGet(`/${id}`);
      selectedTask = task;
      renderDetailView(task);
      updateTelegramButtons();
    }
    await loadTasks();
  } catch (err) {
    haptic('notification', 'error');
    showAlert('Error: ' + err.message);
  }
}

async function onDelete(id) {
  confirmAction(`Delete ${id}?`, async (confirmed) => {
    if (!confirmed) return;
    try {
      await apiDelete(`/${id}`);
      haptic('impact', 'heavy');
      const title = selectedTask?.title || id;
      sendActionToBot('deleted', id, title);
      if (currentView === 'detail') {
        navigateTo('list');
      }
      await loadTasks();
    } catch (err) {
      haptic('notification', 'error');
      showAlert('Error: ' + err.message);
    }
  });
}

// ─── Add / Edit Modal (non-Telegram fallback) ───────────────────

function openModal(task = null) {
  const modal = document.getElementById('task-modal');
  const title = document.getElementById('modal-title');

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
    if (isTelegram) {
      navigateTo('form', task);
    } else {
      openModal(task);
    }
  } catch (err) { showAlert('Error: ' + err.message); }
}

async function onAddClick() {
  if (isTelegram) {
    navigateTo('form');
  } else {
    openModal();
  }
}

// Modal form submission (non-Telegram)
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
  } catch (err) { showAlert('Error: ' + err.message); }
});

document.getElementById('btn-add-task').addEventListener('click', onAddClick);
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
document.querySelector('.modal-backdrop').addEventListener('click', closeModal);

// ─── Filters ─────────────────────────────────────────────────────

function applyFilters() {
  haptic('selection');
  currentFilters = {
    status: document.getElementById('filter-status').value,
    priority: document.getElementById('filter-priority').value,
    assignee: document.getElementById('filter-assignee').value.trim(),
  };
  savePreference('filter_status', currentFilters.status || '');
  savePreference('filter_priority', currentFilters.priority || '');
  savePreference('filter_assignee', currentFilters.assignee || '');
  loadTasks();
}

function clearFilters() {
  haptic('selection');
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-priority').value = '';
  document.getElementById('filter-assignee').value = '';
  currentFilters = {};
  savePreference('filter_status', '');
  savePreference('filter_priority', '');
  savePreference('filter_assignee', '');
  loadTasks();
}

document.getElementById('btn-apply-filters').addEventListener('click', applyFilters);
document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);

// ─── Utils ───────────────────────────────────────────────────────

function formatStatus(s) {
  return { OPEN: '🔵 Open', IN_PROGRESS: '🟡 In Progress', BLOCKED: '🟠 Blocked', COMPLETED: '✅ Done', CANCELLED: '❌ Cancelled' }[s] || s;
}

function formatPriority(p) {
  return { HIGH: '🚨', MEDIUM: '⚠️', LOW: '📌' }[p] || '📌';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch (_) { return dateStr; }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Init ────────────────────────────────────────────────────────

async function init() {
  // Restore saved filters
  const savedStatus = await loadPreference('filter_status');
  const savedPriority = await loadPreference('filter_priority');
  const savedAssignee = await loadPreference('filter_assignee');

  if (savedStatus) {
    document.getElementById('filter-status').value = savedStatus;
    currentFilters.status = savedStatus;
  }
  if (savedPriority) {
    document.getElementById('filter-priority').value = savedPriority;
    currentFilters.priority = savedPriority;
  }
  if (savedAssignee) {
    document.getElementById('filter-assignee').value = savedAssignee;
    currentFilters.assignee = savedAssignee;
  }

  navigateTo('list');
  await loadTasks();
}

init();
