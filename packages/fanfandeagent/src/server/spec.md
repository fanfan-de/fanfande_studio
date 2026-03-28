# Server Module Spec

## 概述
`server` 模块负责暴露 HTTP 接口，把项目、session、配置、provider 等能力以路由形式提供给前端或外部客户端。它是 transport 层，不应该承载业务核心逻辑。

## 核心职责
- 组装 Hono 应用
- 注册 `routes/` 下的所有资源路由
- 暴露实例管理接口
- 作为前端和内部模块之间的入口层

## 主要文件
- `server.ts`：服务入口和应用组装
- `routes/projects.ts`：项目相关接口
- `routes/session.ts`：session 相关接口

## 设计原则
- 路由层只做请求 / 响应转换
- 业务逻辑应放回 project、session、provider、config 等模块
- 所有接口都应遵循统一错误响应和数据结构

## 约束
- server 不应直接操作底层数据库表
- 实例释放、重启等操作必须通过统一生命周期入口
- 新增路由时应同步维护文档和类型定义
