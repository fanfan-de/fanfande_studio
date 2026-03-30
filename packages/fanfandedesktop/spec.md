# FanfandeDesktop Spec (Electron Frontend)

## 定位

`packages/fanfandedesktop` 是 `fanfande_studio` 的 Electron 前端工程目录。  
该目录负责桌面端 UI、交互流程、前端状态与网关适配，不承载后端业务实现。

## 核心原则

- 运行平台：Windows / macOS / Linux。
- 桌面壳：Electron。
- 前端栈：React + TypeScript + Vite。
- 前后端解耦：前端不直接引用 `packages/fanfandeagent/src/**`。
- 协议驱动：通过 contracts（后续新增包）或网关接口与后端通信。

## 开发边界

- 前端只能依赖：
  - UI 组件、状态管理、路由、测试框架
  - 网关接口（`Gateway`）与协议类型
- 前端不能依赖：
  - 后端内部模块
  - 后端数据库模型实现细节

## 网关约定（V1）

- `MockGateway`：本地开发默认使用，不依赖后端服务。
- `HttpGateway`：联调使用，对接 `fanfandeagent` HTTP API。
- UI 层只调用网关接口，不直接发 `fetch` 到业务地址。

## V1 功能范围

1. 项目列表
2. 创建会话
3. 会话消息流式展示（SSE）
4. 设置页（后端地址、模型基础配置）

## 测试指令（先约定，后补实现）

```bash
# 单元测试（前端）
bun run test

# Mock 适配器测试（不依赖后端）
ADAPTER=mock bun run test

# HTTP 联调测试（依赖后端）
ADAPTER=http bun run test:integration

# Electron 端到端测试
bun run test:e2e
```

## 当前状态

- 当前文档用于确认 `fanfandedesktop` 为 Electron 前端工作区。
- 下一步按该 spec 初始化目录结构与脚手架。
