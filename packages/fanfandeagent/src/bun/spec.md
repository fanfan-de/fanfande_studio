# Spec: Dynamic Bun Dependency Manager (Runtime Package Orchestrator)

## 1. Context & Goal
I need to implement a module that allows my application to **dynamically install, update, and manage NPM packages at runtime** using the Bun executable. 

The goal is to have a private, cached `node_modules` environment located in a specific cache directory, separate from the main project, where the app can programmatically "add" dependencies and ensure they are up to date.

## 2. Technical Stack
- **Runtime:** Bun
- **Key APIs:** `Bun.spawn`, `Bun.file`, `Bun.write`, `semver` (Bun built-in)
- **Validation:** Zod (for error metadata)
- **Concurrency:** Requires a File-based Lock mechanism (to prevent race conditions during install)

## 3. Core Logic Requirements

### A. Registry Service (`registry.ts`)
- **Functionality:** Query remote package info.
- **Method `info(pkg, field)`:** 
    - Execute `bun info <pkg> <field>` via `Bun.spawn`.
    - Set environment variable `BUN_BE_BUN: "1"`.
    - Return the trimmed stdout or null.
- **Method `isOutdated(pkg, cachedVersion)`:**
    - Fetch the remote `latest` version.
    - If `cachedVersion` is a range (contains `^`, `~`, etc.), use `semver.satisfies`.
    - If it's an exact version, use `semver.order` to compare.
    - Return `true` if the remote version is newer.

### B. Process & Install Service (`index.ts`)
- **Sub-process Wrapper `run(cmd, options)`:**
    - Wrap `Bun.spawn` with full logging of the command and results.
    - Capture `stdout` and `stderr` as text.
    - Throw a structured error if `exitCode !== 0`.
- **Install Logic `install(pkg, version)`:**
    1. **Concurrency Control:** Must use a `Lock` (Write Lock) to ensure only one installation happens at a time.
    2. **State Management:** Maintain a `package.json` in a custom `Global.Path.cache` directory.
    3. **Smart Skip:** 
        - If the package exists and the version is exact/satisfied, skip installation.
        - If version is `latest`, call `Registry.isOutdated` to decide whether to update.
    4. **The `bun add` command:**
        - Use `--cwd <cache_path>`, `--force`, and `--exact`.
        - **Proxy Workaround:** If a proxy is detected (via a `proxied()` helper), add `--no-cache` to avoid Bun issue #19936.
    5. **Version Resolution:** After installing `latest`, read the actual version from the resulting `node_modules/<pkg>/package.json` and update the cache's `package.json` with that exact version to "lock" it for next time.

## 4. Implementation Details (Vibe Requirements)
- **Namespace Pattern:** Use `export namespace BunProc` and `export namespace PackageRegistry`.
- **Error Handling:** Use a custom `NamedError` or a Zod-validated error class (e.g., `InstallFailedError`).
- **Logging:** Implement a structured logger (Service: "bun") that logs "running", "done", and "outdated" status.
- **Cleanup:** Ensure the `package.json` in the cache is automatically created if it doesn't exist.

## 5. File Structure
```text
bun/
├── registry.ts  # Version querying and semver logic
└── index.ts     # Bun.spawn orchestration and install lifecycle
```

## 6. Constraints
- Always use `process.execPath` to ensure the same Bun binary is used for sub-processes.
- Do not use `child_process` from Node.js; use the high-performance `Bun.spawn`.
- Use the modern `using` keyword for the Lock if supported, or ensure a `finally` block releases the lock.

---

### 如何使用这个 Spec：
1. 在你的新项目中打开 AI 辅助编辑器（如 Cursor）。
2. 创建一个新文件 `.cursorrules` 或者直接在 Chat 中粘贴上面的内容。
3. 输入指令：**"Based on the Spec above, please implement the Dynamic Bun Dependency Manager in the `src/util/bun` directory. I will provide the `Global`, `Log`, `Filesystem`, and `Lock` utilities if needed, or you can stub them out first."**
4. AI 将会根据这个规范复刻出逻辑完全一致但适配你新项目的代码。