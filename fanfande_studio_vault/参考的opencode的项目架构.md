```packages里面的内容
app:
这是OpenCode AI平台的前端应用，使用SolidJS + TypeScript + Vite构建。包含：
1. **核心框架**：SolidJS + Solid Router + Tailwind CSS
2. **功能模块**：服务器连接、文件管理、终端、对话会话、代码编辑等上下文提供者
3. **项目结构**：`src/`包含组件和页面，`public/`为静态资源，配置使用Vite + Bun
4. **应用类型**：交互式代码助手/编辑器界面，运行在`localhost:3000`

desktop:
这是 OpenCode 项目的桌面应用程序，使用 Tauri v2 将基于 SolidJS 的 Web 界面打包为原生桌面应用。它包含前端代码（`src/`）、Rust 后端（`src-tauri/`）和构建配置，支持开发、构建和发布原生桌面版本。

console:后端服务层：  
• 身份验证 (OAuth/GitHub/Google)  
• 计费系统 (Stripe 集成)  
• 工作区/用户管理  
• AI 提供商路由 (`/zen/v1/` API)  
• 使用量追踪与限流  
• 邮件模板系统

opencode:
• 会话管理 (`acp/session.ts`)  <br>
• 工具调用循环 (`acp/agent.ts`)  <br>
• 权限决策与交互  <br>• 任务规划与执行  <br>
• 多代理模式 (build/plan/general/explore)||

function:
## 在 AI Agent 项目中的具体作用：
当用户运行 `opencode` CLI 或 AI 在 CI/CD 中工作时：
1. **CLI 会话** → 通过 API 同步到云端 → 团队可通过链接实时查看
2. **GitHub Actions** → OIDC 令牌交换 → 安全访问仓库执行 AI 任务
3. **代码审查** → 同步 PR 变更差异 → 团队协作审查 AI 生成代码
4. **知识共享** → 保存完整会话历史 → 新成员了解项目决策过程
**核心价值**：使 AI 辅助编程从单机工具变为**可协作、可审计、可集成的团队工作流**，支持企业级 AI 软件开发生命周期。

docs:这是一个模板，实际的网站文档就是web
这个 `packages/docs` 文件夹是 OpenCode AI 编码代理的**官方文档站点**，使用 Mintlify 构建并部署在 `opencode.ai/docs`。
## 核心作用
- **用户文档**：提供 OpenCode 安装、配置、使用指南
- **AI 工具集成**：包含 Cursor、Claude Code、Windsurf 等 AI 编码工具的配置指南
- **API 参考**：通过 `openapi.json` 自动生成 SDK API 文档
- **开发资源**：包含代码片段系统、MDX 组件、样式定制等开发文档

web:
这是OpenCode的文档网站，使用Astro + Starlight构建，部署在Cloudflare。包含配置指南、使用说明、开发文档等页面，以及内容分享功能。

enterprise：
**enterprise** 包是 OpenCode AI Agent 的企业级协作平台，提供：
1. **共享与会话同步** (`src/core/share.ts:1-192`) - 创建安全链接分享 AI 对话、消息、代码变更，支持团队协作
2. **企业存储适配器** (`src/core/storage.ts:1-130`) - 可插拔的 S3/R2 存储，适合企业级部署和数据持久化
3. **Web 界面与 API** (`src/routes/api/[...path].ts:1-155`) - 完整的 REST API 和响应式 UI，用于查看、管理共享会话
4. **企业基础设施集成** (`sst-env.d.ts:1-160`) - 集成数据库、认证、支付（Stripe）、邮件服务等企业级资源
相对于核心 CLI 工具 (`opencode`)，`enterprise` 专注于**团队协作**、**知识共享**和**企业集成**，适合组织内部部署和团队使用。

plugin:
这是一个openCode Agent的插件系统包（`@opencode-ai/plugin`），用于扩展Agent功能。
**核心作用**：
- 提供插件框架，让开发者通过钩子扩展Agent能力
- 定义标准化的插件接口和类型
- 支持工具定义、认证提供者、事件处理等扩展点
**主要文件结构**：
- `src/index.ts:219` - 插件主入口，定义`Plugin`类型和`Hooks`接口
- `src/tool.ts:29` - 工具定义辅助函数，使用Zod进行参数验证
- `src/shell.ts:137` - BunShell类型定义，用于安全执行shell命令
- `src/example.ts:19` - 插件使用示例
**关键钩子**：
1. **工具扩展** (`tool`) - 添加自定义工具
2. **认证提供者** (`auth`) - 集成OAuth/API认证
3. **聊天处理** (`chat.message`, `chat.params`) - 拦截/修改聊天消息和参数
4. **权限控制** (`permission.ask`) - 处理权限请求
5. **工具执行钩子** (`tool.execute.before/after`) - 监控工具执行
**插件上下文** (`PluginInput`) 包含：
- `client` - openCode客户端
- `project` - 当前项目信息
- `directory`/`worktree` - 工作目录
- `$` - BunShell实例
这是一个典型的可扩展Agent架构，允许第三方开发者在不修改核心代码的情况下添加新功能。

Script：
**`packages/script` 是 OpenCode 项目中的一个工具包，用于管理版本和发布渠道。**
## 核心文件
- **`package.json`**：包名为 `@opencode-ai/script`，导出 `src/index.ts`
- **`tsconfig.json`**：扩展 Bun 的 TypeScript 配置
- **`sst-env.d.ts`**：SST（Serverless Stack）自动生成的环境类型
- **`src/index.ts`**：主脚本逻辑
## 脚本功能
1. **版本检查**：验证当前 Bun 版本与根 `package.json` 中定义的版本是否一致
2. **渠道判断**：根据环境变量（`OPENCODE_CHANNEL`、`OPENCODE_BUMP`、`OPENCODE_VERSION`）或当前 Git 分支确定发布渠道
3. **版本计算**：
    - 预览版：生成时间戳版本（如 `0.0.0-<channel>-<timestamp>`）
    - 正式版：从 npm 获取最新版本并递增（支持 major/minor/patch bump）
4. **数据导出**：提供 `Script` 对象（渠道、版本、预览标志）并输出 JSON
## 项目上下文
位于 OpenCode monorepo（包含 app、console、desktop、sdk 等包）中，用于构建/发布流程的版本管理工具。

slack：
Slack 是一个团队协作平台，主要用于工作场所的即时通讯、文件共享和项目管理。它提供：
**核心功能：**
- **频道**：按主题或项目组织的聊天空间
- **直接消息**：一对一或小组私聊
- **线程**：在特定消息下展开讨论（本项目利用此功能）
- **集成**：连接第三方工具（GitHub、Jira、Google Drive等）
- **文件共享**：支持文档、图片、视频上传
- **搜索**：强大的历史消息和文件检索
**在本项目中的作用：** `@opencode-ai/slack` 包是一个 Slack 机器人，监听频道消息并为每个线程创建独立的 opencode 会话，实现 AI 助手与 Slack 的集成。

UI：
**项目概述：**
- SolidJS + Tailwind CSS 组件库，用于 opencode AI 开发工具
- 版本 1.1.19，MIT 许可，模块化导出结构
**核心技术栈：**
- **框架**: SolidJS + @kobalte/core（无障碍组件）
- **样式**: Tailwind CSS + 自定义主题系统
- **构建**: Vite + TypeScript（ESNext 目标）
- **特色功能**: 图标精灵表、动态提供商图标获取、Markdown 渲染、Diff 显示
**核心目录结构：**
src/
├── components/     # 30+ UI 组件（按钮、卡片、对话框、diff 等）
├── context/       # SolidJS 上下文
├── hooks/         # 自定义钩子
├── pierre/        # Diff 工具库
├── theme/         # 主题定义系统
├── styles/        # Tailwind 配置和样式
└── assets/        # 图标、字体、音频资源
**关键特性：**
1. **组件设计**: 数据属性驱动（`data-size`、`data-variant`），支持图标集成
2. **主题系统**: 完整的主题上下文和样式变量管理
3. **图标系统**: 自动从 models.dev 获取提供商图标并生成精灵表
4. **工具集成**: 内置 diff 显示、Markdown 渲染、代码高亮
5. **样式生成**: 脚本化 Tailwind 颜色变量生成
**依赖关系：**
- 工作区包: `@opencode-ai/sdk`、`@opencode-ai/util`
- 核心库: SolidJS、Shiki（语法高亮）、Marked、KaTeX（数学公式）
- UI 库: @kobalte/core、virtua（虚拟列表）、solid-list
**构建配置：**
- Vite 开发服务器端口 3001
- 类型检查使用 `tsgo --noEmit`
- 支持 ES 模块和 Worker 构建
这是一个为 opencode AI 平台量身定制的高质量 UI 库，采用现代前端技术栈，注重可访问性和开发体验。

utils：
这是 `@opencode-ai/util` 工具包，包含 10 个实用模块：
- **binary.ts**: 二分搜索函数
- **encode.ts**: base64 编码/解码与 SHA-256 哈希
- **error.ts**: 基于 Zod 的错误类 `NamedError`
- **fn.ts**: 带 Zod 模式验证的函数包装器
- **identifier.ts**: 单调 ID 生成器（递增/递减）
- **iife.ts**: 立即执行函数包装器
- **lazy.ts**: 延迟加载函数
- **path.ts**: 路径处理（文件名、目录、扩展名）
- **retry.ts**: 指数退避重试逻辑，支持瞬态错误检测
- **slug.ts**: 生成易读的 slug（形容词-名词组合）
依赖：Zod。TypeScript 配置为 ESNext。代码遵循项目风格指南（无 `let`/`else`，单次命名）。

SDK：
**用途**  
为 opencode API 提供类型安全的客户端和服务端集成。
**结构**
├── openapi.json           # OpenAPI 3.1.1 规范（生成）
└── js/                    # SDK 主目录
    ├── package.json       # @opencode-ai/sdk 包定义
    ├── src/
    │   ├── index.ts       # 导出客户端、服务器及组合函数
    │   ├── client.ts      # 创建客户端（处理 fetch、目录头）
    │   ├── gen/           # 由 @hey-api/openapi-ts 生成的代码
    │   └── v2/            # v2 版本客户端/服务器
    ├── script/build.ts    # 构建脚本：生成 OpenAPI 客户端 → 格式化 → 编译
    ├── example/example.ts # 使用示例（为文件生成测试）
    ├── tsconfig.json
    └── sst-env.d.ts
**构建流程**
1. 在 `packages/opencode` 中运行 `bun dev generate` 生成 `openapi.json`
2. 使用 `@hey-api/openapi-ts` 生成客户端代码到 `src/v2/gen`
3. 格式化生成代码
4. 删除 `dist` 目录，运行 `tsc` 编译，清理 `openapi.json`
**功能**
- 类型安全的 API 客户端（支持自定义 fetch、目录头）
- 启动本地 opencode 服务器进程（可配置主机/端口/超时）
- 提供 TUI 启动函数
- 通过环境变量 `OPENCODE_CONFIG_CONTENT` 传递配置
**示例**  
`example.ts` 展示了如何创建服务器和客户端，并发起会话请求为文件生成测试。

extension：
这是一个Zed编辑器扩展，用于集成OpenCode AI编码助手到Zed编辑器中。
**结构分析：**
extensions/
└── zed/
    ├── extension.toml     # 扩展配置文件
    ├── LICENSE           # 指向根目录许可证的符号链接
    └── icons/
        └── opencode.svg  # 扩展图标
**扩展配置 (zed/extension.toml:1-37)：**
- **ID**: `opencode` - 开源编码代理
- **版本**: 1.1.19
- **支持平台**: Darwin (ARM64/x86_64), Linux (ARM64/x86_64), Windows x86_64
- **启动命令**: `opencode acp` (Windows使用`opencode.exe`)
- **二进制来源**: GitHub Releases下载预构建包
**功能**：为Zed编辑器添加OpenCode AI助手支持，自动下载对应平台的二进制文件并在编辑器中启动代理服务。


```



