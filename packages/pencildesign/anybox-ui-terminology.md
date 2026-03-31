# Anybox UI Interface Terminology

## Overview

本文档用于统一描述 `anybox.pen` 对应界面的专业术语，便于在设计说明、PRD、评审文档、标注图层和前后端沟通中使用一致的表达。

该界面参考 Codex 桌面端布局，整体属于典型的桌面应用多栏工作区结构，可概括为：

- 桌面应用窗口 `Desktop Application Window`
- 主从式多栏布局 `Master-Detail Multi-pane Layout`
- 左侧导航 + 中部主内容区 + 底部输入与状态反馈

## 1. Window Layer

### Desktop Application Window

桌面应用的顶层容器，承载全部界面区域与交互层级。

### Title Bar

窗口标题栏，位于最顶部，用于承载窗口标题、拖拽热区及部分全局信息。

### Window Controls

窗口控制按钮，通常位于右上角，包括：

- Minimize
- Maximize / Restore
- Close

### Application Menu Bar

应用菜单栏，用于承载桌面级菜单命令，典型结构包括：

- File
- Edit
- View
- Window
- Help

## 2. Navigation Layer

### Primary Sidebar

主侧边栏，位于界面左侧，是全局导航和对象切换的主要容器。

### Global Navigation

侧边栏上部的全局导航区域，用于放置高层级入口，例如：

- 新线程
- 技能和应用
- 自动化

### Thread List

线程列表区域，用于展示历史会话、任务对象或工作记录。

### List Item

列表中的基础单元，用于表示单个线程、项目或对象。

### Selected List Item

处于当前选中或激活状态的列表项，通常具有高亮背景、边框或更强的文字层级。

### Project Item

侧边栏中的项目级列表项，用于作为一组会话 `Session` 的父级容器。

### Session List

隶属于某个项目 `Project Item` 的子级会话列表，用于展示该项目下的全部历史会话。

### Expand / Collapse Toggle

项目列表项左侧的展开/折叠切换控件。在默认状态下可表现为文件夹图标，在悬浮状态下切换为三角折叠图标，用于控制子级 `Session List` 的展开与收起。

### Sidebar Footer

侧边栏底部区域，通常用于承载：

- 设置
- 升级
- 账户入口
- 次级操作

## 3. Workspace Layer

### Workspace Header

主内容区顶部的工作区标题栏，用于显示当前上下文和相关操作。

### Context Title

当前任务、会话、目录或文档的标题名称。

### Context Metadata

用于描述当前对象的补充信息，例如：

- 项目名
- 路径名
- 目录名
- 状态信息
- 时间信息

### Header Actions

工作区标题栏右侧的操作集合，用于放置提交、移动、切换、筛选等动作按钮。

### Main Content Area

界面中央的核心展示区域，承载主要信息浏览和任务处理内容。

## 4. Conversation Layer

### Conversation View

会话式内容视图，用于展示用户与系统之间的多轮交互内容。

### Message Stream

消息流区域，按时间顺序纵向排列系统消息与用户消息。

### Message Block

单条结构化消息内容单元，是消息流中的基本阅读单元。

### System Message Block

系统或 AI 输出的消息块。

### User Message Block

用户输入或用户动作对应的消息块。

### Conversation Divider

会话分隔标记，用于分隔消息阶段或显示时间提示，例如：

- 已处理 1m 8s
- 已处理 1m 42s

### Action Bubble

会话流中的胶囊型动作标签或可点击建议项，用于表达推荐操作或快速指令。

## 5. Input Layer

### Composer

消息编辑器，是会话型桌面产品中最常用、最标准的专业术语之一，用于承载用户输入。

### Input Container

Composer 的外层容器，用于组织输入框、底部工具条和发送按钮。

### Placeholder

输入框中的占位提示文案，用于提示用户下一步可以输入的内容。

### Composer Toolbar

Composer 底部的辅助控制区，用于放置：

- 模型选择
- 作用域或环境选择
- 语音按钮
- 发送按钮

### Model Selector

用于切换当前模型版本的控件。

### Environment Selector

用于切换本地、工作区、上下文范围或执行环境的控件。

### Send Button

触发提交输入内容的主操作按钮。

## 6. Status Layer

### Status Bar

位于界面底部，用于反馈环境信息、运行状态和版本控制信息。

### Environment Status

用于表示当前运行环境、访问权限或上下文条件，例如：

- 本地
- 完全访问权限

### Version Control Status

用于表示当前 Git 分支、同步状态或代码状态，例如：

- master
- sync indicator

