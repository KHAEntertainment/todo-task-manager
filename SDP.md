# Software Design Document (SDP) — Todo Task Manager

**Version:** 1.0
**Author:** Jean Clawd (planner agent)
**Date:** 2026-03-19
**Status:** Planning Phase

---

## 1. Problem Statement

### Current Situation

Agents wake up fresh each session and lose context. Tasks discussed in prior sessions get forgotten, leading to repeated instructions. Human must "babysit" to ensure agents remember what they're working on.

### Root Causes

1. **No persistent task queue** — Tasks discussed in chat but not saved anywhere
2. **No pre-generated prompts** — Agent must reconstruct context each session
3. **No cross-agent awareness** — Different agents can't see each other's tasks
4. **No dependency tracking** — Related tasks don't have awareness of blocking relationships

### Desired Outcome

A persistent task management system where:
- Tasks survive session restarts with full prompts intact
- Agents can discover and execute queued tasks autonomously
- Human can monitor and manage tasks via Telegram TUI
- Task dependencies are tracked and respected automatically

---

## 2. User Stories

### Priority 1 — Phase 1 (MVP)

| ID | Title | As | I want | So that |
|----|-------|----|-------|--------|
| US-001 | View active tasks | Human user | See all active tasks in Telegram with inline buttons | I can quickly see what's pending without logging into terminal |
| US-002 | Add new task | Human user | Add a task with title, prompt, and assignee via `/task add` | I can queue work for later without losing the full prompt |
| US-003 | Complete task | Human user | Mark a task as completed via inline button or `/task complete <id>` | Tasks get marked done and removed from active list |
| US-004 | Pause task | Human user | Pause a task (don't delete) via `/task pause <id>` | I can stop working on something without losing it |
| US-005 | Delete task | Human user | Remove a task from queue via inline button or `/task delete <id>` | I can clean up stale or cancelled work |

### Priority 2 — Phase 2 (Cross-Agent Queue)

| ID | Title | As | I want | So that |
|----|-------|----|-------|--------|
| US-006 | Agent discovers tasks | Coder agent | Search Mem0 for "my assigned tasks" when starting work | I don't have to be told what to work on; I can find my queue |
| US-007 | Agent completes task | Coder agent | Mark task as completed after work finishes | Human can see progress without asking for status update |
| US-008 | Multi-source ingestion | Any agent | Add tasks from project files, Obsidian, Mem0 into queue | Tasks don't have to be manually added via `/task add` |

### Priority 3 — Phase 3 (Task Breakdown)

| ID | Title | As | I want | So that |
|----|-------|----|-------|--------|
| US-009 | Break down complex task | Planner agent | Split a large task into smaller subtasks with dependencies | Work is more manageable and progress is visible |
| US-010 | Task dependencies | Any agent | Task with uncompleted dependencies shows as BLOCKED | I don't start work that depends on unfinished items |
| US-011 | Epic/Story organization | Human user | Group related tasks under EPICs and STORIES | Large projects are organized hierarchically |
| US-012 | Auto-unblock tasks | Any agent | When dependency completes, dependent tasks auto-unblock | Work flows naturally without manual coordination |

---

## 3. Architecture Overview

### Phase 1: MVP (JSON File + Telegram)

```
┌─────────────────────────────────────────┐
│         User Interface                │
│  (Telegram Slash Commands + TUI)        │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│      Task Manager Skill                 │
│  (JavaScript + Node.js)              │
│                                     │
│  - `/tasks` (list active)              │
│  - `/task add <title>`                │
│  - `/task complete <id>`               │
│  - Inline buttons for actions             │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   tasks.json (Persistent Queue)        │
│  - Task objects with full prompts       │
│  - Status tracking                   │
│  - Task types (TASK, EPIC, STORY)  │
└─────────────────────────────────────────┘
```

### Phase 2: Cross-Agent Queue (Mem0 Integration)

```
┌─────────────────────────────────────────┐
│         Multi-Agent Layer              │
│  (Coder, Planner, etc.)              │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│     Mem0 (Shared Memory)            │
│  - Task storage with metadata          │
│  - Cross-agent search                  │
│  - Agent assignment                    │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   Task Manager Skill (Dual Mode)      │
│  - JSON file for fast UI ops          │
│  - Mem0 sync for cross-agent discovery  │
└─────────────────────────────────────────┘
```

### Phase 3: Task Breakdown + Multi-Source

```
┌─────────────────────────────────────────┐
│    Multiple Ingestion Sources          │
│  - Project files                    │
│  - Obsidian (via notes-cli)         │
│  - Mem0                            │
│  - Beads (git-backed)               │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│      Task Manager Skill               │
│  - Dependency graph                   │
│  - Auto-unblock logic                 │
│  - Epic/Story hierarchy              │
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   Unified Queue (JSON + Mem0)       │
└─────────────────────────────────────────┘
```

---

## 4. Data Model

### Task Object (Phase 1)

```json
{
  "id": "task_001",
  "type": "TASK",
  "title": "Implement OCBS Phase 1 refactor",
  "status": "IN_PROGRESS",
  "prompt": "Full pre-generated prompt here...",
  "assignedTo": "coder",
  "createdAt": "2026-03-19T14:00:00Z",
  "updatedAt": "2026-03-19T15:00:00Z",
  "dependsOn": []
}
```

### Task Object (Phase 3 - Enhanced)

```json
{
  "id": "task_001",
  "type": "TASK",
  "title": "Implement OCBS Phase 1 refactor",
  "status": "IN_PROGRESS",
  "prompt": "Full pre-generated prompt here...",
  "assignedTo": "coder",
  "createdAt": "2026-03-19T14:00:00Z",
  "updatedAt": "2026-03-19T15:00:00Z",
  "dependsOn": ["task_epic_001"],
  "parentId": "task_epic_001",
  "blockedReason": null,
  "priority": "high",
  "tags": ["ocbs", "refactor"]
}
```

### Status Values

| Value | Meaning | UI Indicator |
|-------|---------|---------------|
| `OPEN` | Not started, ready to work | ⏸️ |
| `IN_PROGRESS` | Currently being worked on | 🔄 |
| `COMPLETED` | Successfully finished | ✅ |
| `CANCELLED` | No longer needed | ❌ |
| `BLOCKED` | Waiting for dependencies | ⛔️ |

### Type Values

| Value | Meaning | UI Icon |
|-------|---------|----------|
| `TASK` | Individual work item | 📋 |
| `EPIC` | Parent container for stories | 🏗️ |
| `STORY` | Work item scoped to epic | 📄 |

---

## 5. Core Components

### Task Manager Skill

**Location:** `~/.openclaw/workspace/skills/task-manager/`

**Functions:**

```javascript
// Core CRUD
readTasks() → Read tasks.json
writeTasks(tasks) → Write tasks.json
generateTaskId() → "task_" + (++lastTaskId)

// Task operations
addTask(type, title, prompt, assignedTo, dependsOn)
updateTaskStatus(id, status)
deleteTask(id) → Mark as CANCELLED

// Dependency logic
checkDependencies(taskId) → Check if all deps completed
unblockDependents(taskId) → Mark dependent tasks as OPEN
getBlockedReason(taskId) → Generate human-readable block reason

// UI formatting
formatForTelegram(tasks, showAll=false) → Build inline button message
formatTaskType(type) → "🏗️ EPIC", "📋 TASK", "📄 STORY"
formatStatus(status) → Emoji + text
```

### Telegram Slash Commands

**Implemented in Phase 1:**
- `/tasks` — Show active tasks with inline buttons
- `/tasks all` — Show all tasks (including completed/epics)
- `/task add <title>` — Add new task (prompts for prompt/assignee)
- `/task complete <id>` — Mark as COMPLETED
- `/task pause <id>` — Mark as BLOCKED (pause without delete)
- `/task delete <id>` — Mark as CANCELLED
- `/task show <id>` — Show task details

**Planned for Phase 2:**
- `/task assign <id> <agent>` — Reassign task to different agent

**Planned for Phase 3:**
- `/task epic <title>` — Add epic
- `/task story <title> <epicId>` — Add story under epic
- `/task break <id>` — Break down complex task into subtasks

---

## 6. Dependency Logic

### Marking Task as COMPLETED

1. Find task by ID
2. Update status to `COMPLETED`
3. Check `dependsOn` arrays of all other tasks
4. For each dependent task:
   - Check if all its dependencies are COMPLETED
   - If yes → Update status from `BLOCKED` to `OPEN`
   - Auto-notify: "Task [id] is now unblocked"

### Example Flow

```
Task A (EPIC): "Build KingCrab daemon" [COMPLETED]
  ↓ depends on
Task B (STORY): "Implement plugin CLI wrapper" [BLOCKED]
  ↓ depends on
Task C (STORY): "Create systemd service" [BLOCKED]

When Task A completes:
→ Task B unblocks: "Blocked waiting for: Build KingCrab daemon (COMPLETED) → now OPEN"
→ Task C unblocks: "Blocked waiting for: Build KingCrab daemon (COMPLETED) → now OPEN"
```

---

## 7. Beads Integration

### Agent Responsibilities

1. **Initialize Beads in project dir:**
   ```bash
   cd /home/openclaw/projects/todo-task-manager
   bd init
   ```

2. **Track tasks with Beads:**
   ```bash
   bd add "Implement Task Manager Skill Phase 1"
   bd add "Add Telegram TUI with inline buttons"
   ```

3. **Check Beads before starting work:**
   ```bash
   bd list  # Show pending Beads tasks
   ```

4. **Mark Beads tasks complete immediately:**
   - When you finish a task, run `bd done <id>` right away
   - Don't batch multiple tasks before marking them complete

### Beads vs Task Manager Queue

| Aspect | Beads | Task Manager Queue |
|--------|--------|---------------------|
| **Purpose** | Agent tracking of build tasks | Persistent human + agent task queue |
| **Persistence** | Git-backed (local repo) | JSON file + Mem0 (cross-agent) |
| **Visibility** | Agent only (via `bd list`) | Human via Telegram TUI |
| **Usage** | During build sessions | Across all sessions |
| **Focus** | Implementation steps | Work items with full prompts |

---

## 8. Implementation Timeline

### Phase 1: MVP (1-2 days)

**Goal:** JSON file + Telegram TUI with inline buttons

**Day 1 Tasks:**
- [ ] Create skill scaffold (`skills/task-manager/`)
- [ ] Design JSON data model with task types
- [ ] Implement core functions: `readTasks()`, `writeTasks()`, `generateTaskId()`
- [ ] Implement task CRUD: `addTask()`, `updateTaskStatus()`, `deleteTask()`
- [ ] Add basic status values (OPEN, IN_PROGRESS, COMPLETED, CANCELLED)

**Day 2 Tasks:**
- [ ] Implement Telegram handlers: `/tasks`, `/task add`, `/task complete`
- [ ] Build inline button TUI with action buttons
- [ ] Add status UI indicators (emoji + text)
- [ ] Test all slash commands via Telegram
- [ ] Verify task persistence across session restarts

**Success Criteria:**
- [ ] Human can view active tasks in Telegram
- [ ] Human can add new task with full prompt
- [ ] Human can complete task via inline button
- [ ] Tasks persist across session restarts

---

### Phase 2: Cross-Agent Queue (1-2 days)

**Goal:** Mem0 integration for agent discovery and execution

**Tasks:**
- [ ] Add Mem0 storage for tasks
- [ ] Implement `memory_search(query="my assigned tasks")` in agent instructions
- [ ] Add agent-triggered task execution
- [ ] Implement dual mode (JSON + Mem0)
- [ ] Add task assignment by agent

**Success Criteria:**
- [ ] Coder agent can discover its assigned tasks
- [ ] Coder agent can complete task and mark done
- [ ] Tasks sync between JSON and Mem0
- [ ] Human can reassign tasks to different agents

---

### Phase 3: Task Breakdown + Multi-Source (2-3 days)

**Goal:** Dependency tracking, epic/story hierarchy, multi-source ingestion

**Tasks:**
- [ ] Add task types: EPIC, STORY
- [ ] Implement dependency graph: `dependsOn` arrays
- [ ] Add auto-unblock logic
- [ ] Implement epic/story commands: `/task epic`, `/task story`
- [ ] Build task breakdown tool: `/task break <id>`
- [ ] Add multi-source ingestion: project files, Obsidian, Beads
- [ ] Implement notes-cli skill wrapper for Obsidian

**Success Criteria:**
- [ ] Human can create EPICs and STORIES
- [ ] Tasks show as BLOCKED when dependencies incomplete
- [ ] Tasks auto-unblock when dependencies complete
- [ ] Tasks ingest from multiple sources automatically

---

## 9. Non-Functional Requirements

### Performance

- Task list loads in < 100ms for up to 100 tasks
- Inline button response time < 500ms
- Mem0 search for agent tasks completes in < 2s

### Reliability

- No data loss on agent crashes (atomic JSON writes)
- Graceful handling of Mem0 failures (fallback to JSON only)
- Idempotent status updates (no double-completion)

### Usability

- Clear error messages for invalid commands
- Human-readable blocked reasons
- Consistent emoji indicators across all states

### Security

- No task prompts logged to stdout (stderr only)
- No sensitive data in task titles
- Validate `assignedTo` against known agent list

---

## 10. Open Questions

1. **Mem0 integration:** Should tasks be stored only in Mem0 (Phase 2+) or always dual mode?
   - **Current decision:** Start with JSON only (Phase 1), add Mem0 in Phase 2

2. **Obsidian integration:** Should notes-cli skill be built in Phase 2 or Phase 3?
   - **Current decision:** Phase 3, after core stability is proven

3. **GitHub repo:** Private or public?
   - **Current decision:** TBD — ask human for preference

4. **Task priority:** Should tasks have a `priority` field for ordering?
   - **Current decision:** Not in Phase 1 MVP; consider for Phase 3

---

## 11. References

- OpenCode Todo system: `packages/opencode/src/tool/todo.ts`
- Gemini CLI Tracker system: `packages/core/src/tools/trackerTools.ts`
- OpenCode Task tool: `packages/opencode/src/tool/task.ts`
- Beads task tracking: https://github.com/some/beads (find actual link)

---

**Document Version:** 1.0
**Last Updated:** 2026-03-19
**Next Review:** After Phase 1 completion
