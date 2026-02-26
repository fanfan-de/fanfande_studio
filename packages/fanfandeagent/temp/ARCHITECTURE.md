# OpenCode 架构文档

## 概述
OpenCode 是一个先进的 AI 代码助手系统，提供多模态交互界面（CLI、TUI、Web），集成多种 AI 模型，支持代码编辑、文件操作、搜索、计划等丰富工具。系统采用分层架构设计，强调可扩展性和模块化。

## 架构层次

### 1. 用户接口层 (User Interface Layer)
**职责**：提供多种用户交互方式，接收用户输入，展示系统输出。

#### 核心组件：
- **CLI (命令行界面)** (`src/cli/`)
  - 20+ 个命令（run、serve、agent、auth、models 等）
  - 支持批量操作和脚本化工作流
  - 提供丰富的输出格式化选项

- **TUI (终端用户界面)** (`src/cli/cmd/tui/`)
  - 交互式终端界面
  - 实时会话管理
  - 组件化 UI 系统（对话框、提示框、主题系统）

- **Web 界面** (`src/server/`)
  - 基于 Hono 的 HTTP 服务器
  - RESTful API + WebSocket 事件流
  - 提供 Web 控制台和远程访问能力

### 2. 核心业务层 (Core Business Layer)
**职责**：处理 AI 会话逻辑、工具调用、权限控制等核心业务。

#### 核心组件：
- **SessionProcessor** (`src/session/processor.ts`)
  - 核心 AI 会话处理引擎
  - 管理消息流、工具调用、状态跟踪
  - 处理重试、压缩、错误恢复

- **工具系统** (`src/tool/`)
  - 15+ 种内置工具：
    - **文件操作**：read、write、edit、glob、grep、ls
    - **代码操作**：codesearch、multiedit、apply_patch
    - **外部访问**：webfetch、websearch、bash
    - **AI 协作**：task、plan、skill、todo
  - 统一的工具注册和执行接口

- **权限系统** (`src/permission/`)
  - 细粒度权限控制
  - 规则集定义和匹配
  - 用户确认和自动决策

- **Agent 系统** (`src/agent/`)
  - AI 代理管理和配置
  - 支持主代理和子代理模式
  - 集成不同 AI 模型的行为特性

### 3. 服务层 (Service Layer)
**职责**：提供基础设施服务，处理通信、事件分发、外部集成。

#### 核心组件：
- **HTTP 服务器** (`src/server/server.ts`)
  - 基于 Hono 框架
  - 支持 REST API、SSE、WebSocket
  - 提供 OpenAPI 文档

- **事件总线** (`src/bus/`)
  - 发布-订阅模式的事件系统
  - 组件间解耦通信
  - 支持全局和实例级事件

- **MCP 集成** (`src/mcp/`)
  - Model Context Protocol 服务器连接
  - OAuth 认证支持
  - 外部工具和资源集成

- **LSP 集成** (`src/lsp/`)
  - Language Server Protocol 支持
  - 代码智能提示和诊断

### 4. 数据层 (Data Layer)
**职责**：管理数据存储、实例状态、配置信息。

#### 核心组件：
- **Instance 管理** (`src/project/`)
  - 项目实例生命周期管理
  - 工作树和沙箱环境
  - 状态持久化和恢复

- **存储系统** (`src/storage/`)
  - Drizzle ORM 数据库抽象
  - SQLite 后端存储
  - JSON 迁移和数据版本管理

- **配置管理** (`src/config/`)
  - 用户和系统配置
  - 多环境配置支持
  - 热重载能力

### 5. 扩展层 (Extension Layer)
**职责**：提供系统扩展能力，支持插件、技能和自定义功能。

#### 核心组件：
- **插件系统** (`src/plugin/`)
  - 可插拔的扩展机制
  - 事件钩子和处理器

- **技能系统** (`src/skill/`)
  - 可复用的 AI 技能定义
  - 技能发现和注册

- **Provider 系统** (`src/provider/`)
  - 20+ AI 模型提供商集成
  - 统一的模型调用接口
  - 认证和配额管理

## 数据流架构

### 典型工作流
```
1. 用户输入 → CLI/TUI/Web → Server API
2. Server → Instance 创建/获取 → Session 创建
3. Session → SessionProcessor → AI 模型调用
4. AI 响应 → 工具调用 → 工具执行
5. 工具结果 → 事件总线 → 状态更新
6. 状态更新 → 事件流 → 客户端显示
```

### 事件驱动架构
- **事件生产者**：SessionProcessor、工具、Server
- **事件消费者**：客户端、日志系统、状态跟踪
- **事件类型**：消息更新、工具状态、权限请求、会话状态

## 关键技术栈

### 运行时
- **Bun** - 高性能 JavaScript 运行时
- **TypeScript** - 类型安全的开发体验

### Web 框架
- **Hono** - 轻量级 HTTP 框架
- **OpenAPI** - API 规范生成

### AI 集成
- **Vercel AI SDK** - AI 模型调用抽象
- **多提供商支持**：OpenAI、Anthropic、Google、Azure、AWS Bedrock 等

### 数据存储
- **Drizzle ORM** - 类型安全的数据库操作
- **SQLite** - 嵌入式数据库

### UI 系统
- **SolidJS** - 响应式 UI 框架（TUI 组件）
- **Clack** - 命令行交互组件

### 工具和基础设施
- **Tree-sitter** - 代码解析
- **Parcel Watcher** - 文件系统监控
- **Bonjour** - mDNS 服务发现

## 扩展性设计

### 插件系统
- 通过事件钩子扩展功能
- 支持自定义工具和技能

### 配置驱动
- 所有组件可通过配置调整
- 支持环境特定的配置覆盖

### 模块化架构
- 每个组件独立且可替换
- 清晰的接口定义和依赖管理

## 部署架构

### 单机部署
- 内置 HTTP 服务器
- 本地数据库存储
- 支持远程客户端连接

### 客户端-服务器模式
- 多客户端连接到同一服务器
- 共享会话和状态
- 跨设备协作支持

## 安全考虑

### 权限模型
- 细粒度的工具访问控制
- 用户确认和自动决策
- 规则集和模式匹配

### 数据隔离
- 项目实例隔离
- 沙箱文件系统操作
- 安全的凭证存储

### 网络安全
- 可选的 HTTP 基础认证
- CORS 配置和白名单
- mDNS 服务发现控制

## 监控和运维

### 日志系统
- 结构化日志记录
- 可配置的日志级别
- 日志文件轮转

### 性能监控
- 请求计时和跟踪
- 资源使用统计
- 错误追踪和报告

---

*本文档最后更新：2026年2月25日*