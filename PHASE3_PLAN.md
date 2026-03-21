# Phase 3 Plan - Interactive UI & Enhanced Features

**Date:** 2026-03-20
**Status:** Planning
**Previous:** Phase 2 (Agent delegation and task claiming) - Complete and tagged as v0.2.0

---

## 🎯 Phase 3 Objectives

### Primary Goals

1. **Interactive UI** - Replace text-based commands with Telegram inline keyboards (buttons)
2. **Task Dependencies** - Auto-blocking/unblocking logic with dependency validation
3. **Task Prioritization** - Add priority field and sort tasks by priority
4. **Multi-Source Ingestion** - Integrate with Mem0, Obsidian, project manager skill

### Success Criteria

- ✅ Telegram inline keyboards for all major operations (claim, complete, edit, delete)
- ✅ Dependency management - blocked tasks auto-unblock when prerequisites complete
- ✅ Priority system - tasks sorted by priority (HIGH, MEDIUM, LOW)
- ✅ Multi-source integration - tasks can be imported from Mem0, Obsidian, project manager
- ✅ Task queue optimization - faster task discovery and filtering
- ✅ Tagged as v0.3.0
- ✅ Documentation updated (README.md, SKILL.md, AGENTS.md)

---

## 🏗️ Feature 1: Interactive UI (Inline Keyboards)

### Overview

Replace text-based slash commands with **TRUE interactive Telegram menus** for faster, more intuitive task management.

**Key Requirement (Updated 2026-03-20):**
User wants **clickable tasks** like the `/models` picker UI — not static TUI display with emoji hints.

When a user clicks on a task:
- Show interactive menu with available actions (claim, complete, edit, pause, delete)
- Actions should be selectable via tap/click (not just copy-pasting commands)
- Similar UX to `/models` command where user selects from interactive picker

**NOT:**
- ❌ Static TUI-style display with emoji hints only
- ❌ Text-based command shortcuts that must be manually typed

**YES:**
- ✅ Clickable task buttons that open action menus
- ✅ Interactive selection (like `/models` picker)
- ✅ Callback-driven actions (tap → action executes)

### Implementation Strategy

#### 1.1 Inline Keyboard Architecture

**Telegram Callback Queries:**
- Use `callback_query` to identify button presses
- Button format: `callback_data` with prefix: `tm:<action>:<taskId>`
- Parse callback on button press and execute corresponding action
- Show inline keyboard below task list

**Supported Actions:**
- **Claim:** Button to claim OPEN task
- **Complete:** Button to mark task as COMPLETED
- **Pause:** Button to mark task as BLOCKED
- **Edit:** Button to open edit form (ask for new title, prompt)
- **Delete:** Button to delete task with confirmation
- **Unassign:** Button to remove assignee
- **Assign:** Button to open assign form (select agent)

#### 1.2 Keyboard Layout

**Task Display Format:**
```
📋 TASK task_001: "Test complete command"
  Status: ⏸️ OPEN
  Prompt: Test completing a task

[🎯 Claim] [✏️ Edit] [✅ Complete] [⏸️ Pause] [🗑️ Delete]
```

**Button Grid Layout:**
```
[[🎯 Claim], [✏️ Edit]]
[✅ Complete], [⏸️ Pause]
[🗑️ Delete], [❌ Unassign]
```

#### 1.3 Implementation Tasks

**1. Add inline keyboard support to `handleTasksCommand()`**
   - Parse callback queries from incoming messages
   - Map callback_data to task operations
   - Execute corresponding CRUD operations
   - Return updated task display with fresh keyboard

**2. Add callback handler to plugin API**
   - Register callback query handler in plugin
   - Parse `callback_query` and route to appropriate action
   - Update task in tasks.json
   - Send updated display as edit message (to refresh keyboard)

**3. Update `buildUsage()` to document keyboard shortcuts**

**4. Test button flows:**
   - Click "Claim" → task status changes to IN_PROGRESS
   - Click "Complete" → task status changes to COMPLETED
   - Click "Edit" → Prompt for new title/prompt via edit
   - Click "Delete" → Delete task with confirmation

