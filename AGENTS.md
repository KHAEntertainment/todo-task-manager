# Todo Task Manager — Agent Instructions

## Overview

Todo Task Manager provides a native `task_manager` tool that you can invoke directly in your context window, eliminating the need to remember specific slash commands or CLI wrappers.

## What This Tool Provides

The `task_manager` tool is available in your LLM context whenever you are running in an agent session. It supports the following operations:

| Operation | Tool Usage | Example |
|-----------|------------|---------|
| List tasks | `task_manager(action: "list")` | Returns all tasks sorted by priority |
| Get task details | `task_manager(action: "list")` — then manually inspect | See task details |
| Add task | `task_manager(action: "add", title: "...", prompt: "...")` | Create new task |
| Claim task | `task_manager(action: "claim", taskId: "task_001")` | Mark task as IN_PROGRESS |
| Complete task | `task_manager(action: "complete", taskId: "task_001")` | Mark task as COMPLETED |
| Update status | `task_manager(action: "status", taskId: "task_001", status: "PAUSED")` | Pause, resume, or cancel task |

## When to Use

**Prefer this tool** whenever you need to interact with tasks. It's:
- More reliable than invoking the skill (no context switching)
- Faster than manual CLI commands
- Automatically handles task metadata (claim timestamps, completion tracking)
- Works across all agent contexts (subagents, PTY sessions)

**When to use alternatives:**
- Telegram slash commands directly (e.g., `/tasks`, `/task add "..."`) — when you are in a direct chat
- CLI wrapper (`task-cli.js`) — when in PTY or cron job
- Task Manager skill — when native tool is not available

## Current State

**Phase 3 Complete:** All core features operational
- ✅ Phase 1: JSON file + Telegram commands
- ✅ Phase 2: Session hooks + task claiming
- ✅ Phase 3.5: Native agent tool + CLI wrapper

## Important Notes

1. **Task Discovery:** On session start, you'll automatically see your assigned OPEN tasks in context. No manual check needed.
2. **Task Completion:** Tasks automatically record `completedBy` and `completedAt` when you mark them complete via this tool.
3. **Concurrent Edits:** The system handles race conditions automatically using `updatedAt` timestamps.
4. **Session Persistence:** Tasks survive session restarts in `~/.openclaw/workspace/tasks/tasks.json`.

## Troubleshooting

**Tool not appearing in context?**
- Restart gateway to load updated plugin code
- Check agent configuration allows tool access

**Tasks not showing in context?**
- Verify `tasks.json` file exists at `~/.openclaw/workspace/tasks/tasks.json`
- Check task status is OPEN (only OPEN tasks are auto-discovered)

## Questions?

Refer to the main project README.md for full documentation:
- `/home/openclaw/projects/todo-task-manager/README.md`
