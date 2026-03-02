## 前言

最近团队在尝试用 Speckit（GitHub Spec Kit）来做规范驱动开发，这里把它的核心理念和具体用法整理一下，方便大家快速上手。

Speckit 的核心思想很简单：**在写代码之前，先把需求说清楚**。通过一套结构化的文档和命令，让 AI 更好地理解我们要做什么，从而生成更准确的代码。

---

## 一、Speckit 是什么

Speckit 是 GitHub 推出的一个开源工具包，全名是 GitHub Spec Kit。它提供了一套模板和工作流，帮助开发者把"需求-设计-任务-实现"这个过程规范化。

简单来说，它解决了几个问题：

1. **需求散落各处** - 以前需求可能在 Jira、口头沟通、或者代码注释里，现在统一在 spec.md
2. **AI 理解偏差** - 给 AI 一句"做个用户登录"，它可能猜错你的意思，但给它一份结构化的规格文档，结果就准确多了
3. **团队协作成本** - 新人接手项目时，有一份完整的需求和设计文档，上手会快很多

---

## 二、核心工作流

### 2.1 项目初始化

在做任何功能开发之前，首先要建立项目章程：

```bash
项目初始化
    ↓
/speckit.constitution - 建立团队开发原则
```

**章程的作用**：

- 定义核心开发原则（如"真实场景优先"、"测试友好"等）
- 设置质量门禁标准
- 后续的 plan、analyze 等阶段都会检查是否符合章程

### 2.2 功能开发流程

有了章程之后，每个功能的开发流程如下：

```dos
需求输入 → spec.md → plan.md → tasks.md → 代码实现
   ↓         ↓        ↓        ↓
 specify  clarify   plan   tasks  implement
                              ↓
                          checklist
                              ↓
                           analyze
```

**执行顺序**：

1. `specify` - 写规格文档
2. `clarify` - 澄清模糊需求（可选，但推荐）
3. `plan` - 做技术设计
4. `tasks` - 分解任务清单
5. `checklist` - 生成检查清单（可选）
6. `analyze` - 一致性分析（推荐）
7. `implement` - 执行实现

接下来详细说每个命令是干什么的。

---

## 三、命令详解

### 3.0 /speckit.constitution - 项目章程（最先执行）

**用途**：定义团队的开发原则和质量门禁

**什么时候用**：

- 项目初始化时（最先做）
- 需要调整开发原则时

**怎么用**：

```bash
/speckit.constitution
```

**它会做什么**：  
创建或更新 `.specify/memory/constitution.md`，内容包括：

- 核心开发原则（带优先级）
- 质量门禁标准
- 代码规范要求
- 测试要求

**为什么最先执行**：

- `plan` 命令会做 Constitution Check，验证设计是否符合章程
- `analyze` 命令会检查是否有违反章程的原则
- 它是所有后续工作的"质量基准线"

**示例**：

```markdown
# 装载机调度系统项目章程

## Core Principles

### I. 真实场景优先 (NON-NEGOTIABLE)
所有 BI 统计测试必须基于真实场景模拟

### II. 数据准确性验证
必须通过独立计算的基线指标验证系统输出

### III. 开发测试友好
测试工具必须提供一键运行脚本
```

---

### 3.1 /speckit.specify - 创建规格文档

**用途**：从自然语言描述生成结构化的需求规格文档

**什么时候用**：

- 产品经理/开发提出一个新功能需求时
- 需要正式记录某个功能的需求时

**怎么用**：

```bash
/speckit.specify 我们需要做一个用户登录功能，支持邮箱和手机号登录
```

**它会做什么**：

1. 根据描述创建一个功能分支（格式：`001-user-login`）
2. 在 `specs/001-user-login/` 目录下创建 `spec.md`
3. 生成规格文档，包含：
    - 用户场景（User Scenarios）
    - 功能需求（Functional Requirements）
    - 验收标准（Success Criteria）
    - 边界情况（Edge Cases）

**文档长什么样**：

```markdown
# Feature Specification: 用户登录功能

## User Scenarios & Testing

### User Story 1 - 邮箱登录 (Priority: P1)

用户可以使用邮箱和密码登录系统

**Why this priority**: 登录是使用系统的基础功能

**Acceptance Scenarios**:
1. Given 用户在登录页面，When 输入正确邮箱和密码，Then 登录成功跳转到首页
2. Given 用户输入错误密码，When 提交表单，Then 显示"密码错误"提示

## Requirements

### Functional Requirements
- FR-001: 系统必须支持邮箱格式验证
- FR-002: 系统必须支持密码强度检查
- FR-003: 登录失败次数超过5次需锁定账户

## Success Criteria

- SC-001: 用户可以在30秒内完成登录流程
- SC-002: 系统支持1000并发登录请求
```

