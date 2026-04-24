# Dropdown Select 设计与实现规范

最后更新: 2026-04-24  
适用范围: `packages/desktop` 的 Electron Renderer / React UI  
相关实现入口:

- `src/renderer/src/styles/tokens.css`
- `src/renderer/src/styles/base.css`
- `src/renderer/src/styles/composer.css`
- `src/renderer/src/app/composer/Composer.tsx`
- `src/renderer/src/app/GitBranchSwitcher.tsx`

## 1. 目标

本规范定义项目内所有 dropdown select 类控件的设计、交互、可访问性和实现要求。这里的 dropdown select 泛指用户点击一个触发器后展开浮层，并从一组选项中完成选择的控件，包括但不限于模型选择、推理强度选择、Git 分支切换、文件/技能/MCP 搜索补全、设置项选择和未来的多选标签选择。

本项目当前没有引入 Radix UI、shadcn/ui、react-select 等组件库，因此默认以原生 React + TypeScript + CSS token 实现。只有在需求明确超过自建组件维护成本时，才考虑引入外部无样式可访问性组件库。

## 2. 术语

- Trigger: 触发器，通常是一个 `button`，显示当前选中值、占位文本、状态图标和下拉箭头。
- Menu / Panel / Popover: 展开的浮层容器。
- Option: 单个可选择项。
- Selected value: 当前选择值。
- Active option: 键盘导航当前聚焦的候选项，不一定已经选中。
- Empty state: 没有可用选项或没有匹配结果时的提示。
- Loading state: 异步加载选项时的状态。
- Combobox: 触发器或浮层内带搜索输入的选择器。
- Multi-select: 允许选择多个值的下拉选择器，通常配合 tag/chip 展示。

## 3. 总原则

1. 选择器是任务型 UI，不做装饰性设计。默认保持紧凑、清晰、可扫描。
2. 优先使用现有 token: `--seg-*`、`--ui-*`、`--surface-*`、`--text-*`、`--border-*`、`--brand-*`、`--focus-outline-*`。
3. 不新增单独主题色。状态色使用 `--semantic-*` 或其派生 token。
4. 默认圆角使用 `--seg-radius-xs` 或 `--radius-control`。浮层最多使用 `--seg-radius-sm` 或 `--radius-panel`，不要使用大圆角卡片化视觉。
5. 所有选择器必须有键盘路径，不能只支持鼠标。
6. 所有浮层必须处理关闭、焦点恢复、视口边界和滚动容器裁切。
7. 所有异步选项必须防止竞态更新。
8. 触发器文案必须表达当前状态，不依赖颜色作为唯一信息。

## 4. 组件类型总表

| 类型 | 适用场景 | 推荐实现 | 当前/潜在使用 |
| --- | --- | --- | --- |
| Native Select | 简单表单，少量静态选项，无复杂说明 | 原生 `<select>` | 设置页简单枚举项 |
| Single Select Menu | 单选，选项可包含说明/徽标/状态 | `button` + `role="dialog"` 或 `listbox` 浮层 | Composer 模型选择、推理强度 |
| Searchable Combobox | 选项多、需要筛选或远程搜索 | 输入框 + `listbox` + active descendant | 文件搜索、模型搜索 |
| Multi-select Menu | 多选，选中值以 tag/chip 展示 | `button`/input + `listbox` + checkbox/check mark | Skills、MCP、标签筛选 |
| Command Select | 基于 `/`、`@` 或快捷入口的命令候选 | anchored menu + `listbox` | Composer 命令补全 |
| Async Select | 选项来自 IPC/后端/文件系统 | controlled data + loading/error/empty | Git 分支、workspace 文件 |
| Tree Select | 选项有层级 | tree/listbox hybrid | workspace 文件夹、技能树 |
| Cascading Select | 上级选择影响下级选项 | 多个 select 或一体式分组菜单 | provider -> model |

## 5. 何时使用哪一种

### 5.1 使用原生 `<select>`

满足以下条件时使用原生 select:

1. 选项少于 8 个。
2. 选项只有纯文本 label，没有说明、徽标、图标、异步状态。
3. 不需要搜索、多选、分组、快捷键增强。
4. 出现在设置表单、属性面板等常规表单位置。

实现要求:

- 必须有可见 `label` 或 `aria-label`。
- 必须可通过 `disabled` 表达不可用。
- 必须与 `base.css` 的 form primitive 保持一致，再通过特性样式补充边框、背景、高度。
- 不允许使用浏览器默认蓝色 focus ring，必须覆盖为项目 focus token。

