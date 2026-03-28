# Database Module Spec

## 概述
`database` 模块是项目的 SQLite 访问层。它负责把 Zod schema 和 SQLite 表结构连接起来，并提供统一的 CRUD 能力，避免业务层直接拼接 SQL。

## 核心职责
- 管理 SQLite 连接
- 根据 Zod schema 生成表结构
- 提供 insert / select / update / delete 等 CRUD 方法
- 在 SQLite record 和业务对象之间做类型转换

## 主要文件
- `Sqlite.ts`：数据库连接和 CRUD 实现
- `parser.ts`：Zod 到表结构的转换逻辑

## 关键能力
- `createTableByZodObject()`
- `createTableByZodDiscriminatedUnion()`
- `findById()` / `findMany()` / `findOne()`
- `insertOne()` / `insertMany()` / `updateById()` / `deleteById()`

## 约束
- 业务层不应直接拼接 SQL
- 所有持久化模型应尽量从 Zod schema 推导
- union 类型应使用统一的数据拆分和重组策略
- SQLite 记录读写要保持可逆，避免信息丢失
