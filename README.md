# Todo Task Manager

## What

OpenClaw-based task management system with persistent task queue across sessions. Tasks survive session restarts and can be managed via slash commands, native agent tools, or CLI wrapper.

**Current Status:** v0.2.0 - Hybrid Agent Interface
**Started:** 2026-03-19
**Active Development:** Phase 3.4 - Multi-Source Ingestion

## Why

Solves the core problem: **agents forgetting context across session restarts.** Tasks with pre-generated prompts sit in a persistent queue until triggered by human or agent, ensuring consistent project state across restarts and multiple agents.

## Current Status

- **Phase 1 (MVP):** ✅ Complete — JSON file storage + Telegram slash commands
- **Phase 2 (Agent Integration):** ✅ Complete — Session hooks, task claiming, auto-discovery
- **Phase 3.1-3.2:** ✅ Complete — Priority system + dependency blocking
- **Phase 3.3 (Interactive UI):** 🔄 Pivoted to Hybrid Agent Interface

## Architecture

### Data Storage

- **Primary:** JSON file at `~/.openclaw/workspace/tasks/tasks.json` (Phase 1)
- **Future:** Mem0 for cross-agent discovery (Phase 2)

### Task Types

- **TASK** — Individual work items
- **EPIC** — Parent containers for related stories
- **STORY** — Work items scoped to an epic

### Task States

- `OPEN` — Not started, ready to work
- `IN_PROGRESS` — Currently being worked on (exclusive)
- `COMPLETED` — Successfully finished
- `CANCELLED` — No longer needed
- `BLOCKED` — Waiting for dependencies

### Dependencies

Tasks can have `dependsOn: ["task_001", "task_002"]` arrays. Tasks with uncompleted dependencies show as BLOCKED with human-readable `blockedReason`.

## Quick Start

```bash
# View active tasks (clean table view)
/tasks

# Add new task
/task add "Implement feature" --prompt "Full prompt for implementation"

# Claim task
/task claim task_001

# Complete task
/task complete task_001

# Show all tasks (including completed/epics)
/tasks all

# Detailed view (shows full prompts and metadata)
/tasks detailed

# Mark task as blocked
/task block task_001 "Waiting on dependency"

# Commands reference
/tasks:commands
```

## Agent Capabilities

### For Humans (You)

1. **Slash Commands:** All commands work directly in Telegram
   - `/tasks` — View tasks
   - `/task add "Title" --prompt "Full prompt"` — Create task
   - `/task claim task_001` — Claim task
   - `/task complete task_001` — Mark complete
   - `/task edit task_001 --title "New title"` — Edit task
   - `/task delete task_001` — Delete task

2. **Automatic Discovery:** When you start a new session, you'll automatically see your assigned OPEN tasks injected into context. No manual `/tasks` needed.

### For Agents (Barry, Albert, etc.)

**Agents have TWO ways to manage tasks:**

1. **Native Agent Tool** — Preferred method when session restarts
   ```typescript
   // Available in LLM context
   {
     "name": "task_manager",
     "action": "list" | "add" | "claim" | "complete" | "status" | "pause" | "edit" | "delete",
     "taskId": "task_001",
     "title": "Task title",
     "status": "IN_PROGRESS",
     // For edit action: title, prompt, assignee (all optional)
     // For pause/delete: only taskId required
   }
   ```

2. **CLI Wrapper** — Fallback for subagents, PTY sessions, cron jobs
   ```bash
   # List tasks
   node /home/openclaw/.openclaw/extensions/task-manager/task-cli.js list
   
   # Claim task
   node /home/openclaw/.openclaw/extensions/task-manager/task-cli.js claim task_001
   
   # Complete task
   node /home/openclaw/.openclaw/extensions/task-manager/task-cli.js complete task_001
   ```

### Agent Behavior

- **Session Hooks:** Agents automatically discover their OPEN tasks on session start via `before_agent_start` hook
- **Task Discovery:** Injected into agent context as structured `<task-discovery>` block
- **Completion Tracking:** Tasks automatically record `completedBy` and `completedAt` metadata
- **Persistent Context:** Tasks remain available in `tasks.json` across sessions

## Task Priorities

Tasks can be prioritized with three levels:

- 🚨 **HIGH** — Urgent, blockers should be cleared immediately
- ⚠️ **MEDIUM** — Normal priority, default for new tasks
- 📌 **LOW** — Nice-to-have, can wait

Tasks are sorted by priority first, then by ID.

## Task Dependencies

Tasks can depend on other tasks using `dependsOn: ["task_001", "task_002"]`. 

**Blocking Logic:**
- A task cannot start until ALL its dependencies are COMPLETED
- If a task has uncompleted dependencies, it shows as BLOCKED with a reason
- When a dependency completes, dependent tasks automatically unblock

**Example:**
```text
task_001: "Setup project" (COMPLETED)
task_002: "Configure build" (OPEN, blocked by: task_001)

task_003: "Write tests" (OPEN, blocked by: task_001)

# When task_001 completes, task_002 and task_003 automatically unblock
```

## Known Limitations

