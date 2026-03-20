# Phase 2 Plan - Agent Delegation & Task Claiming

**Date:** 2026-03-20
**Status:** Planning
**Phase:** 2 - Agent Integration

---

## 🎯 Phase 2 Objectives

### Primary Goals

1. **Automatic Task Discovery** - Agents automatically discover their assigned tasks on session start
2. **Task Claiming Mechanism** - Agents can "claim" a task to mark work in progress
3. **Prompt Auto-Injection** - Task prompts injected into agent context automatically
4. **Enhanced Task Operations** - Edit, unassign, reassign tasks
5. **Interactive UI** (optional) - Telegram inline keyboards for faster task management

### Success Criteria

- ✅ Agent sessions automatically see their OPEN tasks on start
- ✅ Agents can claim tasks via `/task claim task_001`
- ✅ Task status changes to IN_PROGRESS when claimed
- ✅ Task prompts are visible in agent context
- ✅ Task completion marks it as COMPLETED automatically
- ✅ Agents can edit, unassign, and reassign tasks

---

## 🏗️ Architecture Design

### 1. Session Hook Integration

**Key Discovery:** OpenClaw supports session lifecycle hooks via `registerHook()` API:

- `session:start` - Fired when a new agent session begins
- `session:end` - Fired when a session ends

**Implementation:**

```typescript
// In task-manager plugin
export default function (api: OpenClawPluginApi) {
  // Register session start hook
  api.registerHook("session:start", async (ctx) => {
    const { agentId, sessionKey, sessionId } = ctx;

    // Only proceed if this is an agent session with a known ID
    if (!agentId || !["planner", "coder", "albert"].includes(agentId)) {
      return;
    }

    // Query tasks assigned to this agent
    const { readTasks } = getTasksModule();
    const tasks = readTasks()
      .filter(t => t.assignedTo === agentId && t.status === "OPEN");

    if (tasks.length === 0) {
      return;
    }

    // Inject task discovery message into session
    // This makes agents aware of their pending work without manual /tasks command
    return {
      message: formatTaskDiscovery(agentId, tasks)
    };
  });
}
```

**Context Available in Hook:**
- `agentId` - Which agent is running (e.g., "coder")
- `sessionKey` - Session identifier
- `sessionId` - Ephemeral session UUID

### 2. Task Discovery Format

When an agent session starts, the hook will inject a formatted message:

```
📋 You have OPEN tasks assigned to you:

📄 TASK task_001: "test task manager"
  Prompt: investigate the new setup, see if it's actually using telegram mini app architecture vs text bot commands
  Actions: /task claim task_001 | /task complete task_001 | /task pause task_001

📄 TASK task_003: "Test complete command"
  Prompt: Test completing a task
  Actions: /task claim task_001 | /task complete task_001 | /task pause task_001
```

### 3. Task Claiming Command

**New command:** `/task claim task_001`

**Behavior:**
- Updates task status to `IN_PROGRESS`
- Records which agent claimed it and when
- Only agents matching the task's `assignedTo` can claim it
- Adds `claimedAt` timestamp and `claimedBy` field to task

**Implementation:**

```typescript
async function handleTaskClaimCommand(ctx: PluginCommandContext, taskId: string, agentId: string) {
  const { updateTask, readTasks } = getTasksModule();

  // Verify task exists
  const task = readTasks().find(t => t.id === taskId);
  if (!task) {
    return { text: `Task not found: ${taskId}` };
  }

  // Verify assignee matches
  if (task.assignedTo !== agentId) {
    return { text: `Task ${taskId} is assigned to ${task.assignedTo}, not ${agentId}` };
  }

  // Verify task is OPEN
  if (task.status !== "OPEN") {
    return { text: `Task ${taskId} is already ${task.status}` };
  }

  // Claim task
  const updated = updateTask(taskId, {
    status: "IN_PROGRESS",
    claimedBy: agentId,
    claimedAt: new Date().toISOString(),
  });

  return {
    text: `✅ Claimed ${updated.id} -> ${STATUS_LABELS.IN_PROGRESS}\n\n${formatTask(updated)}`
  };
}
```

### 4. Enhanced Task Operations

**New Commands:**

1. `/task edit task_001 --title "New title" --prompt "New prompt" --type TASK`
   - Update any field of an existing task
   - All fields optional, only update what's provided

2. `/task unassign task_001`
   - Clear the `assignedTo` field (back to unassigned pool)
   - Reset status to OPEN if not already

3. `/task assign task_001 --assignee coder`
   - Reassign task to a different agent
   - Keep current status (OPEN, IN_PROGRESS, BLOCKED, etc.)

4. `/task claim task_001`
   - Mark task as IN_PROGRESS and record claim metadata

**Implementation:**

```typescript
async function handleTaskEditCommand(ctx: PluginCommandContext) {
  const args = tokenizeArgs(ctx.args || "");
  const action = args.shift()?.toLowerCase();

  if (action !== "edit") {
    return { text: "Usage: /task edit task_001 --title \"...\" --prompt \"...\"" };
  }

  const taskId = args.shift();
  const { options } = parseOptions(args);

  const { updateTask } = getTasksModule();
  const updated = updateTask(taskId, {
    title: options.title,
    prompt: options.prompt,
    type: options.type?.toUpperCase(),
    assignedTo: options.assignee,
  });

  return { text: `Updated ${updated.id}\n${formatTask(updated)}` };
}
```

