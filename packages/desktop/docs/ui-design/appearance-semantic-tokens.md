# Appearance Semantic Token 注释

最后更新: 2026-04-25  
适用范围: `packages/desktop` 的 Settings / Appearance 配色编辑页与 Electron Renderer 视觉 token  
相关实现入口:

- `src/shared/appearance.ts`
- `src/renderer/src/styles/tokens.css`
- `src/renderer/src/app/components.tsx`
- `src/renderer/src/app/appearance-theme.ts`

## 1. 文档目标

本文档为 Settings / Appearance 页面中可编辑的 semantic token 补充注释，重点说明每个 token 的语义、应用范围和使用边界。这里的 semantic token 指 `APPEARANCE_TOKEN_GROUPS` 暴露给设置页编辑的 token，不包含内部 mix token、历史 `--seg-*` / `--ui-*` 兼容别名，以及不可编辑的阴影、间距、圆角、动效 token。

组件样式应优先消费无模式后缀的运行态变量，例如 `--surface-panel`、`--text-primary`、`--semantic-error-text`。`-light` / `-dark` 变量主要由 Appearance 设置页编辑和主题解析使用，除主题定义层外，不建议在业务样式中直接引用。

## 2. 命名规则

| 结构 | 说明 |
| --- | --- |
| `*-light` / `*-dark` | 对应浅色模式和深色模式的可编辑值。 |
| 无后缀运行态变量 | 当前主题实际消费的变量，由 `tokens.css` 根据系统/手动主题切换到 light 或 dark。 |
| `surface-*` | 背景、容器、浮层、代码区等“承载内容的面”。 |
| `text-*` | 文本和图标颜色层级。 |
| `border-*` | 分隔线、轮廓线、描边层级。 |
| `brand-*` | 产品主强调色与交互强调面。 |
| `semantic-{status}-*` | 成功、警告、错误、信息等状态语义色。 |
| `*-strong` | 同一语义下更高强调、更高对比或更接近前景的版本。 |
| `*-surface` | 柔和状态背景，适合承载文本或图标。 |
| `*-surface-strong` | 比普通 surface 更明显的状态背景，用于选中、重点提示或密集区域。 |

