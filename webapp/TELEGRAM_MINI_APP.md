# Telegram Mini App — Developer Guide

This document covers the Telegram Mini App SDK integration for the Task Manager webapp. It is the primary reference for developers working on the Mini App frontend.

## Overview

The Task Manager Mini App is a Telegram-native web application that runs inside Telegram's WebView. It uses the [Telegram Mini App SDK](https://core.telegram.org/bots/webapps) (Bot API 9.5) to provide native-feeling integration with Telegram's UI: theme matching, native buttons, haptic feedback, back navigation, and bot communication.

The Mini App shares the same REST API (`/api/tasks`) and JSON data store as the bot plugin and agent tools. All three interfaces (Mini App, bot commands, agent tools) read and write the same `tasks.json` file.

## Architecture

```
User taps "Dashboard" button in Telegram chat
        │
        ▼
┌─────────────────────────────────────┐
│  Telegram Client (WebView)          │
│  ┌───────────────────────────────┐  │
│  │  telegram-web-app.js SDK      │  │
│  │  - themeParams → CSS vars     │  │
│  │  - BottomButton / BackButton  │  │
│  │  - HapticFeedback             │  │
│  │  - sendData() → bot           │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  webapp/ui/                   │  │
│  │  - index.html (SPA shell)    │  │
│  │  - js/app.js (all logic)     │  │
│  │  - css/style.css (themed)    │  │
│  └──────────┬────────────────────┘  │
└─────────────┼───────────────────────┘
              │ fetch /api/tasks
              ▼
┌─────────────────────────────────────┐
│  webapp/server.js (Express :18799)  │
│  webapp/api/routes/tasks.js         │
│  webapp/data/tasks.js               │
│           │                         │
│           ▼                         │
│  ~/.openclaw/.../tasks.json         │
└─────────────────────────────────────┘
              ▲
              │ (same data file)
┌─────────────────────────────────────┐
│  extensions/task-manager/index.ts   │
│  (Bot plugin + agent tool)          │
│  - /tasks, /task commands           │
│  - task_manager tool                │
│  - web_app_data handler             │
└─────────────────────────────────────┘
```

### Data flow for sendData

When the user performs a significant action (claim, complete, delete) in the Mini App:

1. `app.js` calls `tg.sendData(JSON.stringify({ action, taskId, title }))`
2. Telegram delivers this as a `web_app_data` service message to the bot
3. `index.ts` receives the `web_app_data` event and posts a confirmation in chat
4. The Mini App closes automatically after `sendData()`

## SDK Features Used

| Feature | Purpose | Location |
|---------|---------|----------|
| `Telegram.WebApp.ready()` | Signal SDK initialization complete | `app.js` top-level |
| `Telegram.WebApp.expand()` | Expand to full height | `app.js` top-level |
| `Telegram.WebApp.requestFullscreen()` | Enter fullscreen mode | `app.js` top-level |
| `themeParams` | Dynamic colors from Telegram theme | `applyTelegramTheme()` in `app.js` |
| `themeChanged` event | React to dark/light mode switch | `app.js` event listener |
| `MainButton` (BottomButton) | Context-sensitive primary action | `updateTelegramButtons()` |
| `SecondaryButton` | Delete / Cancel action | `updateTelegramButtons()` |
| `BackButton` | Native back navigation | `updateBackButton()` |
| `HapticFeedback` | Tactile feedback on actions | `haptic()` helper |
| `showConfirm()` | Native confirmation dialogs | `confirmAction()` wrapper |
| `showAlert()` | Native alert dialogs | `showAlert()` wrapper |
| `sendData()` | Send action results back to bot | `sendActionToBot()` |
| `DeviceStorage` | Persist filter preferences | `savePreference()` / `loadPreference()` |
| `initDataUnsafe.user` | Get Telegram username for claims | `getTelegramUsername()` |

## View State Machine

The app uses a simple three-state navigation model:

```
┌──────┐  tap card   ┌────────┐  edit btn  ┌──────┐
│ LIST │────────────→│ DETAIL │───────────→│ FORM │
│      │←────────────│        │←───────────│      │
└──────┘  BackButton └────────┘  BackButton └──────┘
   │                     │
   │  "Create Task"      │  (BackButton at root)
   │  BottomButton       │
   └────────────────────→ FORM
```

**State: `list`**
- Shows task cards, filter bar, task count
- BottomButton: "Create Task"
- BackButton: hidden (root view)
- Tap a card → navigate to `detail`

**State: `detail`**
- Shows full task info (title, badges, prompt, timestamps)
- BottomButton: context-sensitive ("Claim" / "Complete" / "Resume")
- SecondaryButton: "Delete"
- BackButton: → `list`
- Edit button → `form`

