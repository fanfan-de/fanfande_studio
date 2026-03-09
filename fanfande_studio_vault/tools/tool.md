根据代码分析，OpenCode 系统中处理 AI agent 工具的核心模块位于以下几个部分：

## 1. __工具定义与接口 (`src/tool/tool.ts`)__

- __核心接口__：`Tool.Info` 定义了工具的基本结构，包括 `id`、`init` 方法和 `execute` 方法
- __类型安全__：使用 Zod schema 定义参数类型和验证
- __上下文传递__：`Tool.Context` 提供会话上下文，包括 `sessionID`、`messageID`、`agent` 等
- __工具定义函数__：`Tool.define()` 用于创建类型安全的工具定义

## 2. __工具注册表 (`src/tool/registry.ts`)__

- __工具收集__：`ToolRegistry` 负责收集所有可用工具，包括：

  - 内置工具（bash、edit、read、glob、grep 等）
  - 自定义工具（从 `{tool,tools}/*.{js,ts}` 文件加载）
  - 插件工具（通过 `Plugin` 系统注册）

- __动态过滤__：根据模型和 agent 配置过滤可用工具

- __条件加载__：某些工具只在特定条件下启用（如 LSP 工具、plan 模式工具）

## 3. __工具执行处理 (`src/session/processor.ts`)__

- __流式处理__：`SessionProcessor` 处理 LLM 流式输出中的工具调用
- __状态管理__：跟踪工具调用的完整生命周期（pending → running → completed/error）
- __防死循环__：检测重复工具调用（doom loop）并触发权限询问
- __错误处理__：处理工具执行错误和权限拒绝

## 4. __工具实现 (`src/tool/*.ts`)__

系统包含丰富的内置工具实现：

- __文件操作__：`edit.ts`、`write.ts`、`read.ts`、`apply_patch.ts`
- __代码搜索__：`grep.ts`、`glob.ts`、`codesearch.ts`
- __系统操作__：`bash.ts`、`task.ts`
- __网络功能__：`webfetch.ts`、`websearch.ts`
- __AI 相关__：`question.ts`、`skill.ts`、`plan.ts`
- __特殊工具__：`invalid.ts`（处理无效工具调用）、`truncation.ts`（输出截断）

## 5. __工具与 LLM 集成 (`src/session/llm.ts`)__

- __工具解析__：`LLM.stream()` 将工具注册表转换为 AI SDK 可用的工具格式
- __权限过滤__：根据 agent 权限配置过滤禁用的工具
- __代理兼容__：为 LiteLLM/Anthropic 代理添加占位工具

## 6. __工具权限管理 (`src/permission/next.ts`)__

- __权限验证__：在执行工具前检查 agent 权限配置
- __用户询问__：当需要用户授权时，通过 `Bus.publish(Permission.Event.Asked)` 触发对话框
- __权限拒绝__：`PermissionNext.RejectedError` 处理权限拒绝情况

## 7. __工具与事件系统集成__

- __事件发布__：工具执行后通过 `Bus.publish()` 发布相关事件（如文件编辑、命令执行）
- __状态同步__：工具执行状态通过事件系统同步到 UI 和存储

## 工具处理完整流程

```javascript
1. 工具注册 → ToolRegistry 收集所有工具定义
2. 权限过滤 → 根据 agent 配置过滤可用工具
3. LLM 集成 → 将工具转换为 AI SDK 格式
4. 流式调用 → SessionProcessor 处理工具调用流
5. 执行验证 → 检查参数验证和权限
6. 实际执行 → 调用工具的 execute() 方法
7. 结果处理 → 截断输出、添加元数据
8. 事件发布 → 通过 Bus 发布工具执行结果
9. 状态更新 → 更新消息部分状态
```

## 关键设计特点

1. __类型安全__：全程使用 Zod schema 验证
2. __插件化__：支持自定义工具和插件工具
3. __权限隔离__：每个 agent 有独立的工具权限
4. __流式处理__：支持实时工具调用和状态更新
5. __错误恢复__：完善的错误处理和重试机制
6. __事件驱动__：通过 bus 系统实现松耦合集成

总结：OpenCode 的工具系统是一个高度模块化、类型安全、权限可控的架构，完美支持 AI agent 的复杂工具调用需求。



我分析了 `src/tool/bash.ts` 文件。这是一个 TypeScript 模块，实现了 OpenCode 平台中的 Bash 工具，允许代理（agent）安全地执行 shell 命令。以下是详细分析：

## 1. 总体功能

该工具封装了 shell 命令执行，提供以下核心能力：

- 执行任意 bash/shell 命令
- 通过 tree-sitter 解析命令语法，进行权限检查
- 支持超时、工作目录配置和命令描述
- 实时输出流式传输与元数据管理
- 处理用户中止和超时终止

## 2. 代码结构

### 2.1 导入依赖