1. **Telegram Inline Keyboards:** OpenClaw's current plugin SDK does not support native Telegram inline keyboards (`callback_query` routing to plugins). 
   - **Workaround:** Use slash commands directly, or CLI wrapper for subagents
   - **Future:** Revisit when OpenClaw adds full Telegram Bot API support to plugins

2. **Agent Session Hooks:** Session hooks (`session_start`, `before_agent_start`) work for direct agent sessions spawned via CLI, but do NOT fire for subagents spawned through plugin tools.
   - **Workaround:** Subagents must run `/tasks` manually on first startup, or use CLI wrapper

3. **Task Claiming:** Only one agent can have a task IN_PROGRESS at a time. First-come, first-served.

## Recent Changelog

### v0.2.0 — Hybrid Agent Interface (2026-03-20)
- ✅ Added native `task_manager` agent tool for LLM access
- ✅ Added `task-cli.js` CLI wrapper for subagents and PTY sessions
- ✅ Added task event logging to `events.json`
- ✅ Cleaned up UI with minimal table view (no inline action hints by default)
- ✅ Added `formatMinimalTaskList()` for ultra-clean table output
- ✅ Added `/tasks:commands` reference
- ✅ Added `/tasks detailed` for full task prompts
- 📝 **Documentation updated to reflect actual implementation**

### v0.2.0 — Phase 3.1-3.2 (2026-03-19)
- ✅ Priority field (HIGH, MEDIUM, LOW) added
- ✅ Priority sorting implemented
- ✅ Priority filtering via `/tasks --priority HIGH` added
- ✅ Dependency blocking/unblocking logic implemented
- ✅ GitHub PR #1 created and merged

### v0.1.0 — Phase 2 (2026-03-20)
- ✅ Session hooks (`session_start`, `before_agent_start`) implemented
- ✅ Task discovery injection working
- ✅ Task claiming mechanism (`/task claim`) added
- ✅ Task completion tracking (`completedBy`, `completedAt`) added

### v0.1.0-mvp — Phase 1 MVP (2026-03-20)
- ✅ JSON file storage implemented
- ✅ Core CRUD operations working
- ✅ Telegram slash commands (`/tasks`, `/task add`, etc.) functional

## Project Structure

```text
todo-task-manager/
├── extensions/
│   └── task-manager/
│       ├── index.ts           # Main plugin (slash commands + session hooks)
│       ├── openclaw.plugin.json
│       └── task-cli.js       # CLI wrapper for subagents
├── skills/
│   └── task-manager/
│       ├── tasks.js           # Core data module (CRUD)
│       └── tasks.json          # Data storage
└── webapp/                     # Web app (planned for Phase 3, not active)
    ├── ui/
    └── ...
```

## Related Projects

- **GitHub:** https://github.com/KHAEntertainment/todo-task-manager
- **OpenClaw Docs:** https://docs.openclaw.ai

## Development Workflow

1. Feature development happens in feature branches (e.g., `feat/phase3-5-hybrid-agent-interface`)
2. Pull requests created and linked to issues
3. After testing and review, PRs are merged into `main`
4. `main` is tagged with version numbers (v0.1.0, v0.2.0, etc.)

## Agent Instructions

### For Humans (You)

1. **Create Tasks:** Use `/task add "Feature" --prompt "Full prompt"`
2. **View Tasks:** Use `/tasks` (minimal table) or `/tasks detailed` (full view)
3. **Complete Tasks:** Use `/task complete task_001` via chat command or supported UI (note: inline keyboard buttons not available due to SDK limitation)
4. **Manage Tasks:** Edit, unassign, reassign as needed via commands

### For Agents (Barry, Albert)

**Automatic Discovery:** You'll automatically see your assigned OPEN tasks when a new session starts. No manual check needed.

**Preferred Method:** Use the native `task_manager` tool in your context window. It's cleaner and more reliable.

**Fallback Method:** If the native tool isn't available, use the CLI wrapper:
```bash
node /home/openclaw/.openclaw/extensions/task-manager/task-cli.js claim task_001
```

**Important:** Subagents spawned through plugin tools DO NOT receive session hooks. They must run `/tasks` manually on startup or use the CLI wrapper.

## Next Steps

### Phase 3.4 — Multi-Source Ingestion (Planning)

**Goal:** Enable task creation from multiple sources:
- Mem0 (memories tagged with `#task`)
- Obsidian markdown files (TODO, FIX, EPIC headers)
- Project Manager skill integration

**Acceptance Criteria:**
- [ ] Mem0 import function working
- [ ] Obsidian parser implemented
- [ ] Project Manager bridge functional
- [ ] `/task import --source mem0` command added
- [ ] `/task import --source obsidian` command added
- [ ] All sources tested end-to-end

**Estimated Time:** 8-12 hours

---

## Contributing

Want to contribute? See `PHASE3_PLAN.md` for detailed roadmap and in-progress features.

**Testing:** Before submitting PRs, test:
1. Task CRUD operations work
2. Session hooks fire correctly
3. Agent discovery works
4. Native tool functions properly
5. CLI wrapper handles all cases

**Code Style:**
- Clean, readable JavaScript/TypeScript
- Add comments for complex logic
- Follow existing patterns in the codebase