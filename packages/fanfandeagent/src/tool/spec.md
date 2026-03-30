# Tool Module Spec

## Goal
The `tool` module exposes model-callable capabilities as validated, executable, and auditable interfaces.
It is the agent capability boundary, not the business implementation layer.

## Design Principles
1. One tool per file for independent maintenance and testing.
2. All inputs must be validated by Zod.
3. Outputs should be concise, deterministic, and easy to write back into session history.
4. Prefer structured file tools first; `exec_command` is a fallback tool.
5. All filesystem paths must pass project boundary checks.

## Directory Responsibilities
- `tool.ts`
  - Defines `ToolInfo` and the `define()` wrapper.
  - Applies shared validation and error wrapping.
- `registry.ts`
  - Collects built-in and custom tools.
  - Provides listing and lookup by tool id.
- `shared.ts`
  - Shared path resolution, file read/write, and line-range formatting.
- `read-file.ts`
  - Reads full files or line ranges.
- `write-file.ts`
  - Writes full text files.
- `replace-text.ts`
  - Replaces exact text in files.
- `apply-patch.ts`
  - Applies unified diff patches (`apply_patch`) to files.
- `list-directory.ts`
  - Lists directory entries.
- `search-files.ts`
  - Searches text in files.
- `exec-command.ts`
  - Executes bash commands within project boundaries as a fallback.

## ToolInfo Structure
- `id`: tool name.
- `init()`: initializes runtime tool behavior from context.
- `description`: model and UI facing tool description.
- `parameters`: Zod input schema.
- `execute()`: tool execution logic.
- `formatValidationError()`: optional custom validation error formatter.

## Runtime Context
`Context` includes:
- `sessionID`
- `messageID`
- `cwd`
- `worktree`
- `abort`

## Recommended Core Tool Set
1. `read-file`
2. `list-directory`
3. `search-files`
4. `write-file`
5. `replace-text`
6. `apply_patch`
7. `exec_command`

Role split:
- Explore: `read-file`, `list-directory`, `search-files`
- Modify: `write-file`, `replace-text`, `apply_patch`
- Fallback shell execution: `exec_command`

## `exec_command` Spec
### Tool ID
`exec_command`

### Parameters
- `command: string`
  - Required bash command text.
- `workdir?: string`
  - Optional working directory; defaults to current project directory.
- `timeoutMs?: number`
  - Optional command timeout in milliseconds.
- `maxOutputChars?: number`
  - Optional max retained chars for each stream (`stdout` and `stderr`).
- `allowUnsafe?: boolean`
  - Optional flag to allow known risky command patterns.
- `description?: string`
  - Optional human-readable summary used for result title.

### Behavior Constraints
- Must execute only inside project boundaries.
- Must support abort signal cancellation.
- Must block known dangerous command patterns by default.
- Must return clear execution summary:
  - command
  - workdir
  - shell path
  - exit status
  - stdout
  - stderr
- Must explicitly note when output is truncated.

### Failure Handling
- Error if `workdir` is not a directory.
- Error if no bash executable can be found.
- Schema errors are surfaced by `define()` wrapper validation.
- Timeout and abort must terminate subprocess and mark status in output.

## `apply_patch` Spec
### Tool ID
`apply_patch`

### Parameters
- `patch: string`
  - Unified diff text, one or more file patches.

### DSL
Unified diff key syntax:
- File headers: `--- <old>` and `+++ <new>`
- Hunk header: `@@ -<oldStart>,<oldCount> +<newStart>,<newCount> @@`
- Line types:
  - ` ` context line
  - `-` removed line
  - `+` added line

### Supported Change Types
- Update existing files.
- Create files (`--- /dev/null`).
- Delete files (`+++ /dev/null`).
- Move/rename files (`oldPath != newPath`).

### Safety and Behavior Constraints
- All paths must pass project boundary checks.
- Hunks require strict context match.
- Parse mismatch or context mismatch must fail fast (no silent partial fix).

### Example
```diff
--- a/src/example.txt
+++ b/src/example.txt
@@ -1,2 +1,2 @@
 hello
-world
+agent
```

## Extension Ideas
1. `delete-file`
2. `move-file`
3. `git-status` / `git-diff`
4. Binary/image-related tools