**State: `form`**
- Shows inline form (Telegram mode) or modal (browser mode)
- BottomButton: "Save Task" / "Save Changes"
- SecondaryButton: "Cancel"
- BackButton: → `detail` (if editing) or `list` (if creating)

## Theme Integration

The app uses CSS custom properties (`:root` vars) for all colors. In Telegram, these are overridden dynamically from `themeParams`:

| CSS Variable | Telegram themeParam | Fallback (dark) |
|-------------|-------------------|-----------------|
| `--bg` | `bg_color` | `#0f1117` |
| `--surface` | `secondary_bg_color` | `#1a1d27` |
| `--surface2` | `section_bg_color` | `#242836` |
| `--text` | `text_color` | `#e8eaf0` |
| `--text-muted` | `hint_color` | `#8b8fa8` |
| `--accent` | `button_color` | `#6c8aff` |
| `--accent-hover` | `accent_text_color` | `#8ba4ff` |
| `--danger` | `destructive_text_color` | `#f87171` |
| `--info` | `link_color` | `#38bdf8` |

Badge colors (type, status, priority) remain fixed semantic colors and are not theme-mapped.

## Bot Communication Protocol

### sendData JSON schema

```json
{
  "action": "claimed" | "completed" | "deleted",
  "taskId": "task_001",
  "title": "Task title string"
}
```

### Which actions trigger sendData

| Action | Triggers sendData? | Closes app? |
|--------|-------------------|-------------|
| Claim | Yes | Yes (via sendData) |
| Complete | Yes | Yes |
| Delete | Yes | Yes |
| Create | No | No (user stays) |
| Edit | No | No |
| Resume / Pause | No | No |

### Plugin handler (`index.ts`)

The `web_app_data` event listener parses the JSON and posts a confirmation message in the Telegram chat:
- Claimed: `✅ Task task_001 claimed via Mini App: "Title"`
- Completed: `🎉 Task task_001 completed via Mini App: "Title"`
- Deleted: `🗑️ Task task_001 deleted via Mini App: "Title"`

## Graceful Degradation

The app detects Telegram via `window.Telegram?.WebApp` and `tg.initData`. When running outside Telegram (e.g., `http://localhost:18799` in a browser):

| Feature | In Telegram | In Browser |
|---------|------------|------------|
| Colors | Dynamic from themeParams | Hardcoded dark theme (`:root` defaults) |
| Primary action | BottomButton | "New Task" HTML button |
| Task actions | BottomButton/SecondaryButton in detail view | Inline action buttons on cards |
| Navigation | BackButton + view states | Back button in detail view + modal for forms |
| Confirmations | `tg.showConfirm()` | `window.confirm()` |
| Alerts | `tg.showAlert()` | `window.alert()` |
| Haptics | `tg.HapticFeedback` | No-op |
| Claim username | `tg.initDataUnsafe.user` | "webapp-user" |
| Preferences | `tg.DeviceStorage` | `localStorage` |
| sendData | Sends to bot + closes | No-op |

The `body.tg-mode` CSS class is added only in Telegram mode, hiding elements with `.tg-hide` (like the HTML "New Task" button).

## Development & Testing

### Local browser testing

```bash
cd webapp && npm start
# Open http://localhost:18799
```

The app works fully without Telegram — all SDK calls are guarded. You get the dark theme, modal-based forms, and inline action buttons.

### Telegram testing

1. Set up a bot via [@BotFather](https://t.me/BotFather)
2. Expose your local server via ngrok or similar: `ngrok http 18799`
3. Set the `TASK_MANAGER_WEBAPP_URL` environment variable to your HTTPS ngrok URL
4. Send `/tasks` to the bot — the "Dashboard" button will open the Mini App
5. Test: theme matching, BottomButton actions, BackButton navigation, haptic feedback

### Environment variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `TASK_MANAGER_WEBAPP_URL` | URL for the Mini App (must be `https://` or `http://localhost`) | `https://abc123.ngrok.io` |
| `TASKS_FILE` | Override default tasks.json path | `/path/to/tasks.json` |
| `PORT` | Web app server port | `18799` (default) |

## File Map

| File | Responsibility |
|------|---------------|
| `webapp/ui/index.html` | SPA shell, SDK script tag, view containers (list, detail, form), modal |
| `webapp/ui/js/app.js` | All client-side logic: SDK init, theme, navigation, rendering, API calls, Telegram button management |
| `webapp/ui/css/style.css` | Themed styles via CSS custom properties, safe area support, responsive layout |
| `webapp/server.js` | Express server, static files, SPA fallback |
| `webapp/api/routes/tasks.js` | REST API endpoints (GET/POST/PUT/DELETE /api/tasks) |
| `webapp/data/tasks.js` | JSON file data access layer |
| `extensions/task-manager/index.ts` | Bot plugin: commands, agent tool, `web_app_data` handler, session hooks |
