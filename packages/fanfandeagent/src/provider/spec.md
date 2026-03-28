# Provider Module Spec

## 概述
`provider` 模块负责把不同模型供应商统一成一套可查询、可实例化、可适配的内部结构。它既要处理来自 `models.dev` 的基础定义，也要处理来自环境变量和项目配置的覆盖信息。

## 核心职责
- 统一 `ProviderInfo` 和 `Model` 数据结构
- 从 `models.dev` 读取可用 provider / model
- 合并环境变量、配置文件和内置默认值
- 根据 `providerID/modelID` 查询可用模型
- 为 AI SDK 构造可复用的 provider 实例

## 主要文件
- `provider.ts`：provider 注册表、模型查询、错误定义
- `modelsdev.ts`：外部模型目录的适配层
- `transform.ts`：模型能力和元数据归一化

## 关键 API
- `list()`：列出当前可用 provider
- `getProvider(providerID)`：获取 provider 信息
- `getModel(providerID, modelID)`：获取具体模型信息
- `fromModelsDevProvider(provider)`：把 models.dev 数据转换成内部结构

## 约束
- 所有 provider / model 都必须先归一化再暴露给上层
- 查询失败时应提供可读的错误和候选建议
- 模型能力字段应尽量保持单一结构，避免上层区分不同供应商差异
- 实例缓存应以 `Instance.state()` 进行隔离
