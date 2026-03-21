# Task Manager Skill

## What

A skill wrapper for the Todo Task Manager that enables agents to invoke task operations as tools in their context window, without needing to remember specific slash commands or CLI wrappers.

## Why

The Todo Task Manager plugin exposes a native `task_manager` tool via the plugin SDK, but this tool is only available to agents when they are running in a proper agent session (spawned via CLI or OpenClaw's internal session management).

Some contexts (subagents, PTY sessions, cron jobs) may not have access to the native tool, so this skill provides a fallback mechanism for task management in any context.

## Usage

### When to Use This Skill

**For Agents:**
- If the `task_manager` tool is available in your context window, use it directly. It's more reliable than invoking this skill.
- If the tool is NOT available (subagents, PTY sessions), this skill provides a fallback interface.

**For Humans:**
- Continue using Telegram slash commands directly. This skill is primarily for agent use cases.

## Available Operations

This skill is a simple passthrough that wraps the Todo Task Manager core functionality. All operations are delegated to the underlying tasks.js module.

### Task Operations

- `list()` — List all tasks (same as `/tasks all`)
- `get(taskId)` — Get a specific task by ID
- `add(task)` — Create a new task (same as `/task add`)
- `update(taskId, updates)` — Update task fields
- `claim(taskId, agentId)` — Claim a task (same as `/task claim`)
- `complete(taskId, agentId)` — Mark task as completed (same as `/task complete`)
- `delete(taskId)` — Delete a task (same as `/task delete`)

### Utility Operations

- `readTasks()` — Read all tasks from storage
- `generateTaskId()` — Generate a new task ID
- `validateDependencies()` — Check dependency references
- `getDependentTasks(taskId)` — Find tasks that depend on this one

## Implementation

All functions delegate to the Todo Task Manager core module (`skills/task-manager/tasks.js`) for data operations. This ensures consistency across all access methods (CLI, plugin, skill, agent tool).

## Examples

### From Agent Context

```typescript
// Agent can call the tool directly
{
  "name": "task_manager",
  "action": "list"
}
```

### From CLI

```bash
# Use the skill directly if available
task-manager list

# Or fall back to the core module
node /home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js list
```

## Related

- **Plugin:** `/home/openclaw/.openclaw/extensions/task-manager/` — Telegram commands and native agent tool
- **CLI Wrapper:** `/home/openclaw/.openclaw/extensions/task-manager/task-cli.js` — Standalone CLI script
- **Core Module:** `/home/openclaw/.openclaw/workspace/skills/task-manager/tasks.js` — JSON data storage
