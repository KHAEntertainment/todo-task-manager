# Phase 3.5: Hybrid Agent Interface

## Problem Statement
The Todo Task Manager provides an excellent interface for the human user via Telegram slash commands (`/task claim task_001`). However, OpenClaw agents do not trigger these slash commands when sending outbound messages. As a result, agents must resort to clunky raw Node.js script evaluation (e.g., `node -e "require('...').claimTask(...)"`) to interact with the task system.

## Proposed Solution: Hybrid Approach
We need to give agents first-class access to the task system through two complementary methods:

### 1. Native Agent Tool (LLM JSON Tool)
Register an OpenClaw Agent Tool via the Plugin SDK (`api.registerTool`) so the LLM can natively invoke the task manager via a JSON schema, just like `read`, `write`, or `exec`.
- **Tool Name:** `task_manager`
- **Actions:** `list`, `add`, `claim`, `complete`, `pause`, `status`, `edit`, `delete`
- **Benefits:** Cleanest integration, safest validation, native to the agent runtime.

### 2. Dedicated CLI Wrapper (`task-cli.js`)
Create a dedicated Node.js CLI script that parses standard arguments to interact with the tasks module.
- **Usage:** `node /home/openclaw/.openclaw/workspace/skills/task-manager/task-cli.js claim task_001`
- **Benefits:** Enables usage by external scripts, cron jobs, and subagents running in isolated PTY sandbox environments where the native plugin tool might not be available.

## Acceptance Criteria
- [ ] A new `task_manager` tool appears in the agent's tool availability list.
- [ ] The agent can successfully call the native tool to claim, edit, and complete tasks.
- [ ] A new `task-cli.js` file is created inside the task-manager skill folder.
- [ ] The CLI wrapper successfully accepts command-line arguments and manipulates the `tasks.json` state.