```typescript
import z from "zod"                    // 参数验证
import { spawn } from "child_process"  // 子进程执行
import { Tool } from "./tool"          // 工具基类
import DESCRIPTION from "./bash.txt"   // 工具描述模板
import { Log } from "../util/log"      // 日志系统
import { Instance } from "../project/instance" // 项目实例
import { lazy } from "@/util/lazy"     // 懒加载
import { Language } from "web-tree-sitter" // 语法解析
import { $ } from "bun"                // Bun shell (用于路径解析)
import { Shell } from "@/shell/shell"  // Shell 检测
import { BashArity } from "@/permission/arity" // 权限参数
import { Truncate } from "./truncation" // 截断工具
```

### 2.2 常量配置

- `MAX_METADATA_LENGTH = 30_000`：元数据输出最大长度
- `DEFAULT_TIMEOUT`：从实验性标志获取或默认 2 分钟

### 2.3 解析器初始化

使用 `lazy` 包装异步初始化 tree-sitter 解析器，支持：

- 加载 tree-sitter WASM 运行时
- 加载 bash 语法 WASM
- 返回配置好的解析器实例

### 2.4 工具定义 (`BashTool`)

通过 `Tool.define("bash", ...)` 创建，包含：

#### 参数模式 (Zod Schema)

```typescript
{
  command: z.string().describe("The command to execute"),
  timeout: z.number().describe("Optional timeout in milliseconds").optional(),
  workdir: z.string().describe("The working directory...").optional(),
  description: z.string().describe("Clear, concise description...")
}
```

#### execute 方法

核心执行流程：

1. __工作目录确定__：使用参数或实例目录

2. __命令解析__：用 tree-sitter 解析命令，提取：

   - 可能访问外部目录的命令（cd、rm、cp、mv、mkdir、touch、chmod、chown）
   - 其他命令模式用于权限检查

3. __权限请求__：

   - `external_directory`：访问项目外部目录时
   - `bash`：执行 bash 命令时

4. __命令执行__：`spawn` 创建子进程

5. __输出收集__：实时追加 stdout/stderr，更新元数据

6. __生命周期管理__：

   - 超时处理（默认 2 分钟）
   - 用户中止处理
   - 进程退出清理

7. __结果返回__：包含标题、元数据和原始输出

## 3. 关键技术点

### 3.1 权限系统

- 通过解析命令树识别潜在危险操作
- 对文件操作命令解析参数，解析真实路径
- 使用 `ctx.ask()` 请求用户权限
- 权限模式包括具体命令和通配符模式

### 3.2 跨平台处理

```typescript
// Windows Git Bash 路径转换
const normalized = process.platform === "win32" && resolved.match(/^\/[a-z]\//)
  ? resolved.replace(/^\/([a-z])\//, (_, drive) => `${drive.toUpperCase()}:\`).replace(/\//g, "\\")
  : resolved
```

### 3.3 元数据管理

- 实时更新输出到 `ctx.metadata()`
- 限制元数据长度避免过大 blob
- 包含退出码和命令描述

### 3.4 进程管理

- 使用 `Shell.killTree()` 终止进程树
- 正确处理 abort 信号
- 超时和退出状态跟踪

## 4. 潜在问题与改进建议

### 4.1 安全性考虑

- __当前__：仅检查少数文件操作命令，可能遗漏其他危险命令（如 `dd`、`>` 重定向）
- __建议__：扩展危险命令列表，或采用更严格的默认权限策略

### 4.2 平台兼容性

- __当前__：Windows 路径处理针对 Git Bash，可能不覆盖其他 shell（如 WSL、PowerShell）
- __建议__：增加更多 shell 检测和路径转换逻辑

### 4.3 性能

- __当前__：每次执行都加载 tree-sitter（懒加载但首次有开销）
- __建议__：考虑缓存解析器实例或简化权限检查

### 4.4 错误处理

- __当前__：解析失败时抛出错误，但某些无效命令可能仍能执行
- __建议__：增加命令预验证或更优雅的降级处理

### 4.5 配置灵活性

- __当前__：超时从实验性标志读取，配置分散
- __建议__：统一配置管理，支持更多可调参数

## 5. 架构设计评估

该模块很好地遵循了 OpenCode 代理指南：

- ✅ 使用 Zod 模式进行输入验证
- ✅ 遵循 Result 模式错误处理（通过抛出/返回）
- ✅ 使用 `Log.create()` 进行日志记录
- ✅ 依赖注入通过 `App.provide()` 模式
- ✅ 命名规范：camelCase 变量，PascalCase 类/命名空间

## 6. 与其他模块的关系

- __权限系统__：与 `permission/arity.ts` 和 `tool/external-directory.ts` 交互
- __项目系统__：依赖 `Instance` 确定项目边界
- __Shell 系统__：使用 `Shell` 检测合适的 shell 和进程管理
- __工具框架__：继承 `Tool` 基类，遵循工具接口

## 7. 测试建议

应重点测试：

1. 不同 shell 下的命令执行
2. 权限请求的触发条件
3. 超时和中止行为
4. Windows/Unix 路径处理
5. 元数据截断功能

总的来说，这是一个设计良好的安全命令执行工具，平衡了灵活性和安全性，适合在 AI 代理环境中使用。

您希望我深入分析某个特定部分，还是切换到 ACT 模式进行修改/优化？


定义一个工具，需要什么

工具名，
工具的初始化方法？

