# Agent Instructions — Todo Task Manager

**Project:** Todo Task Manager
**Workspace:** `/home/openclaw/projects/todo-task-manager`
**Status:** 🟡 Planning → Phase 1 (MVP)

---

## Session Startup (Pre-Flight)

On every session start, before responding to any user request:

1. **Read context files silently:**
   - `AGENTS.md` (this file)
   - `README.md` — project overview
   - `SDP.md` — Software Design Document

2. **Run pre-flight check silently:**
   - `memory_search(query="todo-task-manager active tasks")` — Mem0 for ongoing work
   - Check `tasks.json` at `~/.openclaw/workspace/tasks/` if it exists
   - Check `~/projects/AGENT_PROJECTS.md` — see overall project status

3. **Proceed with user's request** — you've confirmed context checked.

---

## Beads Task Tracking

**Mandatory:** Use Beads (`bd`) for tracking implementation tasks throughout the build.

### Initialize Beads

First session in this project, initialize Beads:

```bash
cd /home/openclaw/projects/todo-task-manager
bd init
```

### Track Work with Beads

When working on implementation tasks:

```bash
# Add task
bd add "Implement Task Manager Skill Phase 1"
bd add "Add Telegram TUI with inline buttons"
bd add "Test task persistence across session restarts"

# Show pending tasks
bd list
```

### Mark Tasks Complete Immediately

**Critical:** Mark Beads tasks as complete as soon as you finish them. Do not batch multiple tasks before marking.

```bash
# When you finish a task, mark it done right away
bd done <id>
```

### Beads vs Task Manager Queue

| Aspect | Beads | Task Manager Queue |
|--------|--------|---------------------|
| **Purpose** | Agent tracking of build steps | Persistent human + agent task queue |
| **When to use** | During build implementation | Across all sessions (human + agent) |
| **Persistence** | Git-backed (local) | JSON file + Mem0 |
| **Focus** | "Implement X", "Test Y" | "Task: Do X with full prompt" |

**Rule:** Use Beads for tracking *this build's progress*. Use Task Manager Queue for *persistent task items*.

---

## Project Responsibilities

### What You Are Doing

Building an OpenClaw task management system with:
- Persistent task queue across sessions
- Telegram TUI with inline buttons
- Task types (TASK, EPIC, STORY)
- Dependency tracking
- Multi-source ingestion (Mem0, project files, Obsidian, Beads)

### What You Are Not Doing

- NOT building a complex project management platform
- NOT integrating with external tools like Linear, Jira, etc.
- NOT creating a new storage backend (using JSON + Mem0)

---

## Development Priorities

### Phase 1: MVP (1-2 days) — Current Focus

**Day 1 Goals:**
- [ ] Create skill scaffold (`skills/task-manager/`)
- [ ] Design JSON data model with task types
- [ ] Implement core functions (readTasks, writeTasks, generateTaskId)
- [ ] Implement task CRUD (add, update, delete)

**Day 2 Goals:**
- [ ] Implement Telegram handlers (`/tasks`, `/task add`, `/task complete`)
- [ ] Build inline button TUI
- [ ] Test all slash commands
- [ ] Verify task persistence

### Phase 2: Cross-Agent Queue (1-2 days)

- Mem0 integration for agent discovery
- Dual mode (JSON + Mem0)
- Agent-triggered task execution

### Phase 3: Task Breakdown + Multi-Source (2-3 days)

- Dependency graph (dependsOn arrays)
- Auto-unblock logic
- Epic/Story hierarchy
- Multi-source ingestion (project files, Obsidian, Beads)

---

## Code Quality Standards

1. **Write clean, readable JavaScript** — Follow existing patterns in workspace skills
2. **Add comments for complex logic** — Especially dependency unblocking
3. **Test slash commands manually** — Verify via Telegram before considering done
4. **Log progress daily** — Update `memory/YYYY-MM-DD.md` with what you worked on
5. **Commit to git regularly** — After each milestone

---

## When to Use Task Manager Queue

**DO use when:**
- Human asks to queue a task for later work
- You discover a task that should persist across sessions
- Human triggers a task via Telegram TUI
- Agent searches for assigned work via Mem0

**DO NOT use when:**
- Simple single-turn tasks you can complete immediately
- Tasks you can finish in <2 steps without tracking
- Testing/debugging (use Beads for that)

---

## Communication Style

- **Be concise** — Use bullet lists for technical details
- **Focus on action** — What did you do? What's next?
- **Celebrate milestones** — When you complete a phase, acknowledge it
- **Ask when stuck** — Don't spin wheels; ask for clarification

---

## Getting Unstuck

If you're blocked on a decision:

1. **Check SDP.md** — It has user stories and architecture details
2. **Check README.md** — Quick overview and current status
3. **Ask the human** — Don't guess at requirements

---

## Success Criteria (Phase 1)

You'll know Phase 1 is complete when:

- [ ] Human can run `/tasks` in Telegram and see active tasks
- [ ] Human can add task via `/task add` with full prompt
- [ ] Human can complete task via inline button or `/task complete`
- [ ] Tasks persist across session restarts (test this!)
- [ ] All slash commands work reliably
- [ ] Beads tasks for Phase 1 are marked done

---

## After Phase 1

When Phase 1 is complete:

1. **Update README.md** — Mark status as "🟢 Phase 1 complete, Phase 2 started"
2. **Update SDP.md** — Add Phase 2 success criteria as completed
3. **Update AGENTS.md** — Add Phase 2 priorities
4. **Commit to git** — Tag as `v0.1.0-mvp`
5. **Ask human** — Ready for Phase 2 (cross-agent queue)?

---

**Last Updated:** 2026-03-19
**Agent:** Jean Clawd (planner)
