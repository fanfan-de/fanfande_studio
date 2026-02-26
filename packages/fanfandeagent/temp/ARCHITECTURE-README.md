# OpenCode 架构文档说明

## 文档概述

本目录包含 OpenCode 项目的完整架构文档和图表，旨在帮助开发人员、架构师和新团队成员理解系统设计。

## 文件说明

### 1. `ARCHITECTURE.md`
**完整的架构文档**
- 系统概述和设计理念
- 详细的架构层次说明（5层架构）
- 核心组件职责描述
- 数据流和工作流程解释
- 技术栈和扩展性设计
- 安全和运维考虑

### 2. `architecture-diagram.mermaid`
**Mermaid 格式的架构图表**
包含三个主要图表：

#### 图表1：高层次组件视图
- 展示5个架构层及其组件
- 显示组件间的依赖关系和数据流
- 使用颜色编码区分不同层次

#### 图表2：典型工作流程示例
- 展示用户从输入到输出的完整流程
- 包含决策点和分支路径
- 说明事件驱动的工作方式

#### 图表3：事件驱动架构概览
- 展示事件生产者、事件总线和消费者的关系
- 说明发布-订阅模式的实现

## 如何使用这些文档

### 对于新团队成员
1. 先阅读 `ARCHITECTURE.md` 了解整体架构
2. 查看 Mermaid 图表理解组件关系
3. 重点关注与自己工作相关的模块

### 对于架构师和 Tech Lead
1. 使用架构文档作为设计参考
2. 基于组件图分析系统依赖
3. 参考扩展性设计进行系统演进

### 对于开发人员
1. 理解自己开发的模块在整体架构中的位置
2. 查看数据流了解模块间通信方式
3. 参考技术栈选择合适的开发模式

## 图表查看方式

### 在线查看
将 Mermaid 代码复制到以下网站查看：
- [Mermaid Live Editor](https://mermaid.live/)
- [Mermaid Chart Editor](https://www.mermaidchart.com/)

### VS Code 查看
安装以下扩展：
- **Mermaid Preview** - 预览 Mermaid 图表
- **Mermaid Markdown Syntax Highlighting** - 语法高亮

### 命令行查看
```bash
# 安装 mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# 生成 PNG 图片
mmdc -i architecture-diagram.mermaid -o architecture-diagram.png
```

## 架构要点

### 核心设计原则
1. **分层架构** - 清晰的职责分离
2. **事件驱动** - 松耦合的组件通信
3. **可扩展性** - 插件化设计和配置驱动
4. **安全性** - 细粒度权限控制和数据隔离

### 关键技术决策
1. **使用 Bun 运行时** - 高性能和现代化工具链
2. **Hono 框架** - 轻量级 HTTP 服务器
3. **事件总线模式** - 实现组件解耦
4. **Drizzle ORM** - 类型安全的数据库操作

## 维护和更新

### 文档更新
当系统架构发生变化时：
1. 更新 `ARCHITECTURE.md` 中的相关章节
2. 同步修改 Mermaid 图表
3. 更新最后修改日期

### 版本对应
- 本文档对应 OpenCode v1.2.11+
- 架构设计适用于当前主分支版本

## 相关资源

### 项目文档
- `AGENTS.md` - 数据库和测试指南
- `README.md` - 基础项目说明
- `src/` 目录 - 源代码实现

### 外部资源
- [OpenCode GitHub](https://github.com/anomalyco/opencode.git)
- [Bun 文档](https://bun.sh/docs)
- [Hono 文档](https://hono.dev/)
- [Mermaid 语法](https://mermaid.js.org/)

---

*最后更新：2026年2月25日*  
*维护者：架构团队*