## 3. Foundation / Surfaces

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--surface-app-light` / `--surface-app-dark` | 应用最外层画布背景，是整个窗口视觉的最底层。 | `body`、应用 root、窗口边缘留白、没有具体内容承载语义的背景区域。不要用于卡片、浮层或可点击控件。 |
| `--surface-shell-light` / `--surface-shell-dark` | 主壳层和工作区框架背景，比 app 背景更接近内容区。 | App shell、主布局背景、设置页外层、工作区框架、顶层 chrome。用于区分窗口底色和内容承载区。 |
| `--surface-panel-light` / `--surface-panel-dark` | 标准内容面板背景，是大部分可读内容的默认承载面。 | 设置面板、表单块、信息面板、普通卡片、线程内容容器。适合放置主要文本和常规控件。 |
| `--surface-panel-muted-light` / `--surface-panel-muted-dark` | 低强调面板背景，用于把次级内容从主面板中轻微分离。 | 次级行、摘要块、只读配置预览、轻量分组背景、表格或列表的低强调区域。不要替代主要页面背景。 |
| `--surface-sidebar-light` / `--surface-sidebar-dark` | 侧栏默认背景，承担导航和辅助信息区域的基础面。 | 左侧 rail、右侧 sidebar、设置页侧栏、辅助导航栏。应与主 panel 有明显但不过度的层级差。 |
| `--surface-sidebar-strong-light` / `--surface-sidebar-strong-dark` | 侧栏内更强的背景层，用于选中或强调导航区域。 | 当前导航项背景、侧栏选中轨道、侧栏内重点区域、收起/展开状态提示。不要用于普通内容卡片。 |
| `--surface-user-bubble-light` / `--surface-user-bubble-dark` | 用户消息气泡背景，表达“用户输入内容”的来源语义。 | 聊天线程中的 user message、用户提交的 prompt 区块。不要用于系统回复、工具输出或普通提示。 |
| `--surface-trace-light` / `--surface-trace-dark` | Trace、工具调用和执行细节的背景面。 | Tool call、trace item、执行日志片段、调试详情、后台步骤说明。用于把机器执行信息和普通对话内容区分开。 |
| `--surface-elevated-light` / `--surface-elevated-dark` | 浮在主界面之上的高层级背景。 | Dropdown、popover、menu、tooltip、dialog、sheet、浮动搜索结果。通常配合阴影或边框使用。 |
| `--surface-overlay-light` / `--surface-overlay-dark` | 遮罩层和临时覆盖层背景。 | Modal backdrop、拖拽遮罩、阻断交互的 scrim、全局等待覆盖。不要用于承载可读正文。 |
| `--surface-code-light` / `--surface-code-dark` | 代码、终端和等宽内容的基础背景。 | Code block、terminal、命令输出、日志预览。通常搭配 `--text-on-dark` 或终端专用文本色。 |
| `--surface-code-strong-light` / `--surface-code-strong-dark` | 更深或更高对比的代码区背景。 | Terminal 内层、代码块强调区域、当前命令行、嵌套日志容器。用于需要更强边界或更沉稳底色的代码场景。 |

## 4. Foundation / Content

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--text-primary-light` / `--text-primary-dark` | 最高强调文本色，承载页面主信息。 | 标题、正文、表单值、主要按钮文字、列表主标题。不要用于弱提示或禁用文本。 |
| `--text-secondary-light` / `--text-secondary-dark` | 次级文本色，承载说明和辅助阅读信息。 | Helper text、描述、标签、元信息、次要按钮文字、列表副标题。 |
| `--text-tertiary-light` / `--text-tertiary-dark` | 低强调文本色，表达弱提示或背景信息。 | Placeholder、空状态辅助说明、时间戳、非关键 meta、禁用附近的补充信息。不要用于必须阅读的错误或操作文案。 |
| `--text-on-dark-light` / `--text-on-dark-dark` | 深色或高饱和背景上的反白文本。 | Code/terminal 文本、深色品牌按钮、深色 badge、深色状态面。不要在普通浅色 panel 上使用。 |
| `--border-subtle-light` / `--border-subtle-dark` | 最低强调分隔线。 | 轻量分割、列表行间隔、卡片内部弱边界、低视觉权重的 hairline。 |
| `--border-default-light` / `--border-default-dark` | 标准边框色。 | 输入框、按钮、面板、菜单、表格、常规卡片边框。 |
| `--border-strong-light` / `--border-strong-dark` | 高强调边框色。 | Focus 附近的辅助描边、选中态边界、重要分区、需要更清晰层级的容器边框。不要大面积使用，以免界面变重。 |

## 5. Accent States

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--brand-primary` / `--brand-primary-dark` | 品牌主强调色，是产品交互的基础 accent。 | 主按钮、链接、关键图标、当前状态标识、需要表达品牌主操作的元素。不要用于成功/错误等业务状态。 |
| `--brand-primary-hover` / `--brand-primary-hover-dark` | 主强调色的 hover 或增强版本。 | 主按钮 hover、链接 hover、可点击 accent 元素的悬停态、较高强调的边框或图标。 |
| `--brand-accent-highlight` / `--brand-accent-highlight-dark` | 活跃、高亮或被选中的强调色。 | Active state、当前选项高亮、选区强调、重要 chip 或 badge。应保留给“当前/选中/高亮”语义。 |
| `--brand-primary-soft` / `--brand-primary-soft-dark` | 柔和的品牌强调背景。 | 选中项浅背景、hover 背景、轻量 badge 背景、非阻断提示背景。适合大面积但低强度使用。 |
| `--brand-primary-soft-strong` / `--brand-primary-soft-strong-dark` | 更明显的柔和品牌背景。 | 当前导航项、激活工具按钮、重点筛选条件、需要比普通 soft 更清晰的 accent surface。 |

## 6. Status / Success

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-success-light` / `--semantic-success-dark` | 成功状态基础色，表达完成、通过、连接正常。 | 成功图标、成功 badge、完成状态点、非文本性的成功强调。 |
| `--semantic-success-strong-light` / `--semantic-success-strong-dark` | 更强成功强调色。 | 需要更高可见度的成功图标、成功按钮边框、状态摘要重点值。 |
| `--semantic-success-text-light` / `--semantic-success-text-dark` | 放在中性背景上的成功文本色。 | 成功提示文案、状态 label、成功 icon 与文本组合。优先用于文字，不要用 base 色硬套正文。 |
| `--semantic-success-border-light` / `--semantic-success-border-dark` | 成功语义描边。 | 成功 alert 边框、通过状态卡片边界、成功表单状态轮廓。 |
| `--semantic-success-surface-light` / `--semantic-success-surface-dark` | 柔和成功背景。 | 成功 toast、轻量成功提示、通过状态行背景、同步完成提示。 |
| `--semantic-success-surface-strong-light` / `--semantic-success-surface-strong-dark` | 更明显的成功背景。 | 成功 alert 的重点区域、选中的成功筛选、需要在密集 UI 中更突出成功状态的面。 |