**注意事项**：

- spec.md 只写"要什么"，不写"怎么实现"
- 不写技术细节（用什么语言、什么框架、什么数据库）
- 写给产品/业务看，不是写给开发看

---

### 3.2 /speckit.clarify - 澄清模糊需求

**用途**：检查规格文档里有没有模糊的地方，然后提问澄清

**什么时候用**：

- 写完 spec.md 后，在进入设计阶段之前
- 觉得需求描述不够清楚时

**怎么用**：

```bash
/speckit.clarify
```

**它会做什么**：

1. 读取当前的 spec.md
2. 按照以下分类检查模糊点：
    - 功能范围和行为
    - 领域和数据模型
    - 交互流程
    - 非功能属性（性能、安全等）
    - 集成和外部依赖
    - 边界情况和异常处理
3. 针对发现的问题提问（最多5个）

**提问示例**：

```gherkin
问题 1：密码重置方式

当前 spec 没有说明密码重置的具体方式

推荐选项：邮箱验证码链接

| 选项 | 说明 |
|------|------|
| A | 发送邮箱验证码链接 |
| B | 发送临时密码到邮箱 |
| C | 手机验证码重置 |

你的选择（可以直接说字母）：
```

**澄清结果会记录在哪里**：

- spec.md 会新增一个 `## Clarifications` 章节
- 每个问题和答案都会记录下来
- 答案会自动更新到相关的需求章节

---

### 3.3 /speckit.plan - 创建技术设计

**用途**：基于规格文档，生成技术实现方案

**什么时候用**：

- spec.md 完成并澄清后
- 开始写代码之前，需要确定技术方案

**怎么用**：

```bash
/speckit.plan
```

**它会做什么**：

1. 读取 spec.md
2. 检查项目章程（Constitution）里的约束
3. 生成 plan.md，包含：
    - 技术栈选择
    - 项目结构设计
    - 数据模型
    - API 契约
    - 相关研究文档

**文档长什么样**：

```markdown
# Implementation Plan: 用户登录功能

## Technical Context

Language/Version: Python 3.11
Primary Dependencies: FastAPI, SQLAlchemy
Storage: PostgreSQL
Testing: pytest
Target Platform: Linux server
Performance Goals: 1000 登录请求/秒

## Constitution Check

- 真实场景优先: 通过
- 数据准确性验证: N/A
- 开发测试友好: 通过

## Project Structure

backend/src/
├── models/
│   └── user.py          # 用户数据模型
├── services/
│   └── auth_service.py   # 认证服务
└── api/
    └── auth.py           # 登录接口

tests/
├── contract/
│   └── test_auth.py      # 契约测试
└── integration/
    └── test_login.py     # 集成测试
```

---

### 3.4 /speckit.tasks - 分解任务清单

**用途**：把技术设计转化为可执行的任务列表

**什么时候用**：

- plan.md 完成后
- 需要开始具体开发工作前

**怎么用**：

```bash
/speckit.tasks
```

**它会做什么**：

1. 读取 spec.md 和 plan.md
2. 如果存在 data-model.md 和 contracts/，也会读取
3. 按"用户故事"组织任务
4. 生成 tasks.md

**任务怎么组织的**：

```markdown
## Phase 1: Setup

- [ ] T001 创建项目目录结构
- [ ] T002 安装 FastAPI 和相关依赖

## Phase 2: Foundational

关键：这些任务完成后才能开始用户故事的开发

- [ ] T004 配置数据库连接
- [ ] T005 创建用户表和迁移脚本

## Phase 3: User Story 1 - 邮箱登录 (P1)

目标：用户可以通过邮箱密码登录

独立测试：可以用测试账号完成登录流程

### Implementation for User Story 1

- [ ] T010 [P] [US1] 创建 User 模型在 src/models/user.py
- [ ] T011 [P] [US1] 创建密码加密工具在 src/utils/crypto.py
- [ ] T012 [US1] 实现 login 服务在 src/services/auth_service.py
- [ ] T013 [US1] 创建 /login 接口在 src/api/auth.py
```

**任务标记说明**：

- `[P]` = 可以并行执行（操作不同文件，无依赖）
- `[US1]` = 属于用户故事1
- `depends on` = 依赖前面的任务

---

### 3.5 /speckit.checklist - 生成检查清单