#### 1.4 Edge Cases

**Concurrent editing:**
- If agent claims task via button AND another user edits via text, handle race condition
- Use `updatedAt` timestamp to determine which edit wins (last write wins)

**Permission checks:**
- Only task assignee or original creator can claim/complete/delete
- Unprivileged users can only view tasks (read-only mode)

---

## 🏗️ Feature 2: Task Dependencies

### Overview

Implement dependency-based task blocking and auto-unblocking. When a task depends on other tasks, it cannot start until all prerequisites are COMPLETED.

### Implementation Strategy

#### 2.1 Dependency Data Model

**Schema Updates:**
```typescript
interface Task {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  prompt: string;
  assignedTo: string;
  dependsOn: string[];  // Array of task IDs this task depends on
  dependsOn?: string[];  // Already exists in Phase 2

  // New fields for Phase 3:
  blockedBy?: string[];      // List of task IDs blocking this task
  blockedReason?: string;   // Human-readable reason why blocked
  priority?: TaskPriority;  // Task priority (HIGH, MEDIUM, LOW)
}
```

#### 2.2 Dependency Validation

**Add `validateDependencies(task, allTasks)` function:**
- Check all `dependsOn` IDs exist in task list
- Prevent circular dependencies (A depends on B depends on A)
- Warn if dependency is already COMPLETED (task should be blocked but unblockable)
- Validate task types match expected types

**Auto-Blocking Logic:**
- When task is marked OPEN/IN_PROGRESS, check if all dependencies are COMPLETED
- If all dependencies COMPLETED → Allow task to start
- If any dependency not COMPLETED → Auto-block task (status: BLOCKED)
- Update task's `blockedBy` field with blocking task IDs
- Set `blockedReason` based on dependency status

**Auto-Unblocking Logic:**
- Monitor task completion events
- When a task completes, check all tasks it blocks
- If all dependencies are now COMPLETED → Unblock dependent tasks
- Update blocked task status from BLOCKED to OPEN
- Clear `blockedBy` field (dependencies no longer blocking)
- Send notification to assignee if needed

#### 2.3 Dependency Display

**Format Task Display:**
```
📋 TASK task_001: "Test complete command"
  Status: ⏸️ OPEN
  Depends on: task_002 (⏸️ BLOCKED)
  Blocked by: task_002 (pending task_005)
  Priority: 🚨 HIGH

Actions: [🎯 Claim] [✏️ Edit] [✅ Complete] [⏸️ Pause] [🗑️ Delete]
```

**Blocked Task List Command:**
- `/tasks blocked` - Show all BLOCKED tasks with dependency chain
- `/task unblock task_001` - Force unblock (for admin)

#### 2.4 Implementation Tasks

**1. Extend `addTask()` to validate dependencies:**
   - Check all dependsOn IDs exist
   - Prevent circular dependencies
   - Initialize `blockedBy: []` and `blockedReason: ""` for new tasks

**2. Add `getBlockingTasks(taskId)` function:**
   - Return array of task IDs that depend on this task
   - Used for display and dependency chain analysis

**3. Update `completeTask()` to trigger unblocking:**
   - Mark task as COMPLETED
   - Check `getBlockingTasks(taskId)` to find dependent tasks
   - For each dependent task, re-validate dependencies
   - If all dependencies COMPLETED → Update status from BLOCKED to OPEN
   - Clear `blockedBy` and `blockedReason`

**4. Add `/tasks blocked` command to plugin:**
   - Show all tasks with status BLOCKED
   - Display dependency chain
   - Show blocking reasons and dependencies

---

## 🏗️ Feature 3: Task Prioritization

### Overview

Add priority field to tasks with sortable ordering. Tasks are sorted by priority, then by ID.

### Implementation Strategy

#### 3.1 Priority Data Model

**TaskPriority Enum:**
```typescript
type TaskPriority = "HIGH" | "MEDIUM" | "LOW";
```