## 7. Status / Warning

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-warning-light` / `--semantic-warning-dark` | 警告状态基础色，表达需要注意但未必失败。 | 警告图标、风险状态点、配额接近上限、待确认状态。 |
| `--semantic-warning-strong-light` / `--semantic-warning-strong-dark` | 更强警告强调色。 | 高风险但可恢复的提示、重要 warning icon、警告按钮边框。 |
| `--semantic-warning-text-light` / `--semantic-warning-text-dark` | 放在中性背景上的警告文本色。 | 警告文案、表单警告、非阻断问题说明、需要用户留意的状态 label。 |
| `--semantic-warning-border-light` / `--semantic-warning-border-dark` | 警告语义描边。 | Warning alert 边框、风险区域边界、需要注意的表单区块轮廓。 |
| `--semantic-warning-surface-light` / `--semantic-warning-surface-dark` | 柔和警告背景。 | 非阻断 warning、注意事项、配额提醒、任务可能需要确认的提示背景。 |
| `--semantic-warning-surface-strong-light` / `--semantic-warning-surface-strong-dark` | 更明显的警告背景。 | 高优先级 warning、密集列表中的警告行、需要更清楚和普通提示区分的 warning 面。 |

## 8. Status / Error

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-error-light` / `--semantic-error-dark` | 错误状态基础色，表达失败、危险、阻断。 | 错误图标、失败状态点、危险操作提示、状态 badge。 |
| `--semantic-error-strong-light` / `--semantic-error-strong-dark` | 更强错误强调色。 | 高严重度错误、破坏性操作、关键失败状态、需要快速识别的错误图标或边界。 |
| `--semantic-error-text-light` / `--semantic-error-text-dark` | 放在中性背景上的错误文本色。 | 表单校验错误、失败原因、阻断性提示、危险操作说明。 |
| `--semantic-error-border-light` / `--semantic-error-border-dark` | 错误语义描边。 | 错误输入框边框、失败 alert 边框、危险区域边界、错误状态卡片轮廓。 |
| `--semantic-error-surface-light` / `--semantic-error-surface-dark` | 柔和错误背景。 | 错误 toast、失败提示、表单错误块、非破坏性错误摘要背景。 |
| `--semantic-error-surface-strong-light` / `--semantic-error-surface-strong-dark` | 更明显的错误背景。 | 阻断性错误区块、危险确认区域、密集 UI 中需要突出失败状态的面。 |

## 9. Status / Info

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-info-light` / `--semantic-info-dark` | 信息状态基础色，表达中性提示、系统信息或解释。 | 信息图标、提示 badge、帮助入口、非成功/警告/错误的系统状态。 |
| `--semantic-info-strong-light` / `--semantic-info-strong-dark` | 更强信息强调色。 | 需要更清晰可见的信息图标、选中说明、强调型 info badge。 |
| `--semantic-info-text-light` / `--semantic-info-text-dark` | 放在中性背景上的信息文本色。 | 信息提示文案、系统说明、帮助文本、非阻断状态 label。 |
| `--semantic-info-border-light` / `--semantic-info-border-dark` | 信息语义描边。 | Info alert 边框、说明区域边界、帮助面板轮廓。 |
| `--semantic-info-surface-light` / `--semantic-info-surface-dark` | 柔和信息背景。 | 普通提示、帮助说明、系统状态摘要、轻量教育性提示背景。 |
| `--semantic-info-surface-strong-light` / `--semantic-info-surface-strong-dark` | 更明显的信息背景。 | 重点信息提示、当前引导步骤、需要在密集内容中突出但不表示风险的说明面。 |

## 10. Dropdown Select

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-dropdown-menu-surface-light` / `--semantic-dropdown-menu-surface-dark` | 下拉菜单展开层的专用背景。 | Select menu、dropdown menu、combobox panel、命令候选浮层。用于区别浮层菜单和普通 panel，避免菜单跟页面背景混在一起。 |

