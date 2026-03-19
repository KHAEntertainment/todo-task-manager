# Build Prompt — Todo Task Manager (Clean Context)

**Use this prompt in a new session to start building the Todo Task Manager with minimal context.**

---

## Copy-Paste This into a New Session:

```
You are starting work on the Todo Task Manager project.

## Project Context

**Location:** `/home/openclaw/projects/todo-task-manager/`
**Workspace:** `/home/openclaw/.openclaw/workspace/`
**Current Phase:** 1 (MVP - JSON file + Telegram TUI)

## What You're Building

A persistent task management system for OpenClaw that solves: "agents forgetting tasks across session restarts."

**Core Features (Phase 1):**
- JSON file-based task queue at `~/.openclaw/workspace/tasks/tasks.json`
- Telegram slash commands: `/tasks`, `/task add <title>`, `/task complete <id>`
- Inline button TUI with actions (Complete, Pause, Delete)
- Task persistence across session restarts
- Task types: TASK, EPIC, STORY
- Task statuses: OPEN, IN_PROGRESS, COMPLETED, CANCELLED, BLOCKED

## Your Tasks Today

### Phase 1, Day 1

Read these files in order:
1. `/home/openclaw/projects/todo-task-manager/AGENTS.md` — Agent instructions + Beads usage
2. `/home/openclaw/projects/todo-task-manager/README.md` — Project overview
3. `/home/openclaw/projects/todo-task-manager/SDP.md` — Full design document with user stories

Then complete these tasks in order:

**Task 1:** Initialize Beads in the project directory
- Run: `cd /home/openclaw/projects/todo-task-manager && bd init`
- Add: `bd add "Create skill scaffold for Task Manager"`

**Task 2:** Create skill scaffold
- Create: `~/.openclaw/workspace/skills/task-manager/SKILL.md`
- Follow the pattern from existing skills in `workspace/skills/`

**Task 3:** Design JSON data model
- Create initial `tasks.json` structure with: id, type, title, status, prompt, assignedTo, createdAt, updatedAt, dependsOn
- Define task types: TASK, EPIC, STORY
- Define statuses: OPEN, IN_PROGRESS, COMPLETED, CANCELLED, BLOCKED

**Task 4:** Implement core JavaScript functions
- Create: `~/.openclaw/workspace/skills/task-manager/tasks.js`
- Implement: `readTasks()`, `writeTasks(tasks)`, `generateTaskId()`
- Implement: `addTask()`, `updateTaskStatus(id, status)`, `deleteTask(id)`

**Task 5:** Mark Beads tasks complete and log progress
- Run: `cd /home/openclaw/projects/todo-task-manager && bd done` for each completed task
- Update: `~/.openclaw/workspace/memory/2026-03-19.md` with what you accomplished

### Phase 1, Day 2 (Tomorrow)

**Task 6:** Implement Telegram slash command handlers
- Add: `/tasks` handler to show active tasks with inline buttons
- Add: `/task add <title>` handler with prompts for prompt/assignee
- Add: `/task complete <id>` handler to mark as COMPLETED
- Add: `/task pause <id>` and `/task delete <id>` handlers

**Task 7:** Build inline button TUI
- Format task list with inline buttons: [✅ Complete] [⏸️ Pause] [❌ Delete]
- Add task type indicators: 🏗️ EPIC, 📋 TASK, 📄 STORY
- Add status indicators: ⏸️ OPEN, 🔄 IN_PROGRESS, ✅ COMPLETED

**Task 8:** Test slash commands via Telegram
- Test: `/tasks` shows active tasks
- Test: `/task add "Test task"` creates task
- Test: `/task complete task_001` marks as complete

**Task 9:** Verify task persistence
- Stop current session (simulate 4am restart)
- Start new session
- Run: `/tasks` to verify tasks persist

**Task 10:** Update documentation and commit
- Mark Phase 1 complete in README.md
- Update AGENTS.md with Phase 2 priorities
- Commit to git with tag: `v0.1.0-mvp`

## Important Rules

1. **Use Beads for tracking** — Every implementation task should be tracked with `bd add`
2. **Mark Beads complete immediately** — Don't batch tasks; mark done as you finish each
3. **Log progress daily** — Update `memory/YYYY-MM-DD.md` at end of each session
4. **Test as you go** — Don't wait until end to test slash commands
5. **Ask if blocked** — Don't spin wheels; ask for clarification on decisions

## Success Criteria (Phase 1)

You'll know Phase 1 is complete when:
- [ ] Human can run `/tasks` in Telegram and see active tasks
- [ ] Human can add task via `/task add` with full prompt
- [ ] Human can complete task via inline button or `/task complete`
- [ ] Tasks persist across session restarts (test this!)
- [ ] All slash commands work reliably
- [ ] All Beads tasks for Phase 1 are marked done

## Next Steps After Phase 1

When Phase 1 is complete:
1. Ask human: "Ready to proceed to Phase 2 (cross-agent queue with Mem0)?"
2. If yes, continue with Phase 2 tasks from SDP.md

---

**Start now:** Read AGENTS.md, then README.md, then SDP.md. Begin with Task 1.
```

---

## How to Use

1. **Copy the prompt above** (everything between the ```
   and ```
   boundaries)

2. **Start a new OpenClaw session** (or switch models if needed)

3. **Paste the prompt** into the new session

4. **Begin working** — The prompt has clear tasks in order

---

## Why This Works

This prompt provides:
- **Clean context** — No prior session clutter
- **Clear tasks** — Step-by-step objectives
- **Reference links** — Full documentation available
- **Success criteria** — Know when you're done

No guessing, no "what should I do next?" — just follow the tasks.

---

**Created:** 2026-03-19
**For:** Todo Task Manager Phase 1 (MVP)
