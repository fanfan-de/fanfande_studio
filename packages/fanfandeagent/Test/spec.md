# Test Folder Spec

## Purpose
This folder contains all test assets for the `fanfandeagent` package: unit tests, integration tests, end-to-end tests, fixtures, and test-only helpers.

## Testing Rules
- Integration and end-to-end tests that verify LLM behavior must use real LLM calls
- Do not use `mock`, `stub`, `fake`, or simulated model output for LLM verification
- If a test needs model access, it must rely on real credentials and a real provider endpoint
- Tests for directory entry, session creation, prompt execution, and result recovery should live here
- Test helpers may exist, but they must not replace real model calls in LLM coverage

## API Layer Tests
- `Test/server.api.test.ts` is a deterministic API smoke test for the Hono server layer
- This file verifies transport behaviors (health check, payload validation, unified 404 envelope)
- It includes validation and missing-session checks for `POST /api/sessions/:id/messages/stream`
- It does not verify LLM behavior and therefore does not require real model calls

## Runtime SDK Tests
- `Test/bun.runtime.test.ts` verifies runtime SDK cache reuse without invoking `bun add`
- `Test/provider.openai-compatible.test.ts` verifies provider runtime loading for `@ai-sdk/openai-compatible`
- These tests use mocks at the install/load boundary and should stay deterministic

## API Real Prompt E2E
- `Test/server.prompt.e2e.test.ts` verifies the real prompt loop through API entry
- Flow: create session via API -> send message to `/api/sessions/:id/messages/stream` -> assert `started` and `done` SSE events
- Requires real model credentials (`DEEPSEEK_API_KEY`)

## Test Commands
- Run runtime package manager tests: `bun run test:bun`
- Run provider runtime loader tests: `bun run test:provider`
- Run server API smoke tests: `bun run test:server`
- Run server prompt e2e test: `bun run test:server-prompt-e2e`
- Run directly: `bun test Test/server.api.test.ts`
- Existing prompt e2e test: `bun run test:prompt`

## Expectations
- Keep tests focused and deterministic where possible
- Prefer asserting observable behavior over internal implementation details
- Clean up temporary files and directories created during test runs
