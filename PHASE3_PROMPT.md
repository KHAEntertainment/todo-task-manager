# Phase 3.3 - Option D: Telegram Web App Interactive UI

## Context
Phase 3.1 (Priority) and Phase 3.2 (Dependencies) are complete.
Phase 3.3 is about adding a TRUE interactive UI — not CLI-style commands with quotes and flags.

## What We Already Tried
- **Option A (callback_data → CLI echo): BROKEN.** Deep research into OpenClaw source showed that Telegram's `callback_query` is handled internally by OpenClaw's Grammy bot — the `callback_data` is NOT echoed back to the chat as text. User confirmed: clicking buttons produces zero feedback.
- **Option B (Plugin SDK enhancement):** Would require upstream PR to OpenClaw to expose `callback_query` hooks to plugins.
- **Option C (Custom gateway method):** Reserved as fallback.

## Option D: Telegram Web App (THE APPROACH)

**The idea:** Use Telegram `web_app` buttons that open an externally hosted web app over Tailscale — exactly like OCBS and ClawVault already do.

```
Telegram Chat
    │
    ├─── [🔗 Open Tasks]  ── web_app button ──▶ https://clawserv01.tailXXX.ts.net/tasks
    │                                                           │
    ├─── [➕ New Task]  ── web_app button ──▶ https://clawserv01.tailXXX.ts.net/tasks/new
    │                                                           │
    └─── [📊 Dashboard] ── web_app button ──▶ https://clawserv01.tailXXX.ts.net/tasks/dashboard

                                                              Web App (HTML/CSS/JS)
                                                              │
                                                              └─── API calls ───▶ tasks.json
```

**Why Option D:**
- ✅ Works TODAY — no upstream OpenClaw changes
- ✅ Proven — OCBS and ClawVault already do this via Tailscale serve
- ✅ Rich UI — full HTML/CSS/JS flexibility
- ✅ Secure — Tailscale VPN only
- ✅ Fast to build — simple web server + static HTML
- ✅ No callback_query routing needed — web app runs independently

## What to Build

### 1. Web Server
**Location:** `/home/openclaw/projects/todo-task-manager/webapp/`

A simple Hono or Express server on port, say, `18799`.

**API Endpoints:**
- `GET /api/tasks` — return all tasks (reads from tasks.json)
- `POST /api/tasks` — create a new task
- `PUT /api/tasks/:id` — update a task (complete, claim, edit, priority, etc.)
- `DELETE /api/tasks/:id` — delete a task
- `GET /` — serve the static HTML task manager UI

**Tasks file location:** `/home/openclaw/.openclaw/workspace/tasks/tasks.json`

### 2. Task Manager UI (HTML/CSS/JS)
**Location:** `/home/openclaw/projects/todo-task-manager/webapp/public/`

A single-page app with:
- Task list (status badges, priority indicators, type, assignee, blocked by info)
- Action buttons per task: Complete, Claim, Edit, Delete
- "Add Task" form
- Filter bar (by status, priority, assignee)
- Task detail/edit modal

**Design inspiration:** The `/models` picker UI — clean, minimal, instant feedback.

### 3. Tailscale Serve
Expose the web app via:
```bash
tailscale serve --bg https+insecure://localhost:18799 /tasks
```
Or use the existing OpenClaw dashboard port pattern.

### 4. Plugin Update
**File:** `/home/openclaw/.openclaw/extensions/task-manager/index.ts`

Replace the current `callback_data` button approach with `web_app` buttons:

```typescript
// Instead of:
{ text: "✅ Complete", callback_data: "/task complete task_001" }

// Use:
{
  text: "🔗 Open Tasks",
  web_app: {
    url: "https://clawserv01.tailXXX.ts.net/tasks"
  }
}
```

**Buttons to send with `/tasks` output:**
- `[🔗 Open Tasks]` — opens task list web app
- `[➕ New Task]` — opens new task form web app
- `[📊 Dashboard]` — opens dashboard web app

## Git Workflow
1. Merge `feat/phase3.2-dependencies` into `main`
2. Create branch: `git checkout -b feat/phase3.3-webapp`
3. Build the web server, UI, and Tailscale integration
4. Update plugin to use web_app buttons
5. Test end-to-end
6. PR to `main`

## Existing Code to Reference
- Tasks module (tasks.js): `/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js`
- Plugin: `/home/openclaw/.openclaw/extensions/task-manager/index.ts`
- OCBS Tailscale serve setup (for reference): look at how OCBS is served

## Deliverables
1. Web server with task API (GET/POST/PUT/DELETE)
2. Task manager HTML/CSS/JS UI
3. Tailscale serve configuration
4. Updated plugin with web_app buttons
5. All tests passing
