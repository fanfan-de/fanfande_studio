# Snapshot Module Spec

## 概述
`snapshot` 模块负责把工作区代码变更记录成可追踪的快照，并支持 diff、restore、revert 和 cleanup 等操作。它本质上是围绕 git 工作树构建的一层版本快照能力。

## 核心职责
- 初始化快照能力
- 记录当前工作区状态
- 生成差异和文件级变更列表
- 还原、回滚或清理快照

## 主要文件
- `index.ts`：快照 API 和 git 交互
- `explain.md`：快照行为说明

## 关键 API
- `init()`：注册清理任务
- `track()`：记录当前工作区树
- `diff()`：生成变更 diff
- `diffFull()`：生成文件级变更详情
- `restore()` / `revert()`：回滚和恢复
- `cleanup()`：清理旧快照数据

## 约束
- 非 git 项目应尽量降级为无操作
- 快照必须以实例工作区为边界
- restore / revert 操作必须谨慎处理路径和文件存在性
- 定期清理逻辑应避免影响当前活跃会话
