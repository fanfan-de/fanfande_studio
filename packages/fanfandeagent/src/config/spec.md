# Config Module Spec

## 概述
`config` 模块负责读取、验证和组织项目配置。它要把用户配置、系统配置和运行时默认值合并成上层可消费的结构，并提供统一的 schema 入口。

## 核心职责
- 读取系统托管配置目录
- 定义项目级配置 schema
- 组织 provider、agent、tool、share、compaction 等选项
- 暴露 `get()` 供其他模块读取当前配置

## 主要文件
- `config.ts`：配置 schema 与读取逻辑
- `markdown.ts`：配置文档或 markdown 相关处理
- `path.ts`：配置文件路径和目录工具

## 关键类型
- `Info`：完整配置结构
- `Provider`：provider 配置结构

## 约束
- 配置数据必须经过 schema 验证
- 不同来源的配置应该有清晰优先级
- 默认值和用户覆盖值不能混在一起处理
- 配置模块只负责组织数据，不负责执行具体业务