### 5.2 使用自建 Single Select Menu

满足以下任一条件时使用自建菜单:

1. 选项需要说明文字、状态、分组、徽标或二级信息。
2. 触发器需要紧凑 chip 形态。
3. 选择行为需要同时触发业务动作。
4. 浮层需要在 Composer 或工具栏中向上展开。

当前参考:

- `Composer.tsx` 中模型/推理强度选择。
- `GitBranchSwitcher.tsx` 中分支选择。

### 5.3 使用 Searchable Combobox

满足以下任一条件时使用 combobox:

1. 选项超过 20 个。
2. 用户知道要找什么，搜索比浏览更快。
3. 选项来自文件系统、后端或动态 provider。
4. 选项 label 不够唯一，需要显示路径或说明。

当前参考:

- `Composer.tsx` 中 `/file` 和 `@` 触发的文件候选。

### 5.4 使用 Multi-select

满足以下任一条件时使用 multi-select:

1. 用户可以并行选择多个 skill、MCP server、tag、filter。
2. 选择结果需要在触发器或输入区中长期可见。
3. 需要支持取消单项选择。

设计要求:

- 选中项使用 check mark 或 checkbox 语义，不只靠背景色。
- 触发器显示摘要: `3 selected`、`Skills: Review, UI +2` 或项目内等价文案。
- 已选项过多时触发器内最多显示 1-2 个名称，其余折叠为 `+N`。

## 6. 信息架构

所有 dropdown select 至少由以下层组成:

1. Field container: 控件所在表单或工具栏区域。
2. Label: 可见标签或 `aria-label`。
3. Trigger: 点击/键盘打开浮层。
4. Value: 当前选中值、占位文案或摘要。
5. Indicator: `ChevronDownIcon` 或等价箭头。
6. Panel: 选项浮层。
7. Option list: 一组 option。
8. Feedback: loading、empty、error、helper text。

复杂选项允许包含:

- Leading icon: 类型或 provider 图标。
- Primary label: 主标题。
- Secondary text: 说明、路径、来源、状态。
- Trailing meta: 当前项、快捷键、远程/本地 badge、check mark。

## 7. 尺寸规范

### 7.1 Trigger 高度

| 场景 | 高度 | 用途 |
| --- | --- | --- |
| Icon-only compact | 30-34px | toolbar、Composer 附件按钮 |
| Compact select | 34px | Composer model、utility chip |
| Default select | 38px | 常规表单 select |
| Form-large select | 42px | 设置弹窗、创建对话框 |

当前优先值:

- Composer selector: `min-height: 34px`
- Primary/secondary button: `min-height: 38px`
- Dialog input/select: `min-height: 42px`

### 7.2 Trigger 内边距

- icon-only: `padding: 0`，宽高相等。
- compact: `padding: 0 10px 0 12px` 或 `0 12px`。
- default: `padding: 0 12px`。
- 带说明的宽触发器: `padding: 8px 12px`，允许两行布局。

### 7.3 Option 高度

| 选项类型 | 最小高度 |
| --- | --- |
| 单行文本 | 34px |
| 文本 + 说明 | 44-48px |
| 文件路径/长说明 | 40-48px |
| 分支/状态项 | 46px |

### 7.4 宽度

- 浮层默认 `min-width` 不小于 trigger 宽度。
- 紧凑菜单最小宽度: `220px`。
- 常规菜单最大宽度: `min(320px, calc(100vw - 64px))`。
- 靠近窗口边缘的菜单最大宽度: `calc(100vw - 32px)`。
- 文件路径类选项可以到 `420px`，但必须做省略。

### 7.5 高度和滚动

- 常规菜单最大高度: `min(320px, calc(100dvh - 180px))`。
- 命令菜单最大高度: `min(360px, calc(100dvh - 220px))`。
- 列表内部滚动时必须设置 `scrollbar-gutter: stable`。
- footer 操作区可以 `position: sticky; bottom: 0`。

## 8. 视觉规范

### 8.1 Trigger 默认态

推荐样式:

```css
.select-trigger {
  min-height: 34px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--seg-border);
  border-radius: var(--seg-radius-xs);
  background: var(--seg-panel);
  color: var(--seg-text-2);
}
```

### 8.2 Hover / Focus

- Hover 后背景可以混入 `--seg-accent-soft`，不要大面积高饱和。
- Focus 必须使用 `outline` 或 `box-shadow`，颜色来自 `--focus-outline-color` 或 `color-mix(in srgb, var(--seg-accent) 12%, transparent)`。
- `:focus-visible` 与 hover 可以共享边框色，但 focus 必须有额外视觉层。