### Runtime Context Indicator

用于标识当前运行上下文、执行状态或连接状态。

## Recommended Layer Names

如果需要在设计稿图层、组件或 frame 中使用统一命名，建议采用以下结构：

- `Window/TitleBar`
- `Window/MenuBar`
- `Sidebar/GlobalNav`
- `Sidebar/ProjectList`
- `Sidebar/ProjectItem`
- `Sidebar/ExpandToggle`
- `Sidebar/SessionList`
- `Sidebar/ThreadList`
- `Sidebar/Footer`
- `Workspace/Header`
- `Workspace/Content`
- `Conversation/MessageStream`
- `Conversation/Divider`
- `Composer/InputContainer`
- `Composer/Toolbar`
- `StatusBar/Environment`
- `StatusBar/GitState`

## Recommended Description Template

以下描述可直接复用到设计说明文档中：

### Short Description

该界面采用桌面应用多栏工作区结构，由标题栏、应用菜单栏、主侧边栏、工作区标题栏、会话主内容区、消息编辑器和状态栏组成。

### Mid-length Description

整体信息架构属于典型的主从式多栏布局：左侧为全局导航与线程列表，中部为会话主视图，底部为 Composer 输入区，最底部通过状态栏反馈环境与版本控制状态。

### Formal Description

该方案参考桌面端会话式开发工具的界面模式，采用桌面应用窗口作为顶层容器，在窗口层保留原生标题栏、菜单栏与窗口控制按钮；在导航层通过主侧边栏组织全局入口与线程列表；在内容层通过工作区标题栏和主内容区承载当前上下文；在交互层通过 Composer 承担主要输入任务；在状态层通过 Status Bar 提供环境状态、权限状态与版本控制反馈。

## Sidebar Interaction Spec

以下描述可直接用于 PRD、设计标注或交互说明：

### Short Spec

当鼠标悬浮在左侧某个项目栏上时，该项目栏左侧的文件夹图标切换为三角折叠图标；点击该三角图标后，可展开或折叠该项目下的全部 `Session` 列表。

### Formal Spec

在 `Primary Sidebar` 中，项目项 `Project Item` 支持悬浮触发的层级控制交互：

- 默认状态下，项目项左侧显示文件夹图标，用于表达该项是一个可包含多个会话的项目容器。
- 当鼠标悬浮到某个项目项时，原文件夹图标切换为三角折叠图标 `Expand / Collapse Toggle`，用于明确提示该项支持展开与折叠操作。
- 用户点击三角折叠图标后，若当前项目为折叠态，则应展开并展示该项目下全部会话。
- 用户点击三角折叠图标后，若当前项目为展开态，则应折叠并隐藏该项目下全部会话。
- 展开或折叠操作仅影响当前项目，不应影响其他项目项的展开状态。

### Annotation Copy

可在设计稿中直接标注为：

`Hover 项目栏后，左侧文件夹图标切换为三角折叠图标；点击后展开/折叠该项目下所有 Session。`

## Test Instructions

以下测试指令可直接用于前端联调或验收：

1. 打开 Anybox 主界面，确认左侧 `Primary Sidebar` 中至少存在一个包含多个 `Session` 的 `Project Item`。
2. 在未悬浮状态下检查项目项左侧图标，应显示为文件夹图标。
3. 将鼠标悬浮到该项目项上，检查左侧图标是否切换为三角折叠图标。
4. 在悬浮状态下点击三角折叠图标，检查该项目下的 `Session List` 是否完整展开。
5. 再次点击三角折叠图标，检查该项目下的 `Session List` 是否完整折叠。
6. 重复执行展开与折叠操作，确认交互状态切换稳定，无闪烁、错位或部分会话未同步显示的问题。
7. 对其他未操作的项目项进行检查，确认其展开/折叠状态未被当前操作联动修改。

### Acceptance Criteria

- 悬浮前显示文件夹图标，悬浮后显示三角折叠图标。
- 点击三角折叠图标后，当前项目下全部 `Session` 一次性展开或折叠。
- 交互反馈应明确、稳定，图标切换与列表展开状态保持一致。
- 当前项目的展开/折叠行为不影响其他项目项。

## Notes

- 在设计评审中，建议优先使用 `Sidebar`、`Workspace Header`、`Message Stream`、`Composer`、`Status Bar` 这组术语。
- 在开发对接中，建议统一使用中英混合命名，便于图层、组件和代码结构对应。
- 在设计稿标注时，应避免使用“左边那块”“中间内容”“底下输入框”这类非正式表达。
