# Test Folder Spec

## Purpose
This folder contains all test assets for the `fanfandeagent` package: unit tests, integration tests, end-to-end tests, fixtures, and any test-only helpers.

## Testing Rules
- Integration and end-to-end tests must use real LLM calls
- Do not use `mock`, `stub`, `fake`, or any other simulated model output for LLM verification
- If a test needs model access, it must rely on real credentials and a real provider endpoint
- Tests that exercise the directory entry, session creation, prompt execution, and result recovery flow should live here
- Test helpers may exist, but they must not replace the real model call in LLM coverage

## Expectations
- Keep tests focused and deterministic where possible
- Prefer asserting observable behavior over internal implementation details
- Clean up temporary files and directories created during test runs
