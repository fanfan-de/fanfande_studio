## 1. 背景与目标（Background & Goal）

本 Feature Spec 定义 **通用 AI Agent 后端核心服务** 的功能边界、系统职责与实现约束，作为后续架构设计、技术实现与迭代规划的依据。

该系统目标是复刻并抽象 **Claude Code / OpenCode** 的核心交互能力，使 LLM 能通过自然语言安全、可控地操纵本地或远程计算环境（文件系统、终端、工具）。

核心设计目标：

- 通用性：不绑定单一模型、单一 Provider、单一运行环境
    
- 可扩展性：支持 MCP / Skill / LSP / ACP 等能力插件化接入
    
- 安全性：权限、沙箱、审计为一等公民
    
- 开发者体验：CLI + TUI + API 并存
    

---

## 2. 系统定位（System Positioning）

- 架构模式：Client–Server（Local）
    
- 当前 Feature 范围：**Server 端（Agent Core Backend）**
    
- 即便 Client 与 Server 本地运行，逻辑上必须严格解耦
    

Server 端职责：

- Agent 核心循环调度
    
- LLM Provider 抽象
    
- 工具 / 环境访问代理
    
- 状态管理（对话、权限、配置、日志）
    

非本 Feature 范围（但需预留接口）：

- GUI 客户端
    
- Web Dashboard
    
    

---

## 3. 技术约束（Tech Stack & Constraints）

- 语言：TypeScript
    
- Runtime：Bun
    
- 构建目标：跨平台（macOS / Linux / Windows）
    

### 3.1 第三方依赖（已确定）

- **Vercel AI SDK**：
    
    - LLM Provider 抽象
        
    - Streaming / Tool Call 支持
        
- **Zod**：
    
    - Schema 校验
        
    - 配置与消息结构的强类型约束
        

---

## 4. 核心功能模块（Feature Breakdown）

### 4.1 Agent 核心循环（Agent Core Loop）

#### 描述

实现一个类似 ReAct / Toolformer 的 Agent 循环，用于在以下步骤中不断迭代：

1. 接收用户输入（自然语言 / CLI 指令）
    
2. 构造上下文（对话、环境状态、权限）
    
3. 调用 LLM
    
4. 解析 LLM 输出（文本 / Tool Call / MCP / Skill）
    
5. 执行工具或环境操作
    
6. 将结果反馈回上下文
    
7. 判断是否继续循环或终止
    

#### 关键特性

- Streaming 支持
    
- 多步推理（Multi-step Reasoning）
    
- 可插拔的 Loop Policy（最大步数、Token 限制等）
    

---

### 4.2 MCP（Model Context Protocol）支持

#### 描述

支持 MCP 协议，用于标准化：

- Tool 描述
    
- Context 注入
    
- Agent 与外部能力的通信方式
    

#### 要求

- MCP Server / Client 模式支持
    
- MCP Tool 的动态注册与发现
    
- 与 Agent Loop 深度集成
    

---

### 4.3 Skill 系统

#### 描述

Skill 是对高阶能力的抽象封装，通常由多个 Tool 或操作流程组成。

#### 能力要求

- Skill 生命周期管理（注册 / 启用 / 禁用）
    
- Skill 权限隔离
    
- Skill 可声明依赖（文件系统 / 网络 / LSP）
    

---

### 4.4 LSP（Language Server Protocol）支持

#### 描述

通过 LSP 接入编程语言智能能力，为 Agent 提供：

- 代码补全
    
- 定位定义
    
- 语义诊断
    
- 重构支持
    

#### 要求

- 多语言 LSP 进程管理
    
- 与 Agent Context 的双向同步
    

---

### 4.5 ACP（Agent Communication Protocol）

#### 描述

用于 Agent 与 Agent / Agent 与 Client 的通信协议。

#### 初期目标

- 单 Agent 对多 Client
    
- 支持事件流（Event-based）通信
    

---

### 4.6 权限与安全管理（Permissions & Security）

#### 描述

所有环境操作必须经过权限系统校验。

#### 权限维度示例

- 文件系统（读 / 写 / 删除）
    
- Shell / Terminal 执行
    
- 网络访问
    
- Skill 使用
    

#### 特性

- 默认最小权限原则
    
- 用户确认机制（Prompt-based Approval）
    
- 操作审计日志
    

---

### 4.7 TUI 与 CLI 交互

#### CLI

- 启动 / 停止 Agent Server
    
- 执行一次性 Agent 指令
    
- 管理配置、Provider、权限
    

#### TUI

- 会话实时展示
    
- Tool / Skill 调用可视化
    
- 权限请求交互
    

---

### 4.8 配置管理模块

#### 描述

集中管理所有运行配置。

#### 配置类型

- LLM Provider 配置（API Key / Endpoint）
    
- 默认模型策略
    
- 权限策略
    
- 日志等级
    

#### 要求

- 支持文件 + 环境变量
    
- Zod 校验
    
- 热加载（可选）
    

---

### 4.9 Provider 抽象层

#### 描述

支持市面主流 API Provider：

- OpenAI
    
- Anthropic
    
- Azure OpenAI
    
- 本地模型（Ollama / LM Studio 等）
    

#### 要求

- 统一接口
    
- Streaming / Tool Call 能力一致性
    

---

### 4.10 对话管理（Conversation Management）

#### 能力

- 会话创建 / 恢复
    
- 本地持久化
    
- 导出 / 分享（JSON / Markdown）
    

---

### 4.11 日志系统（Logging）

#### 日志类型

- 系统日志
    
- Agent 推理日志
    
- Tool 调用日志
    
- 权限审计日志
    

#### 要求

- 结构化日志
    
- 可配置等级
    

---

### 4.12 自动更新与版本检查（Self-Update Mechanism）

#### 描述

Agent Server 能够检测新版本并提示或自动更新。

#### 功能点

- 当前版本识别
    
- 更新源配置（GitHub Release / Registry）
    
- 用户确认机制
    

---

## 5. 非功能性需求（Non-Functional Requirements）

- 可测试性：核心模块可独立单元测试
    
- 可观测性：日志 + 事件
    
- 可扩展性：新协议 / 新 Provider 不影响核心循环
    

---

## 6. 里程碑（Milestones - Draft）

- M1：Agent Loop + Provider 抽象
    
- M2：Tool / MCP 基础支持
    
- M3：CLI + 权限系统
    
- M4：LSP / Skill
    
- M5：TUI + 更新机制
    

---

> 本文档为 Feature Spec 初稿（v0.1），后续将基于架构设计与实现反馈持续迭代。