推荐:

```css
.select-trigger:hover,
.select-trigger:focus-visible,
.select-trigger.is-open {
  background: color-mix(in srgb, var(--seg-panel) 76%, var(--seg-accent-soft) 24%);
  border-color: color-mix(in srgb, var(--seg-accent) 28%, var(--seg-border));
  color: var(--seg-accent-strong);
}

.select-trigger:focus-visible {
  outline: var(--focus-outline-width) solid var(--focus-outline-color);
  outline-offset: var(--focus-outline-offset);
}
```

### 8.3 Disabled

- `opacity: 0.45-0.58`。
- `cursor: default` 或 `not-allowed`，依据是否表示永久不可用。
- 禁用项仍可显示原因，使用 `title` 或说明文案。
- 禁用项不可响应 click、Enter、Space。

### 8.4 Selected

- 单选选中项使用 `is-selected`。
- 选中态可以使用浅色背景 + accent 文本。
- 需要在 trailing 区显示 `Current`、check mark 或等价语义。
- 不允许只靠颜色表达选中。

### 8.5 Panel

推荐样式:

```css
.select-panel {
  position: absolute;
  z-index: 8;
  min-width: 220px;
  max-width: min(320px, calc(100vw - 64px));
  max-height: min(320px, calc(100dvh - 180px));
  overflow: auto;
  scrollbar-gutter: stable;
  padding: 8px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--seg-border);
  border-radius: var(--seg-radius-sm);
  background: var(--surface-elevated);
  box-shadow: var(--shadow-md);
}
```

### 8.6 Motion

- 打开动画最多 `var(--motion-base)`。
- 只允许 opacity / transform，不触发布局跳动。
- 遵守 `prefers-reduced-motion`。已有全局 motion 约束时复用。
- 不为选项 hover 添加位移，避免列表扫描时抖动。

## 9. 布局和定位

### 9.1 默认展开方向

- 工具栏、顶部区域: 默认向下展开。
- Composer 底部区域: 默认向上展开，使用 `bottom: calc(100% + 8px)`。
- 靠近窗口底部的菜单必须避免超出视口。

### 9.2 容器策略

优先级:

1. 简单菜单可以渲染在 trigger 相邻 DOM，使用 `position: absolute`。
2. 如果父容器有 `overflow: hidden` 导致裁切，必须使用 portal 到 app shell/root。
3. 如果使用 portal，必须用 `getBoundingClientRect()` 计算位置，并监听 resize/scroll。

### 9.3 视口边界

所有浮层都必须满足:

- 左右不超出 `100vw`。
- 上下不超出 `100dvh`。
- 最大高度可滚动。
- 宽度不足时文本省略，不撑破窗口。

## 10. 文案规范

### 10.1 Trigger 文案

- 已选择: 显示具体值，如 `gpt-5.2`、`main`。
- 未选择但有默认: 显示 `Use server default`、`Model default`。
- 未加载: 显示 `Loading...` 或禁用 trigger。
- 不可用: 触发器禁用，并提供 `title` 说明。

### 10.2 Option 文案

- 主文案用名词，不写操作句。
- 操作结果在 trailing 区表达，如 `Switch`、`Current`。
- 说明文字解释差异，不重复主文案。
- 空状态必须告诉用户下一步或原因。

示例:

- `No visible models are available for this project yet.`
- `No branches are available.`
- `Type a file name to search this project.`

### 10.3 错误文案

- 错误信息放在菜单底部或 field 下方，使用 `role="alert"`。
- 文案描述结果，不暴露无意义堆栈。
- 可恢复错误需要保留菜单打开，让用户能重试或换选项。

## 11. 可访问性规范

### 11.1 Trigger 必备属性

自建选择器 trigger 必须包含:

```tsx
<button
  type="button"
  aria-haspopup="listbox"
  aria-expanded={isOpen}
  aria-controls={panelID}
  aria-label="Select model"
>
  ...
</button>
```

如果浮层包含复杂操作、footer 按钮或输入框，可使用 `aria-haspopup="dialog"`，Panel 使用 `role="dialog"`。

### 11.2 Panel role

推荐映射:

| 类型 | Trigger | Panel | Option |
| --- | --- | --- | --- |
| 简单单选 | `aria-haspopup="listbox"` | `role="listbox"` | `role="option"` |
| 多选 | `aria-haspopup="listbox"` | `role="listbox" aria-multiselectable="true"` | `role="option"` |
| 带搜索输入 | `role="combobox"` 或 button + dialog | `role="listbox"` | `role="option"` |
| 复杂菜单 | `aria-haspopup="dialog"` | `role="dialog"` | button |
| 命令补全 | 编辑器内 anchored menu | `role="listbox"` | `role="option"` |

### 11.3 键盘行为

所有自建选择器必须支持:

- `Enter` / `Space`: 打开菜单；菜单打开时选择 active option。
- `ArrowDown`: 打开菜单或移动到下一项。
- `ArrowUp`: 打开菜单或移动到上一项。
- `Home`: 移动到第一项。
- `End`: 移动到最后一项。
- `Escape`: 关闭菜单并恢复焦点到 trigger。
- `Tab`: 关闭菜单，允许焦点自然移动。

Combobox 额外支持:

- 输入字符更新筛选。
- `aria-activedescendant` 指向 active option。
- 不在 IME composition 过程中错误提交。

### 11.4 焦点管理

- 打开后，简单 listbox 可以保持焦点在 trigger，通过 active descendant 管理候选。
- 带搜索输入的菜单打开后应聚焦输入框。
- 关闭后恢复焦点到 trigger，除非用户通过 Tab 离开。
- 点击菜单外、按 Escape、选择完成都必须关闭菜单。
- 浮层内 mousedown 选择时可 `preventDefault()`，避免编辑器焦点提前丢失。当前 Composer 命令菜单已采用类似策略。

## 12. 状态机

推荐基础状态:

```ts
type SelectOpenState = "closed" | "open"
type SelectDataState = "idle" | "loading" | "ready" | "empty" | "error"
```

选择器至少维护:

- `isOpen`
- `value`
- `options`
- `activeIndex`
- `query`，如果可搜索
- `isLoading`
- `errorMessage`

关闭菜单时必须清理:

- 临时错误，除非错误属于 field。
- active option。
- 未提交 query，依据产品语义决定是否保留。

## 13. 数据模型

推荐统一 option shape:

```ts
export interface DropdownSelectOption<Value extends string = string> {
  value: Value
  label: string
  description?: string
  disabled?: boolean
  disabledReason?: string
  group?: string
  icon?: React.ReactNode
  meta?: string
}
```

多选使用:

```ts
export interface DropdownMultiSelectProps<Value extends string = string> {
  value: Value[]
  options: DropdownSelectOption<Value>[]
  onChange: (nextValue: Value[]) => void
}
```

单选使用:

```ts
export interface DropdownSingleSelectProps<Value extends string = string> {
  value: Value | null
  options: DropdownSelectOption<Value>[]
  onChange: (nextValue: Value | null) => void
}
```

实现约束:

- `value` 必须稳定，不使用 label 作为 key。
- `key` 使用 `${group}:${value}` 或业务唯一 ID。
- `label` 可以变化，但不能影响持久化。
- 远程数据要先 normalize 成 option，再传给表现组件。

## 14. 异步加载规范

异步选择器必须满足:

1. 使用递增 request id 或 `AbortController` 防止旧响应覆盖新响应。
2. loading 期间保留旧值，不清空 trigger。
3. loading 期间可以禁用 option 操作，但不要让 trigger 文案闪烁。
4. 错误状态显示在 panel 内或 field 下方。
5. 成功选择后按需刷新数据，但必须处理刷新失败。

当前 `GitBranchSwitcher.tsx` 的 `capabilitiesRequestRef` / `branchesRequestRef` 是项目内推荐模式。

## 15. 分组规范

当选项存在明显类别时使用分组:

- Provider / Model。
- Local branch / Remote branch。
- Commands / Files / Skills / MCP。

分组标题:

- 使用 11-12px。
- uppercase 只用于英文短标签。
- 颜色使用 `--seg-text-3` 或等价 token。
- 分组标题不可获得焦点。

分组之间使用 `composer-menu-divider` 风格的细分隔线，避免卡片嵌套。

## 16. 长文本和溢出

所有 trigger 和 option 必须处理长文本:

- `min-width: 0`
- `overflow: hidden`
- `text-overflow: ellipsis`
- `white-space: nowrap`

文件路径类 option:

- 主文件名左对齐。
- 路径作为 secondary meta。
- 可以使用 `direction: rtl; text-align: left;` 保留路径尾部。
- full path 放在 `title`。

## 17. 图标规范