**用途**：生成需求质量检查清单

**什么时候用**：

- 需要检查规格文档是否完整、清晰时
- 准备进行代码审查前

**怎么用**：

```bash
/speckit.checklist 生成安全相关的检查清单
```

**它会做什么**：

1. 先问几个问题确定检查范围
2. 读取 spec.md、plan.md、tasks.md
3. 生成检查清单文件

**重要概念**：检查清单是"需求的单元测试"，不是"功能的测试用例"

正确 vs 错误示例：

|错误（测试实现）|正确（测试需求）|
|---|---|
|验证登录按钮点击正确|登录按钮的点击行为是否在需求中明确说明？|
|测试密码错误提示|密码错误的提示文案是否在需求中定义？|
|确认密码加密使用bcrypt|密码加密要求是否在需求中指定具体算法？|

**生成的检查清单示例**：

```markdown
- [ ] CHK001 所有错误场景的响应格式是否已定义？[完整性]
- [ ] CHK002 "快速响应"是否量化为具体时间？[清晰度]
- [ ] CHK003 认证要求在所有接口间是否一致？[一致性]
- [ ] CHK004 是否定义了密码重置的场景？[覆盖范围]
```

---

### 3.6 /speckit.analyze - 一致性分析

**用途**：检查 spec.md、plan.md、tasks.md 之间的一致性

**什么时候用**：

- tasks.md 生成完成后
- 开始实现之前，确保文档之间没有矛盾

**怎么用**：

```bash
/speckit.analyze
```

**它会做什么**：

1. 读取三个核心文档
2. 检查是否有：
    - 重复的需求
    - 模糊的描述
    - 遗漏的覆盖
    - 与章程的冲突
    - 任务与需求不对应
3. 生成分析报告

**报告示例**：

```gherkin
## 规格分析报告

| ID | 类别 | 严重性 | 位置 | 问题描述 | 建议 |
|----|------|--------|------|----------|------|
| A1 | 重复 | 高 | spec.md:L120-134 | 两个相似的需求 | 合并措辞 |
| C1 | 覆盖 | 高 | spec.md:FR-005 | 没有对应任务 | 添加任务 |

### 覆盖情况

| 需求 | 有任务？ | 任务ID | 备注 |
|------|----------|--------|------|
| user-can-login | 是 | T010-T013 | |
| password-reset | 否 | | 需补充 |

### 指标

- 总需求数: 8
- 总任务数: 15
- 覆盖率: 87.5%
- 严重问题: 1个
```

---

### 3.7 /speckit.implement - 执行实现

**用途**：按照 tasks.md 的任务清单执行开发

**什么时候用**：

- tasks.md 生成并分析通过后
- 准备开始写代码时

**怎么用**：

```bash
/speckit.implement
```

**它会做什么**：

1. 先检查所有 checklist 是否都完成
2. 读取 tasks.md、plan.md 及相关设计文档
3. 按阶段执行任务
4. 每完成一个任务，在 tasks.md 里打勾

**执行顺序**：

1. 检查 checklist 状态
    - 如果有未完成的，会问你是否继续
2. Phase 1: 项目初始化
3. Phase 2: 基础设施（必须先完成）
4. Phase 3+: 按用户故事顺序实现
5. 最后: 打磨和完善

---

## 四、完整工作流示例

以"装载机 BI 统计功能"为例：

### 第零步：建立章程（项目初始化，只需做一次）

```bash
/speckit.constitution
```

建立团队开发原则，比如：

- BI 统计必须基于真实场景
- 测试工具要提供一键运行脚本
- 数据准确性需要基线验证

---

### 第一步：创建规格

```bash
/speckit.specify 我们需要统计装载机的在线时长和任务执行情况，按小时聚合数据
```

生成 `specs/001-bi-statistics-test/spec.md`

### 第二步：澄清需求

```bash
/speckit.clarify
```

AI 会问类似问题：

- "系统重启后如何恢复未完成的统计任务？"
- "统计数据保留多久？"
- "需要支持历史数据补录吗？"

回答后，spec.md 会更新

### 第三步：技术设计

```bash
/speckit.plan
```

生成 `specs/001-bi-statistics-test/plan.md`，确定：

- 使用 Python 3.11 + FastAPI
- PostgreSQL 存储统计数据
- Redis 做实时缓存
- 目标：24小时数据处理在5分钟内完成

### 第四步：任务分解

```bash
/speckit.tasks
```

生成 `specs/001-bi-statistics-test/tasks.md`，包含：