**Schema Updates:**
```typescript
interface Task {
  // ... existing fields ...
  priority?: TaskPriority;  // New for Phase 3

  // Defaults for backward compatibility:
  priority?: "MEDIUM"  // Default priority if not specified
}
```

#### 3.2 Priority Sorting

**Add `sortTasks(tasks)` function:**
```typescript
function sortTasks(tasks) {
  const PRIORITY_ORDER: Record<TaskPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    LOW: 2,
  };

  return [...tasks].sort((left, right) => {
    // Primary sort: Priority
    const leftPriority = PRIORITY_ORDER[left.priority || "MEDIUM"] ?? 3;
    const rightPriority = PRIORITY_ORDER[right.priority || "MEDIUM"] ?? 3;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    // Secondary sort: Task ID (lexicographic)
    return left.id.localeCompare(right.id);
  });
}
```

**Update `formatTaskList()` to use `sortTasks()`:**
- Apply sorting before filtering/display
- Show priority indicators: 🚨 HIGH, ⚠️ MEDIUM, 📌 LOW

#### 3.3 Priority Display

**Task Display Format with Priority:**
```
🚨 HIGH  TASK task_001: "Urgent bug fix"
  Status: ⏸️ OPEN
  Priority: HIGH

Actions: [🎯 Claim] [✅ Complete]
```

**Priority Keyboard (Task Creation):**
- Create buttons for priority selection: [🚨 HIGH] [⚠️ MEDIUM] [📌 LOW]
- Callback sets priority in `/task add`

#### 3.4 Implementation Tasks

**1. Update `addTask()` to accept optional `priority`:**
   - Default to "MEDIUM" if not specified
   - Validate against "HIGH", "MEDIUM", "LOW"
   - Include in task serialization

**2. Update `/task add` command:**
   - Add `--priority` flag support
   - Usage: `/task add "Title" --prompt "..." --priority HIGH`

**3. Add `/tasks --priority` command:**
   - Filter and sort by priority
   - Usage: `/tasks --priority HIGH` or `/tasks priority-low`

**4. Update priority in `edit` and `assign` commands:**
   - Allow changing priority when editing
   - Allow setting priority when reassigning

---

## 🏗️ Feature 4: Multi-Source Integration

### Overview

Enable task ingestion from multiple sources to populate the task queue automatically or on-demand.

### Implementation Strategy

#### 4.1 Source Interfaces

**Mem0 Integration:**
- Create `Mem0 → Task Manager` ingest function
- Query Mem0 for relevant memories tagged with `#task` or `#todo`
- Import as OPEN tasks assigned to relevant agents
- Map Mem0 content to task fields (title = memory text, prompt = full context)

**Obsidian Integration:**
- Create `Obsidian → Task Manager` ingest function
- Parse Obsidian markdown files for task keywords (`TODO:`, `FIX:`, `EPIC:`)
- Extract task title, body, tags
- Import as OPEN tasks with appropriate type (TODO → TASK, EPIC → EPIC)

**Project Manager Skill Integration:**
- Enable existing project manager skill to push tasks to Task Manager queue
- Create bridge between project manager's task format and Task Manager schema
- Support manual push: `/task import --source project-manager`

#### 4.2 Ingestion Commands

**`/task import --source <source>`** - Import tasks from source
- Sources: `mem0`, `obsidian`, `project-manager`
- Options:
  - `--agent <agentId>` - Assign imported tasks to specific agent
  - `--type <type>` - Override task type inference

**`/tasks importable`** - List supported import sources
- Show which sources are configured and available

#### 4.3 Implementation Tasks

**1. Create ingest functions in tasks.js:**
   - `importFromMem0(options)` - Query and import from Mem0
   - `importFromObsidian(options)` - Parse and import from Obsidian
   - `importFromProjectManager(options)` - Bridge to project manager skill

**2. Add `/task import` command to plugin:**
   - Parse source (mem0/obsidian/project-manager)
   - Parse optional flags (--agent, --type)
   - Call appropriate ingest function
   - Return import summary (X tasks created, Y updated, Z failed)

