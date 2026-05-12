# Thread View 前端设计说明

更新日期：2026-05-12

## 1. 文档定位

本文记录桌面端 `ThreadView` 的当前前端设计。它是维护入口，不替代源码；当 `ThreadView` 的布局、信息层级、trace 呈现、side chat、权限确认或 composer 嵌套行为发生变化时，需要同步更新本文。

主要实现文件：

- `packages/desktop/src/renderer/src/app/thread/ThreadView.tsx`
- `packages/desktop/src/renderer/src/styles/thread.css`
- `packages/desktop/src/renderer/src/app/workbench/WorkbenchPaneSurface.tsx`
- `packages/desktop/src/renderer/src/styles/workbench.css`
- `packages/desktop/src/renderer/src/styles/composer.css`
- `packages/desktop/src/renderer/src/styles/responsive.css`

相关测试：

- `packages/desktop/src/renderer/src/app/thread/ThreadView.test.tsx`
- `packages/desktop/src/renderer/src/App.test.tsx`

## 2. 设计目标

Thread view 不是普通聊天窗口，而是 agent 工作台里的执行记录视图。它需要同时支持三类阅读：

1. 用户快速读取最终回复。
2. 开发者扫描 agent 的 reasoning、tool、workflow、file change 等执行轨迹。
3. 用户在不中断主会话上下文的前提下，对某条 assistant 回复开启 side chat。

因此当前设计优先级是：

- 主回复优先，trace 信息降噪。
- 桌面端高密度，可长时间扫描。
- 关键动作贴近对应消息，例如复制回复、打开 side chat、批准工具调用。
- 多 pane 工作台里保持固定宽度、可读行长和独立滚动。

## 3. 工作台嵌入关系

`ThreadView` 由 `WorkbenchPaneSurface` 渲染在 pane 的主体区域。一个 pane 的主要结构是：

```text
PaneTabBar
SessionCanvasTopMenu
ThreadView
ComposerTaskProgress
Composer
ComposerUtilityBar
```

`workbench-pane-live-region` 使用 CSS grid 管理这些区域，其中 thread 占据 `minmax(0, 1fr)` 主滚动区，composer 固定在底部。`ThreadView` 内部的 `thread-column` 是独立滚动容器。

宽度策略：

- `workbench-pane-live-region` 定义 `--pane-content-max-width: 880px`。
- `thread-shell` 负责左右 gutter。
- `thread-column` 居中，最大宽度等于 pane 内容宽度。
- 多 pane 模式下仍保持 `width: 100%`，避免 split pane 中出现额外横向压缩。

## 4. 内容模型

`ThreadView` 输入的核心数据是 `activeTurns: Turn[]`。每个 turn 分为：

- `user`：用户输入、引用、附件。
- `assistant`：由多个 `AssistantTraceItem` 组成的 agent 输出。

assistant trace 会按 section 渲染：

- `response`：用户最应该阅读的最终回复。
- `reasoning`：模型思考或摘要式推理。
- `tools`：工具调用、输入输出、运行状态。
- `sources`：来源信息。
- `approvals`：审批相关信息。
- `file-change`：补丁、文件、生成图片等变更结果。
- `workflow`：步骤、重试、快照、任务状态、压缩事件等。
- `debug`：开发调试元数据。

section 的归类逻辑在 `traceSectionKeyForItem` 和 `defaultTraceSectionKeyForItem` 中。是否显示某类 trace 由 `assistantTraceVisibility` 控制。

## 5. 视觉层级

### 主回复

`response` section 被设计成最轻的形态：

- 外层 section 透明、无边框。
- response trace item 隐藏 header。
- 非 streaming 状态下使用 `ThreadMarkdown` 渲染 markdown。
- 文本颜色使用主文本色，行高适合长文阅读。

这让最终回复接近文档正文，而不是一张卡片。

### 用户消息

用户 turn 右对齐：

- `.user-turn` 使用 `justify-items: end`。
- `.user-bubble` 最大宽度为 `min(100%, 520px)`。
- 背景使用 `--surface-user-bubble`，区别于 assistant 正文。
- 附件以 chip strip 显示，长文件名省略。

用户消息的设计意图是明确“这是输入”，但不占满整个阅读宽度。

### Reasoning 与 Tools

reasoning 和 tools 默认弱化：

- 完成后的 reasoning/tool item 会折叠。
- 样式整体比 response 更低对比。
- tool 支持 input/output 二级 disclosure。
- streaming 时用轻微 pulse 和 caret 表达运行中。

当前实现末尾有较多 CSS override，会把早期卡片样式改成更轻的透明形态。后续调整时应优先收敛这些 override，避免同一类元素在文件前后出现冲突规则。

### File Change

file-change section 会汇总当前 assistant cycle 中的文件变更。为了避免长 trace 淹没回复，当前策略是：

- 如果有 image item，保留图片和最近的非图片变更。
- 否则优先显示最新 patch。
- patch/file chip 可点击，并通过 `onFileChangeSelect` 打开右侧检查区域。