```
Scripts:
`script/` 目录包含用于项目维护的 TypeScript 脚本，使用 Bun 运行。主要脚本包括：
- `changelog.ts`: 生成版本变更日志，通过 GitHub API 获取提交并用 AI 总结
- `sync-zed.ts`: 同步 Zed 编辑器扩展
- `stats.ts`: 收集下载和统计信息发送到 PostHog
- `duplicate-pr.ts`: 通过 opencode 代理处理 PR 复制
- 其他脚本用于格式化、发布流程等自动化任务
  
InFra
这是一个 **SST (Serverless Stack)** 基础设施配置文件目录，用于部署 OpenCode 项目到 Cloudflare。
### 核心组件
|文件|用途|
|---|---|
|`stage.ts`|定义域名和部署阶段 (`production`/`dev`)|
|`app.ts`|API Worker + 文档站 (Astro) + Web App|
|`console.ts`|数据库 + 认证 + 支付网关 + 控制台|
|`enterprise.ts`|企业版 Teams 应用|
|`secret.ts`|R2 存储密钥配置|
### 部署架构
- **域名**: `opencode.ai` (生产) / `*.dev.opencode.ai` (开发)
- **数据库**: PlanetScale MySQL
- **存储**: Cloudflare R2 + KV
- **认证**: GitHub + Google OAuth
- **支付**: Stripe Webhook
- **计算**: Cloudflare Workers (API/Auth/LogProcessor) + Cloudflare Pages (Console/WebApp/Enterprise)
### 配置入口
`sst.config.ts` 加载这些模块进行部署。

nix：
这是一个 **Nix 打包配置目录**，用于构建和打包 [OpenCode](https://opencode.ai/)（一个 AI 编程助手）项目。
**文件说明：**
|文件|用途|
|---|---|
|`bundle.ts`|使用 Bun 构建前端（入口点、worker、parser）|
|`opencode.nix`|主 CLI 应用打包配置（Linux/macOS）|
|`desktop.nix`|Tauri 桌面应用打包配置（Linux）|
|`node-modules.nix`|Node.js 依赖的固定输出打包|
|`hashes.json`|依赖的输出哈希（用于可重现构建）|
**scripts/ 目录：**
- `bun-build.ts` - Bun 构建相关
- `canonicalize-node-modules.ts` - 规范化 node_modules
- `normalize-bun-binaries.ts` - 规范化 Bun 二进制文件
- `patch-wasm.ts` - 修补 WASM 引用路径
- `update-hashes.sh` - 更新哈希脚本
这是一个基于 **Nix + Bun + Tauri** 的现代构建系统，用于跨平台打包 AI 编程工具。


`patches/` 目录包含一个针对 `ghostty-web@0.3.0` 的补丁文件，通过 `package.json` 的 `patchedDependencies` 字段应用。该补丁在四个位置增加了 Unicode 码点有效性检查，防止无效码点（如超出 0x10FFFF 或位于代理对范围 0xD800–0xDFFF）导致 `String.fromCodePoint()` 抛出异常。

SDK：
当前目录 `sdks/` 包含 opencode 的 VSCode 扩展 SDK。
**核心内容**：
- `vscode/`：完整的 VS Code 扩展项目
    - `src/extension.ts`：扩展主逻辑，提供三个命令：
        1. `opencode.openTerminal` - 聚焦或创建 opencode 终端（Cmd/Ctrl+Esc）
        2. `opencode.openNewTerminal` - 新建终端会话（Cmd/Ctrl+Shift+Esc）
        3. `opencode.addFilepathToTerminal` - 插入文件引用（Cmd/Ctrl+Alt+K）
    - `package.json`：扩展配置，版本 1.1.19，支持 VS Code ≥1.94.0
    - `esbuild.js`：构建配置，打包为 CommonJS
    - `script/`：发布和发布脚本
    - `images/`：图标资源
**关键功能**：
- 智能终端管理：自动检测现有会话，支持分屏视图
- 上下文感知：自动传递当前文件路径和选中行号（格式如 `@src/extension.ts#L45-52`）
- HTTP 通信：通过随机端口（16384-65535）与 opencode CLI 进程交互
**开发说明**：
- 使用 Bun 作为包管理器
- 构建命令：`bun run package`（生产）或 `bun run compile`（开发）
- 调试：在 `sdks/vscode` 目录中按 F5 启动扩展调试会话
这是 opencode 生态系统的 IDE 集成组件，将 CLI 工具无缝嵌入 VS Code 工作流。

spec：
该目录包含 opencode 项目的性能优化规范，涵盖负载限制、缓存淘汰、请求限流、滚动监听优化、模块化去重、性能路线图和项目管理。所有文件均为 Markdown 格式，无子目录。

```