**3. Add configuration for source directories:**
   - Obsidian vault path (config setting)
   - Project manager workspace path (config setting)

**4. Add ingest mode to session hooks:**
   - Optional: Auto-import tasks when agent session starts
   - Source-specific hooks can register for automatic ingestion

---

## 📋 Implementation Roadmap

### Phase 3.1: Interactive UI
**Tasks:**
- [ ] Add callback query handler to plugin API
- [ ] Implement inline keyboard for all task operations
- [ ] Add button grid layout (Claim, Edit, Complete, Pause, Delete)
- [ ] Test keyboard interaction flows
- [ ] Handle concurrent editing (race conditions)
- [ ] Add permission checks (read-only mode)
- **Estimated time:** 6-8 hours

### Phase 3.2: Task Dependencies
**Tasks:**
- [ ] Add `blockedBy` and `blockedReason` fields to schema
- [ ] Implement dependency validation function
- [ ] Implement auto-blocking logic (mark as BLOCKED)
- [ ] Implement auto-unblocking logic (BLOCKED → OPEN)
- [ ] Add `/tasks blocked` command
- [ ] Test dependency chains (A → B → C → unblocks B, C)
- **Estimated time:** 4-6 hours

### Phase 3.3: Task Prioritization
**Tasks:**
- [ ] Add TaskPriority enum (HIGH, MEDIUM, LOW)
- [ ] Implement priority sorting function
- [ ] Add priority display indicators (🚨, ⚠️, 📌)
- [ ] Update `/task add` to support `--priority` flag
- [ ] Add `/tasks --priority` command
- [ ] Test priority sorting and filtering
- **Estimated time:** 3-4 hours

### Phase 3.4: Multi-Source Integration
**Tasks:**
- [ ] Implement Mem0 import function
- [ ] Implement Obsidian parser
- [ ] Implement project manager bridge
- [ ] Add `/task import` command
- [ ] Add source configuration (paths, auto-import settings)
- [ ] Test import flows from all sources
- **Estimated time:** 6-8 hours

### Phase 3.5: Testing & Documentation
**Tasks:**
- [ ] Write comprehensive test suite (inline keyboards, dependencies, priorities, imports)
- [ ] Test all Phase 3 features end-to-end
- [ ] Update README.md with Phase 3 features
- [ ] Update SKILL.md with Phase 3 command examples
- [ ] Tag as v0.3.0
- [ ] Update AGENTS.md with Phase 3 status
- **Estimated time:** 4-6 hours

---

## 🎯 Total Estimated Time

**Phase 3.1 (Interactive UI):** 6-8 hours
**Phase 3.2 (Dependencies):** 4-6 hours
**Phase 3.3 (Prioritization):** 3-4 hours
**Phase 3.4 (Multi-Source):** 6-8 hours
**Phase 3.5 (Testing & Docs):** 4-6 hours

**Total Phase 3: 23-32 hours (approximately 3-4 days of focused work)

---

## 🔧 Technical Notes

### Telegram Inline Keyboard API

**Inline Button Format:**
```typescript
const keyboard = {
  inline_keyboard: true,
  buttons: [
    [
      [
        { text: "🎯 Claim", callback_data: "tm:claim:task_001" },
        { text: "✏️ Edit", callback_data: "tm:edit:task_001" }
      ],
      [
        { text: "✅ Complete", callback_data: "tm:complete:task_001" },
        { text: "⏸️ Pause", callback_data: "tm:pause:task_001" }
      ],
      [
        { text: "🗑️ Delete", callback_data: "tm:delete:task_001" },
        { text: "❌ Unassign", callback_data: "tm:unassign:task_001" }
      ]
    ]
};
```

**Callback Parser:**
```typescript
function parseCallback(data: string) {
  const [action, taskId] = data.split(":");
  return { action, taskId };
}
```

### Dependency Chain Visualization

**Example Task Chain:**
```
task_001: "Setup project" (COMPLETED)
  └─> task_002: "Configure build" (OPEN, blocked by: task_001)

task_003: "Write tests" (OPEN, blocked by: task_002)

task_004: "Deploy to production" (OPEN, blocked by: task_003)
```