### Debug

debug 信息由 developer mode 和 trace visibility 控制。默认不应该干扰普通使用者阅读。

## 6. 交互行为

### 自动滚动

`ThreadView` 维护 `isPinnedToBottomRef`：

- 切换 session 时强制滚动到底部。
- 如果用户当前接近底部，新的 turn 或权限请求到来时继续锁底。
- 如果用户向上阅读历史，后续更新不会强行打断阅读位置。

底部锁定阈值为 `THREAD_BOTTOM_LOCK_THRESHOLD_PX = 32`。

### 消息动作

assistant response 后方可显示动作行：

- copy assistant response。
- open/hide side chat。

桌面 hover 设备上，动作行默认隐藏；当 hover、focus-within、已复制、已有 side chat 或 side chat 正在打开时常驻显示。这样能保持正文干净，但会牺牲 side chat 的发现性。

用户消息也支持复制，但只显示 copy icon。

### Inline Side Chat

side chat 是挂在某条 assistant response 下的嵌套讨论：

- 只允许主 session 的非 streaming assistant response 打开。
- side chat 锚点为 `turn.messageID ?? turn.id`。
- 打开后渲染 `InlineSideChatThread`。
- `InlineSideChatThread` 内部再次渲染一个 `ThreadView`，并在下方放置专用 `Composer`。
- side chat composer 隐藏 model selector 和项目 tag command，placeholder 为 `Ask a follow-up about this reply.`。
- side chat session banner 在嵌套视图中关闭，避免重复说明。

视觉上，inline side chat 使用浅色面板、左侧强调线和较小间距，表达“这是挂在这条回复下的分支”，不是主线 continuation。

### 权限请求

权限请求以 thread 内 inline prompt 显示：

- `PermissionRequestInlinePrompt` 只显示当前第一个 pending request。
- 卡片内有风险 chip、summary、rationale、allow/deny 操作。
- details 默认折叠，包含 workdir、command、paths、body 等信息。
- 设计上使用 warning 语义色，强调这是阻塞主 session 的决策点。

### Ask User Question

agent 提问通过 `question` trace item 渲染：

- 单选可以直接点 option button。
- 多选用 checkbox，再提交。
- freeform 使用输入框。
- 已回答问题显示 answered note，避免重复提交。

这类卡片当前在 response section 中透明化处理，只保留问题本身和回答控件。

### 图片预览

图片 trace 支持 thumbnail 和 lightbox：

- thumbnail lazy load。
- lightbox 支持 fit width、fit contain、zoom、拖拽和关闭。
- 打开 lightbox 时 body 添加 `is-image-lightbox-open`，避免背景滚动干扰。

## 7. 响应式规则

主要响应式规则在 `responsive.css`：

- 小于 900px 时，assistant response actions、inline side chat header、session banner 纵向排列。
- 小屏下 inline side chat 去掉左 margin，减少横向挤压。
- 小屏下 pane content gutter 降低到 10px。
- composer、utility bar、菜单 panel 会全宽显示。
- permission request grid 在窄屏变成单列。

桌面端仍是主要目标；响应式规则保证窄窗口可用，但没有把 thread view 设计成移动优先体验。

## 8. 主题与 token

Thread view 使用项目的语义 token：

- `--seg-text-*`
- `--seg-border`
- `--seg-panel`
- `--surface-user-bubble`
- `--surface-trace`
- `--semantic-question-card-surface`
- `--semantic-proposed-plan-card-surface`
- `--semantic-warning-*`

历史样式中仍存在硬编码颜色，例如早期 trace、permission request、user bubble 的部分颜色定义。后续视觉调整应优先迁移到 token，避免 light/dark theme 或 appearance 设置下不一致。

## 9. 当前设计债

1. `thread.css` 是从 legacy styles 拆分出来的，存在“先定义卡片，再在文件末尾清空卡片”的覆盖链。
2. side chat 入口在无 hover 环境和首次发现时不够明显。
3. reasoning/tools/file-change 的视觉差异在最终 override 后偏弱，扫描执行状态时不够直观。
4. inline side chat 是完整嵌套 thread，长会话中会显著增加主线纵向长度。
5. `thread-column` 隐藏滚动条，界面更干净，但长 thread 中位置感较弱。
6. README 中提到的若干前端规格文档当前不存在，本文暂时作为 thread view 设计记录入口。

## 10. 维护约定

改动 thread view 时，按以下顺序检查：

1. 是否改变了 `Turn` 或 `AssistantTraceItem` 的分组、显示、折叠规则。
2. 是否影响 response、trace、file-change、permission、question、side chat 的视觉层级。
3. 是否影响多 pane、窄屏、inline side chat 嵌套场景。
4. 是否需要更新 `ThreadView.test.tsx` 或 `App.test.tsx` 中的行为断言。
5. 是否需要同步更新本文档。

如果只是调整颜色、间距、radius，优先改 token 或局部语义 class，不要继续增加文件末尾的大范围 override。
