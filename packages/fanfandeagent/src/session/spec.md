# Session Module Spec

## Overview
`session` is responsible for the full lifecycle of a conversation or coding task. It connects user input, model output, tool calls, file changes, and persistence so history can be replayed, recovered, and continued.

See [SESSION_ARCHITECTURE.md](./SESSION_ARCHITECTURE.md) for deeper design notes.

## Core Responsibilities
- Define `SessionInfo`, `MessageInfo`, `Part`, and related data models
- Create and maintain session records
- Organize the chat loop into a recoverable flow
- Convert historical messages into AI SDK-compatible inputs
- Write messages and parts back to SQLite

## Main Files
- `session.ts`: session records, CRUD, and events
- `message.ts`: message and part data structures and conversion
- `llm.ts`: model stream adaptation
- `prompt.ts`: session prompt orchestration
- `processor.ts`: message processing and state progression
- `status.ts`: runtime status query and management
- `shell.ts`: shell execution wrapper

## Public API
- `createSession()`: create a new session record
- `toModelMessages()`: convert historical messages into model input
- `prompt()`: start one session interaction
- `loop()`: continuously drive model and tool execution

## Constraints
- Runtime state and persisted state must remain separate
- All historical records should be replayable
- Writes for tool calls and model output must preserve ordering
- Session lifecycle changes should be expressed through events or a state layer