### Priority Sorting Algorithm

**Primary sort:** Priority (HIGH → MEDIUM → LOW)
**Secondary sort:** Task ID (lexicographic) for tiebreaking

**Result:** Users see most important tasks first, organized and actionable.

---

## 📊 Migration Path

### Backward Compatibility

- All Phase 3 fields are optional
- Existing tasks without new fields continue to work
- Default priority: MEDIUM for tasks created before Phase 3
- Default status: OPEN for imported tasks

### Data Migration

No migration script required:
- Schema is additive (new fields only added)
- Existing tasks validated on read/load
- Tasks missing priority field default to MEDIUM

---

## 🚀 Success Criteria

### Phase 3.1: Interactive UI
- ✅ Telegram inline keyboards for claim, complete, edit, pause, delete, unassign, assign
- ✅ Callback query handler implemented and tested
- ✅ Permission checks enforced (assignee/creator only)
- ✅ Concurrent editing handled correctly
- ✅ Button layouts match UX spec

### Phase 3.2: Task Dependencies
- ✅ Dependency validation prevents circular references
- ✅ Auto-blocking marks tasks as BLOCKED when prerequisites incomplete
- ✅ Auto-unblocking moves tasks from BLOCKED → OPEN when dependencies complete
- ✅ `/tasks blocked` command displays dependency chains
- ✅ Dependency visualization shows blocking reasons

### Phase 3.3: Task Prioritization
- ✅ Priority field added to all task operations
- ✅ Tasks sorted by priority in all views
- ✅ Priority indicators displayed (🚨, ⚠️, 📌)
- ✅ `/tasks --priority` command filters and sorts
- ✅ Default priority (MEDIUM) for tasks without priority

### Phase 3.4: Multi-Source Integration
- ✅ Mem0 import function queries and imports tagged tasks
- ✅ Obsidian parser extracts tasks from markdown files
- ✅ Project manager bridge ingests and pushes tasks
- ✅ `/task import` command supports all three sources
- ✅ Configuration for source directories and auto-import settings
- ✅ Import summary reports (created, updated, failed)

### Phase 3.5: Testing & Documentation
- ✅ Comprehensive test suite covers all Phase 3 features
- ✅ All tests passing (inline keyboards, dependencies, priorities, imports)
- ✅ README.md updated with Phase 3 documentation
- ✅ SKILL.md updated with Phase 3 command examples
- ✅ AGENTS.md updated with Phase 3 status
- ✅ Tagged as v0.3.0

---

## 📝 Next Steps

After Phase 3 completion:

1. **Phase 4 (Optional):** Enhanced task operations
   - Task templates (recurring tasks, task bundles)
   - Advanced filtering and search (by assignee, type, status, date range)
   - Task archiving (move completed tasks to archive)
   - Task analytics (completion time tracking, agent productivity metrics)

2. **Performance Optimization:**
   - Task caching for faster discovery
   - Database migration (from JSON to SQLite for better query performance)
   - Incremental task updates (reduce file I/O)

3. **Integrations:**
   - Calendar integration (tasks with due dates)
   - Email integration (task notifications via email)
   - Slack integration (task commands via slash commands)

---

## 💡 Lessons Learned from Phase 2

1. **Hooks don't fire for subagent contexts**
   - Session hooks (session_start, before_agent_start) only work for direct agent sessions
   - Subagents are spawned with isolated context and don't receive hook events
   - **Workaround:** Agents must run `/tasks` manually to discover their work
   - **Decision:** Keep current behavior, document limitation in README.md

2. **Git workflow matters**
   - Direct commits to main skip formal code review process
   - Future phases should use feature branches and PR flow
   - Documented in AGENTS.md as standard workflow

3. **Test automation is critical**
   - Comprehensive test suite catches issues early
   - All tests passing gives confidence for production deployment
   - Test coverage should be increased with each phase

---

**Ready for Phase 3 implementation!** 🚀