## 11. Composer

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--semantic-composer-surface-light` / `--semantic-composer-surface-dark` | Composer 输入区的专用背景。 | 任务输入框、Composer 主容器、输入编辑器承载面。不要泛化到普通表单输入，Composer 需要保持独立调色能力。 |
| `--semantic-composer-button-surface-light` / `--semantic-composer-button-surface-dark` | Composer 内按钮的轻量交互背景。 | Composer 工具按钮 hover、模型/推理选择器 hover、附件或命令按钮的低强调背景。 |
| `--semantic-composer-button-surface-strong-light` / `--semantic-composer-button-surface-strong-dark` | Composer 内按钮的强交互背景。 | Composer 工具按钮 selected/open/active 状态、当前菜单触发器、已启用工具按钮。 |
| `--semantic-composer-button-text-light` / `--semantic-composer-button-text-dark` | Composer 内按钮 hover 或低强调 active 文本色。 | Composer 工具按钮文字、图标、选择器文字的交互态。 |
| `--semantic-composer-button-text-strong-light` / `--semantic-composer-button-text-strong-dark` | Composer 内按钮 selected/open/active 文本色。 | 已选中的工具按钮、打开的选择器触发器、启用状态图标。用于比 hover 更明确的当前状态。 |

## 12. Global Interaction

| Token | 语义 | 应用范围 |
| --- | --- | --- |
| `--focus-outline-color-light` / `--focus-outline-color-dark` | 全局键盘焦点轮廓色。 | `:focus-visible` outline、可访问性焦点环、输入框和按钮键盘聚焦态。不能只靠 hover 色替代。 |
| `--selection-background-light` / `--selection-background-dark` | 文本选区和轻量选中背景。 | `::selection`、文本选择、轻量 list selection、非持久性高亮。不要用于长期 active state，长期状态优先用 brand 或 component token。 |
| `--ui-panel-light` / `--ui-panel-dark` | 半透明通用面板背景。 | 玻璃感轻面板、浮动摘要、叠在复杂背景上的工具面。用于需要透出底层但仍保持可读性的区域。 |
| `--ui-panel-subtle-light` / `--ui-panel-subtle-dark` | 更低强调的半透明面板背景。 | 次级半透明面、辅助提示、弱分组背景、不会承载大量正文的轻量区域。 |

## 13. 使用边界

1. 新增业务状态时，先判断是否属于 success / warning / error / info，避免为局部功能新增孤立颜色。
2. 组件级 token 只用于对应组件域。例如 Composer token 不应驱动普通设置页按钮，Dropdown token 不应驱动普通 panel。
3. 状态文本使用 `*-text`，状态边框使用 `*-border`，状态背景使用 `*-surface`。不要用同一个 base 色同时承担文本、边框和背景。
4. 大面积背景优先使用 surface token，品牌色和状态色只用于强调、反馈和明确状态。
5. 暗色模式下不要通过降低 opacity 直接复用浅色 token，应编辑对应 `-dark` token，保证对比度可控。

## 14. 评审清单

提交 Appearance token 相关改动前，检查:

- [ ] 新 token 是否已经在本文档标注语义和应用范围。
- [ ] 业务样式是否消费无后缀运行态变量，而不是直接引用 `-light` / `-dark`。
- [ ] 文本、边框、背景是否分别使用对应层级的 token。
- [ ] 组件级 token 是否只在对应组件域内使用。
- [ ] 浅色和深色值是否分别检查过可读性和状态辨识度。