- Phase 1: 项目初始化
- Phase 2: 数据模型设计
- Phase 3: 在线时长统计 (P1)
- Phase 4: 任务执行统计 (P2)
- Phase 5: 数据查询接口 (P3)

### 第五步：生成检查清单

```bash
/speckit.checklist 生成测试和性能相关的检查项
```

生成 `specs/001-bi-statistics-test/checklists/test.md`

### 第六步：一致性分析

```bash
/speckit.analyze
```

检查三个文档之间有没有矛盾或遗漏

### 第七步：执行实现

```bash
/speckit.implement
```

按任务清单开始写代码

---

## 五、实战建议

### 1. 关于优先级

spec.md 里的用户故事要标优先级（P1、P2、P3）：

- P1 是 MVP 的核心功能
- 每个 P1 故事完成后都应该能独立交付价值
- 不要让 P2/P3 的功能阻塞 P1

### 2. 关于任务并行

tasks.md 里标 `[P]` 的任务可以并行：

- 通常是操作不同文件的代码任务
- AI 可以同时发起多个这样的任务
- 能显著加快开发速度

### 3. 关于独立测试

每个用户故事都应该能独立测试：

- 完成 P1 后，部署验证
- 通过后再做 P2
- 这样有问题能及时发现

### 4. 关于章程

constitution.md 是团队的约定：

- 质量门禁在 plan 阶段会检查
- 违反章程的设计需要说明理由
- 定期review，确保持续合规

### 5. 需求变更怎么处理

**Q：执行到第四步（tasks）时发现需求不完整或要变更，怎么办？**

**A：可以随时回退修改**。Speckit 的文档是有依赖关系的：

```crmsh
spec.md（需求）
    ↓
plan.md（设计，依赖 spec）
    ↓
tasks.md（任务，依赖 spec + plan）
```

**变更处理流程**：

1. **如果需求有变更**：直接修改 `spec.md`，然后重新执行后续步骤
    
    ```dos
    修改 spec.md
        ↓
    /speckit.plan （重新生成 plan.md）
        ↓
    /speckit.tasks （重新生成 tasks.md）
    ```
    
2. **如果发现需求没写全**：可以补 `spec.md`，也可以用 `clarify` 继续
    
    ```stylus
    /speckit.clarify 继续补充澄清
        ↓
    如果改动大：重新 /speckit.plan → /speckit.tasks
    如果改动小：手动修改 plan.md / tasks.md
    ```
    
3. **如果只是设计调整**：直接改 `plan.md`，然后重新生成任务
    
    ```dos
    手动修改 plan.md
        ↓
    /speckit.tasks （重新生成 tasks.md）
    ```
    

**注意事项**：

- 重新生成命令会覆盖原有文件，如果手动改过要注意备份
- 小改动可以直接编辑文档，不用重新跑命令
- `analyze` 可以用来检查修改后文档是否一致

**典型场景**：

|场景|处理方式|
|---|---|
|发现漏了个用户故事|补充 spec.md，重新 plan + tasks|
|验收标准要调整|修改 spec.md，重新 plan + tasks|
|技术方案要换（比如换数据库）|修改 plan.md，重新 tasks|
|只是任务描述不清楚|直接改 tasks.md 即可|

---

## 六、常见问题

**Q：constitution 什么时候建立？**

A：项目初始化时最先做，只需要做一次。后续如果团队原则有变化，再更新。

**Q：spec.md 和 plan.md 为什么要分开？**

A：spec.md 是写给产品看的"要什么"，plan.md 是写给开发看的"怎么做"。分开的好处是技术讨论不会影响产品理解，产品变更也不会影响技术实现细节。

**Q：一定要按顺序执行所有命令吗？**

A：推荐顺序是 specify → clarify → plan → tasks → analyze → implement。但如果是简单的 bug 修复或紧急修复，可以跳过某些步骤。

**Q：checklist 是给谁用的？**

A：主要是给写 spec 的人自查的。写完 spec 后运行 checklist，看看有没有遗漏或模糊的地方。

**Q：analyze 发现问题怎么办？**

A：如果报告里有严重问题，建议先修复再 implement。如果是低优先级问题，可以选择先实现，后续迭代修复。

---

## 七、参考资源

- GitHub 官方仓库: https://github.com/github/spec-kit
- GitHub 官方博客: https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- 微软深度解析: https://developer.microsoft.com/blog/spec-driven-development-spec-kit
- PDF 指南: https://intuitionlabs.ai/pdfs/github-spec-kit-a-guide-to-spec-driven-ai-development.pdf