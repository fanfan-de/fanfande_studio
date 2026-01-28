以下是《OpenCode 贡献指南》的中文翻译：

---

# 贡献 OpenCode

我们希望你能轻松地为 OpenCode 做出贡献。以下是会被合并的最常见的更改类型：

- 修复 Bug
- 添加 LSP / 格式化工具 (Formatters)
- 改进 LLM（大语言模型）性能
- 支持新的服务商 (Providers)
- 修复针对特定环境的兼容性问题
- 补充缺失的标准行为
- 改进文档

然而，**任何 UI 或核心产品功能**在实现之前，必须经过核心团队的设计审查。

如果你不确定某个 PR（拉取请求）是否会被接受，可以随时询问维护者，或查看带有以下标签的问题（Issues）：

- [`help wanted`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted)（欢迎帮助）
- [`good first issue`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22)（适合新手的任务）
- [`bug`](https://github.com/anomalyco/opencode/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug)（缺陷）
- [`perf`](https://github.com/anomalyco/opencode/issues?q=is%3Aopen%20is%3Aissue%20label%3A%22perf%22)（性能优化）

> [!NOTE]
> 忽略这些准则的 PR 可能会被直接关闭。

想领一个任务？请留言，除非是我们已经在处理的任务，否则维护者可能会将其分配给你。

## 开发 OpenCode

- 运行要求：Bun 1.3+
- 在仓库根目录下安装依赖并启动开发服务器：

  ```bash
  bun install
  bun dev
  ```

### 在不同目录下运行

默认情况下，`bun dev` 会在 `packages/opencode` 目录下运行 OpenCode。要在其他目录或仓库运行：

```bash
bun dev <目录路径>
```

要在 OpenCode 仓库自身的根目录下运行：

```bash
bun dev .
```

### 构建“本地版本” (localcode)

编译独立的可执行文件：

```bash
./packages/opencode/script/build.ts --single
```

然后通过以下方式运行：

```bash
./packages/opencode/dist/opencode-<平台>/bin/opencode
```

请将 `<平台>` 替换为你的平台（例如：`darwin-arm64`, `linux-x64`）。

- **核心组成部分：**
  - `packages/opencode`: OpenCode 核心业务逻辑与服务端。
  - `packages/opencode/src/cli/cmd/tui/`: TUI（终端界面）代码，使用 SolidJS 和 [opentui](https://github.com/sst/opentui) 编写。
  - `packages/app`: 共享的 Web UI 组件，使用 SolidJS 编写。
  - `packages/desktop`: 原生桌面应用，使用 Tauri 构建（封装了 `packages/app`）。
  - `packages/plugin`: `@opencode-ai/plugin` 的源码。

### 理解 bun dev 与 opencode 的区别

在开发过程中，`bun dev` 是已构建好的 `opencode` 命令的本地等价物。两者运行相同的 CLI 接口：

```bash
# 开发环境 (在项目根目录运行)
bun dev --help           # 显示所有可用命令
bun dev serve            # 启动无头 (headless) API 服务
bun dev web              # 启动服务并打开 Web 界面
bun dev <目录>           # 在指定目录启动 TUI

# 生产环境
opencode --help          # 显示所有可用命令
opencode serve           # 启动无头 (headless) API 服务
opencode web              # 启动服务并打开 Web 界面
opencode <目录>           # 在指定目录启动 TUI
```

### 运行 API 服务

启动 OpenCode 无头 API 服务：

```bash
bun dev serve
```

默认在 4096 端口启动。你可以指定其他端口：

```bash
bun dev serve --port 8080
```

### 运行 Web 应用

在开发期间测试 UI 更改：

1. **首先，启动 OpenCode 服务**（参见上面的[运行 API 服务](#运行-api-服务)部分）。
2. **然后运行 Web 应用：**

```bash
bun run --cwd packages/app dev
```

这将在 http://localhost:5173 启动本地开发服务器。大多数 UI 更改可以在此处测试，但必须运行服务端才能获得完整功能。

### 运行桌面应用

桌面应用是一个封装了 Web UI 的原生 Tauri 应用。

运行原生桌面应用：

```bash
bun run --cwd packages/desktop tauri dev
```

这会启动 http://localhost:1420 的 Web 开发服务并打开原生窗口。

如果只需要 Web 开发服务（不需要原生壳子）：

```bash
bun run --cwd packages/desktop dev
```

创建生产环境 `dist/` 并构建原生应用安装包：

```bash
bun run --cwd packages/desktop tauri build
```

这会自动通过 Tauri 的 `beforeBuildCommand` 运行构建命令。

> [!NOTE]
> 运行桌面应用需要额外的 Tauri 依赖（Rust 工具链、平台特定库）。请参考 [Tauri 预备工作](https://v2.tauri.app/start/prerequisites/) 进行设置。

> [!NOTE]
> 如果你修改了 API 或 SDK（例如 `packages/opencode/src/server/server.ts`），请运行 `./script/generate.ts` 来重新生成 SDK 及相关文件。

请尝试遵循 [风格指南](./AGENTS.md)。

### 设置调试器 (Debugger)

目前 Bun 的调试功能还不完善。希望这份指南能帮你完成设置并避免一些坑。

调试 OpenCode 最可靠的方法是在终端手动运行 `bun run --inspect=<url> dev ...`，然后通过该 URL 附加调试器。其他方法可能会导致断点映射错误（至少在 VSCode 中是这样）。

**注意事项：**

- 如果你想运行 OpenCode TUI 并在服务端代码中触发断点，你可能需要运行 `bun dev spawn` 而不是普通的 `bun dev`。这是因为 `bun dev` 在工作线程中运行服务端，断点在那里可能失效。
- 如果 `spawn` 对你不起作用，可以分别调试服务端：
  - 调试服务端：`bun run --inspect=ws://localhost:6499/ --cwd packages/opencode ./src/index.ts serve --port 4096`，然后通过 `opencode attach http://localhost:4096` 连接 TUI。
  - 调试 TUI：`bun run --inspect=ws://localhost:6499/ --cwd packages/opencode --conditions=browser ./src/index.ts`

**其他技巧：**

- 根据你的工作流，你可能想用 `--inspect-wait` 或 `--inspect-brk` 代替 `--inspect`。
- 每次都指定 URL 很麻烦，你可以 `export BUN_OPTIONS=--inspect=ws://localhost:6499/`。

#### VSCode 设置

如果你使用 VSCode，可以使用我们的示例配置：[.vscode/settings.example.json](.vscode/settings.example.json) 和 [.vscode/launch.example.json](.vscode/launch.example.json)。

**可能存在问题的调试方法：**

- 使用 `"request": "launch"` 的调试配置可能会导致断点映射错误。
- 在 VSCode 的 `JavaScript Debug Terminal` 中运行 OpenCode 也会出现同样的问题。

话虽如此，你仍然可以尝试这些方法，也许在你的环境下能正常工作。

## PR 期望

### 问题优先原则 (Issue First Policy)

**所有 PR 必须关联一个现有的 Issue。** 在开启 PR 之前，请先创建一个 Issue 描述 Bug 或功能。这有助于维护者进行分流并防止重复劳动。没有关联 Issue 的 PR 可能会被直接关闭而不予审查。

- 在 PR 描述中使用 `Fixes #123` 或 `Closes #123` 来链接 Issue。
- 对于微小的修复，简单的 Issue 即可——只要能让维护者理解问题背景。

### 通用要求

- 保持 PR 小而专注。
- 解释问题以及为什么你的更改能修复它。
- 在添加新功能之前，确保代码库的其他地方尚未实现该功能。

### UI 更改

如果你的 PR 包含 UI 更改，请附带展示更改前后对比的**截图或视频**。这有助于维护者更快地审查并给出反馈。

### 逻辑更改

对于非 UI 更改（Bug 修复、新功能、重构），请说明**你如何验证其有效性**：

- 你测试了什么？
- 审查者如何复现/确认该修复？

### 禁止 AI 生成的长篇大论

不接受 AI 生成的冗长 PR 描述和 Issue。请尊重维护者的时间：

- 编写简短、专注的描述。
- 用你自己的话解释改了什么以及为什么改。
- 如果你无法简短地说明清楚，那么你的 PR 可能太大了。

### PR 标题规范

PR 标题应遵循约定式提交 (Conventional Commits) 标准：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档或 README 更改
- `chore:` 维护任务、依赖更新等
- `refactor:` 代码重构（不改变行为）
- `test:` 添加或更新测试

你可以选择性地添加范围 (scope) 以指示受影响的包：

- `feat(app):` app 包的新功能
- `fix(desktop):` desktop 包的 Bug 修复

示例：
- `docs: update contributing guidelines`
- `fix: resolve crash on startup`
- `feat(app): add dark mode support`

### 代码风格偏好

这些不是强制性的，但属于通用指南：

- **函数：** 逻辑尽量保持在单个函数内，除非拆分能带来明显的复用或组合好处。
- **解构：** 避免对变量进行不必要的解构。
- **控制流：** 尽量避免使用 `else` 语句。
- **错误处理：** 尽可能优先使用 `.catch(...)` 而非 `try`/`catch`。
- **类型：** 追求精确的类型，避免使用 `any`。
- **变量：** 坚持不可变模式 (immutable patterns)，避免使用 `let`。
- **命名：** 在保持描述性的前提下，选择简洁的单单词标识符。
- **运行时 API：** 在适用场景下优先使用 Bun 的助手函数（如 `Bun.file()`）。

## 功能请求 (Feature Requests)

对于全新的功能，请先从**设计对话**开始。创建一个 Issue 描述问题、你的建议方案（可选）以及为什么它属于 OpenCode。核心团队会决定是否推进；请等待批准后再开启功能 PR，不要直接提交。