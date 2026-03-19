# Todo Task Manager

## What

OpenClaw-based task management system with persistent queue across sessions, featuring Telegram TUI with inline buttons, task types (TASK, EPIC, STORY), dependency tracking, and multi-source ingestion.

## Why

Solves the core problem: **agents forgetting context across session restarts.** Tasks with pre-generated prompts sit in a persistent queue until triggered by human or agent, ensuring no "repeated instructions" after 4am restarts.

## Current Status

- **State:** 🟡 planning
- **Started:** 2026-03-19
- **Phase:** 1 (MVP - JSON file + Telegram TUI)

## Architecture

### Data Storage

- **Primary:** JSON file at `~/.openclaw/workspace/tasks/tasks.json` (Phase 1)
- **Future:** Dual mode (JSON for UI speed, Mem0 for cross-agent discovery) (Phase 2)

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

Tasks can have `dependsOn: ["task_001", "task_002"]` arrays. A task with uncompleted dependencies shows as BLOCKED with human-readable blockedReason.

## Quick Links

- `SDP.md` — Software Design Document with User Stories
- `AGENTS.md` — Agent instructions + Beads usage
- `prompt-for-build.md` — Clean prompt for starting build in new session
- GitHub: https://github.com/KHAEntertainment/todo-task-manager

## Related Tools

Inspired by:
- OpenCode Todo/Tracker system
- Gemini CLI task management
- Beads task tracking tool

## Usage (When Complete)

```bash
# View active tasks (Telegram)
/tasks

# Add new task
/task add "Implement feature"

# Add epic
/task epic "Build KingCrab daemon"

# Add story under epic
/task story "Implement plugin CLI" epic:kingcrab_daemon

# Complete task
/task complete task_001

# Block task (e.g., waiting on something)
/task block task_002

# Show all tasks (including completed/epics)
/tasks all
```

## Agent Responsibilities

1. **Read context first** — AGENTS.md specifies startup pre-flight check
2. **Use Beads for tracking** — `bd init` in project dir, `bd add <task>`, `bd list`
3. **Log progress daily** — Update `memory/YYYY-MM-DD.md` with what you worked on
4. **Mark tasks completed immediately** — Don't batch multiple tasks before marking

## Next Steps

1. Phase 1 MVP: JSON file + Telegram TUI with inline buttons (1-2 days)
2. Phase 2: Cross-agent queue with Mem0 integration (1-2 days)
3. Phase 3: Task breakdown + multi-source ingestion (2-3 days)