### 5. Task Schema Extensions

**New Fields Added:**

```json
{
  "id": "task_001",
  "type": "TASK",
  "title": "string",
  "status": "OPEN",
  "prompt": "string",
  "assignedTo": "coder",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "dependsOn": [],
  "claimedBy": "coder",           // NEW: Agent who claimed the task
  "claimedAt": "ISO 8601 timestamp", // NEW: When task was claimed
  "completedBy": "coder",           // NEW: Agent who completed the task
  "completedAt": "ISO 8601 timestamp" // NEW: When task was completed
}
```

### 6. Auto-Completion Tracking

**When agent completes a task:**

```typescript
async function handleTaskCompleteCommand(ctx: PluginCommandContext, taskId: string, agentId: string) {
  const { updateTaskStatus } = getTasksModule();

  const task = updateTaskStatus(taskId, "COMPLETED");
  // Extend to track completion metadata
  const updated = updateTask(taskId, {
    completedBy: agentId,
    completedAt: new Date().toISOString(),
  });

  return { text: `✅ Completed ${updated.id} by ${agentId}` };
}
```

---

## 📝 Implementation Tasks

### Phase 2.1 - Session Hooks (Priority 1)

- [ ] Research OpenClaw `registerHook()` API thoroughly
- [ ] Test `session:start` hook in development
- [ ] Implement task discovery message format
- [ ] Add agent ID validation (planner, coder, albert)
- [ ] Test hook triggers on agent session start

### Phase 2.2 - Task Claiming (Priority 2)

- [ ] Implement `/task claim task_001` command
- [ ] Add claimedBy and claimedAt fields to schema
- [ ] Implement assignee validation
- [ ] Test claiming flow: OPEN → IN_PROGRESS
- [ ] Update `formatTask()` to show claim status

### Phase 2.3 - Enhanced Operations (Priority 3)

- [ ] Implement `/task edit task_001` command
- [ ] Implement `/task unassign task_001` command
- [ ] Implement `/task assign task_001 --assignee <agent>` command
- [ ] Add task edit validation (non-empty title, valid type)
- [ ] Test all edit/unassign/reassign flows

### Phase 2.4 - Completion Tracking (Priority 4)

- [ ] Add completedBy and completedAt fields
- [ ] Update `/task complete` to track metadata
- [ ] Update `/task delete` to record deletion metadata (optional)
- [ ] Test completion tracking across agents

### Phase 2.5 - Testing & Documentation (Priority 5)

- [ ] Write comprehensive test suite for new commands
- [ ] Test cross-agent scenarios (unassign → reassign)
- [ ] Update README.md with Phase 2 features
- [ ] Update SKILL.md with new command examples
- [ ] Test hook persistence across gateway restarts

---

## 🔍 Research Questions

### Open Questions

1. **Hook Return Values:** What format should `session:start` hook return to inject a message into the agent session?
   - *Investigate:* Hook return format for context injection
   - *Fallback:* Create agent tool that agents call on startup to fetch tasks

2. **Agent ID Detection:** How to reliably detect agent ID in session start hook?
   - *Investigate:* `ctx.agentId` availability in hooks
   - *Fallback:* Use `sessionKey` parsing to extract agent ID

3. **Hook Persistence:** Do hooks survive gateway restarts without re-registration?
   - *Investigate:* Hook registration lifecycle
   - *Plan:* Re-register hooks in plugin `activate()` if needed

4. **Timing Issues:** Should task discovery happen immediately or after agent initialization?
   - *Plan:* Use delay to let agent settle, or use agent tool call pattern

### Alternative Approaches

**If hooks don't support message injection:**

1. **Agent Tool Approach:** Create `fetch_assigned_tasks` tool that agents call on startup
2. **Agent Instruction Injection:** Add task discovery to agent's system prompt
3. **Pre-Flight Check Hook:** Use pre-flight hook to add tasks to agent's working context

---

## 📊 Migration Path

### Backward Compatibility

- All existing Phase 1 commands remain unchanged
- New fields (`claimedBy`, `claimedAt`, `completedBy`, `completedAt`) are optional
- Existing tasks without new fields continue to work
- Hooks are additive, don't break existing functionality

### Data Migration

When upgrading Phase 1 → Phase 2:

1. Back up existing `tasks.json`
2. Add new fields to schema
3. Existing tasks automatically get empty values for new fields on first write
4. No migration script required (schema is additive)

---

## 🎯 Phase 2 Success Metrics

**Quantitative:**
- ✅ 100% of agent sessions discover their tasks automatically
- ✅ Task claim time reduced from manual `/tasks` → automatic detection
- ✅ 0 manual task status updates required by human

**Qualitative:**
- ✅ Agents feel "aware" of their work on session start
- ✅ Task delegation feels natural and low-friction
- ✅ Reduced user babysitting (agents self-manage work)

---

## 🗓️ Timeline Estimate

- **Phase 2.1 (Session Hooks):** 2-3 hours
- **Phase 2.2 (Task Claiming):** 1-2 hours
- **Phase 2.3 (Enhanced Operations):** 2-3 hours
- **Phase 2.4 (Completion Tracking):** 1 hour
- **Phase 2.5 (Testing & Docs):** 2-3 hours

**Total:** 8-12 hours development time

---

**Next Step:** Begin Phase 2.1 - Research `registerHook()` API and implement session start hook
