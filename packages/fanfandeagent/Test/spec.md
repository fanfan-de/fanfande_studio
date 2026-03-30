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
- It does not verify LLM behavior and therefore does not require real model calls

## Test Commands
- Run server API smoke tests: `bun run test:server`
- Run directly: `bun test Test/server.api.test.ts`
- Existing prompt e2e test: `bun run test:prompt`

## Expectations
- Keep tests focused and deterministic where possible
- Prefer asserting observable behavior over internal implementation details
- Clean up temporary files and directories created during test runs