- 下拉箭头使用项目已有 `ChevronDownIcon`。
- icon-only trigger 必须有 `aria-label` 和 `title`。
- 表示选中优先使用 check mark；当前项目没有统一 CheckIcon 时，可以先使用文本 `Current`，后续补统一图标。
- 不为每个 option 强行加图标。只有类型区分有帮助时使用。

## 18. 主题和暗色模式

所有新增 dropdown select 样式必须使用 token，不直接写死浅色:

推荐:

- 背景: `var(--surface-elevated)`、`var(--seg-panel)`、`var(--seg-panel-muted)`
- 文本: `var(--seg-text-1)`、`var(--seg-text-2)`、`var(--seg-text-3)`
- 边框: `var(--seg-border)`、`var(--seg-border-strong)`
- 强调: `var(--seg-accent)`、`var(--seg-accent-strong)`、`var(--seg-accent-soft)`
- 阴影: `var(--shadow-md)` 或 `var(--ui-shadow-md)`

允许短期沿用 `composer.css` 里的历史硬编码颜色，但新增组件必须优先 token 化。

## 19. CSS 命名规范

通用新组件建议使用以下 BEM-lite 命名:

- `.dropdown-select`
- `.dropdown-select-trigger`
- `.dropdown-select-value`
- `.dropdown-select-icon`
- `.dropdown-select-panel`
- `.dropdown-select-list`
- `.dropdown-select-option`
- `.dropdown-select-option-copy`
- `.dropdown-select-option-meta`
- `.dropdown-select-empty`
- `.dropdown-select-error`

状态类:

- `.is-open`
- `.is-selected`
- `.is-active`
- `.is-disabled`
- `.is-loading`
- `.is-error`
- `.is-compact`
- `.is-multi`

业务特化可以加前缀:

- `.composer-menu-*`
- `.composer-utility-git-branch-*`
- `.settings-select-*`

不要让新组件复用无关业务类名来获得样式。

## 20. React 实现规范

### 20.1 组件分层

推荐分层:

1. Headless hook: 负责 open/value/active/query/keyboard。
2. Presentational component: 负责 DOM 和 className。
3. Container component: 负责 IPC、后端、文件系统、业务 action。

简单场景可以合并 1 和 2，但不要把多个业务 API 调用散落在 option DOM 内。

### 20.2 事件处理

必须处理:

- trigger click 切换 open。
- document/window `pointerdown` 点击外部关闭。
- document/window `keydown` 捕获 Escape。
- 组件 unmount 时清理监听器。
- 选择 option 后关闭菜单。

注意:

- 菜单内部点击不应被外部关闭逻辑提前吞掉。
- 在编辑器旁边的菜单可以使用 `onMouseDown` 而不是 `onClick`，确保 selection 还在。

### 20.3 受控与非受控

业务选择器默认受控:

- `value` 由父级传入。
- `onChange` 通知父级。
- 组件内部只维护 open、activeIndex、query 等 UI transient state。

只有纯本地、无持久化的小型控件可以非受控。

### 20.4 Portal

使用 portal 时:

- panel id 仍必须稳定。
- trigger 与 panel 用 `aria-controls` 连接。
- 监听 window resize、scroll，并重新计算位置。
- 关闭时清理 portal node 或让 React unmount。

### 20.5 不要做的事

- 不要在 render 阶段发请求。
- 不要用 option label 当持久化 value。
- 不要让 disabled option 仍触发选择。
- 不要用 `setTimeout` 规避焦点问题，除非有明确注释和测试覆盖。
- 不要只写 hover 态，不写 keyboard focus 态。
- 不要让 panel 被父级 `overflow: hidden` 裁切后仍保持当前实现。

## 21. 当前项目推荐组件清单

后续如果要抽通用组件，建议按以下顺序沉淀:

1. `DropdownSelect`: 单选、支持分组/说明/禁用/空状态。
2. `DropdownCombobox`: 搜索单选、支持本地过滤和异步加载。
3. `DropdownMultiSelect`: 多选、支持 selected chips 和分组。
4. `CommandListbox`: 面向 Composer 的命令候选，保留编辑器锚点定位能力。

放置建议:

- 通用组件: `src/renderer/src/app/ui/dropdown-select.tsx`
- 通用样式: `src/renderer/src/styles/dropdown-select.css`
- 业务容器: 留在对应 feature 目录，如 `app/composer`、`app/settings`。

## 22. 典型场景规范

### 22.1 Composer Model Select

用途: 选择当前消息使用的模型和推理强度。

要求:

- 触发器显示模型 label；如果选择了推理强度，用 `Model · Effort` 摘要。
- 菜单向上展开。
- 模型选择和推理强度用 divider 分隔。
- `Use server default` 和 `Model default` 必须作为明确选项。
- 没有模型时显示 empty state，不隐藏整个菜单。

### 22.2 Git Branch Select

用途: 显示并切换当前项目 Git 分支。

要求:

- 触发器显示当前分支，长分支名省略。
- 当前分支 option 禁用，trailing 显示 `Current`。
- remote branch 必须用 badge 标记。
- 切换期间禁用其他切换操作。
- 失败时保持 panel 打开并显示错误。
- 创建分支属于 dialog，不塞进普通 option。

### 22.3 Composer Command Select

用途: `/`、`@` 等编辑器内候选。

要求:

- 使用 `role="listbox"` / `role="option"`。
- 键盘上下移动 active option。
- Enter 选择 active option。
- Escape 关闭。
- 鼠标选择使用 `onMouseDown` 保留编辑器 selection。
- 文件路径长文本必须省略，保留尾部路径。

### 22.4 Settings Select

用途: 设置页里的 provider、model、theme、appearance 等枚举。

要求:

- 简单枚举优先原生 `<select>`。
- 需要说明/分组时使用自建 single select。
- 表单 field 必须有可见 label 和 helper/error 区域。
- 高度默认 38-42px，不使用 Composer 的超紧凑 chip。

### 22.5 Provider -> Model Cascading Select

用途: 上级 provider 影响下级 model。

要求:

- 下级加载时保留当前显示并显示 loading。
- 上级变化导致当前下级值失效时，明确回落到默认值或提示用户重选。
- 不自动静默选择第一个 model，除非产品语义明确。
- 错误状态显示在下级 field。

### 22.6 Multi Skill / MCP Select

用途: 给当前消息或项目启用多个 skill/MCP。

要求:

- 支持搜索。
- 已选项在列表中显示 selected/check。
- trigger 显示摘要。
- option disabled 时显示原因，如 already tagged。
- 选择变化需要与 Composer inline tag 机制保持一致，避免重复启用。

## 23. 测试规范

### 23.1 单元测试

至少覆盖:

- 打开/关闭。
- 选择 option 后调用 `onChange`。
- disabled option 不可选。
- Escape 关闭。
- ArrowUp/ArrowDown 改变 active option。
- 空状态和 loading 状态渲染。
- 异步旧响应不覆盖新响应。

### 23.2 React Testing Library

查询优先级:

1. `getByRole("button", { name: /select model/i })`
2. `getByRole("listbox")`
3. `getByRole("option", { name: /.../i })`
4. 避免依赖 className 查询。

### 23.3 手工验收

每个新增 dropdown select 至少检查:

- 鼠标打开、选择、外部点击关闭。
- 键盘打开、上下移动、Enter 选择、Escape 关闭。
- 长文本不撑破布局。
- 窄窗口不越界。
- 暗色模式可读。
- loading/error/empty 状态可见。
- 屏幕阅读器有可理解名称。

## 24. 迁移建议

短期:

1. 新增选择器按本规范实现。
2. 不强制立刻重写 `Composer.tsx` 和 `GitBranchSwitcher.tsx`。
3. 新样式优先 token 化，减少硬编码浅色。

中期:

1. 抽出 `DropdownSelect` 与 `DropdownCombobox`。
2. 让 Composer 模型菜单和 Git 分支菜单共享 option 样式。
3. 给 command menu 保留独立实现，但复用键盘导航工具。

长期:

1. 如果选择器数量继续增长，评估引入无样式可访问性 primitive。
2. 引入前必须确认 bundle、Electron 兼容性、样式控制权和测试成本。

## 25. 评审清单

提交任何 dropdown select 相关改动前，检查:

- [ ] 类型选择正确: native select / single select / combobox / multi-select。
- [ ] 使用项目 token，没有新增孤立颜色体系。
- [ ] trigger 有 `aria-label` 或可见 label。
- [ ] open state 使用 `aria-expanded`。
- [ ] panel 和 option role 与交互复杂度匹配。
- [ ] 支持 Escape、ArrowUp、ArrowDown、Enter。
- [ ] 关闭后焦点路径合理。
- [ ] loading、empty、error、disabled 状态完整。
- [ ] 长文本、省略、tooltip/title 已处理。
- [ ] 异步请求无竞态覆盖。
- [ ] 窄窗口和暗色模式已检查。
- [ ] 测试覆盖关键交互。
