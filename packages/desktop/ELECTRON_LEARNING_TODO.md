# Electron Frontend Learning TODO

## 1. 这份文档的目标

这份清单面向当前 `packages/desktop` 项目，目标不是把 Electron 所有知识一次学完，而是让你尽快具备下面这几种能力：

- 看懂这个项目前端是怎么分层的
- 能 review 界面结构、交互流程和组件设计
- 能提出更准确的需求，而不是只描述“感觉不对”
- 能自己修改一部分 renderer 层代码
- 能看懂 main、preload、renderer 三层之间的边界
- 能通过测试、类型检查和手动验证判断改动是否靠谱

当前项目使用的是：

- Electron
- React
- TypeScript
- electron-vite
- Vitest
- Testing Library

所以学习重点不是“纯 Electron API”，而是：

`Electron 前端 = React 前端 + 桌面壳层 + 安全桥接 + IPC 通信`

---

## 2. 先建立正确心智模型

### 2.1 你必须先理解的三层

#### `main` 主进程

负责应用生命周期和系统能力控制，例如：

- 创建窗口
- 注册 IPC
- 调用 Electron 原生 API
- 控制菜单、托盘、文件系统、通知、窗口行为

当前入口文件：

- `src/main/index.ts`

#### `preload` 预加载脚本

负责在安全前提下，把主进程允许暴露的能力桥接给前端页面。

当前入口文件：

- `src/preload/index.ts`

#### `renderer` 渲染进程

就是你平时最熟悉的前端页面层，本质上是一个 React 应用。

当前入口文件：

- `src/renderer/src/main.tsx`
- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`

### 2.2 一句话理解三层关系

- `main` 决定“能做什么系统级事情”
- `preload` 决定“页面被允许调用什么能力”
- `renderer` 决定“界面怎么展示、怎么交互”

### 2.3 你 review 时应该优先看什么

如果你的目标是 review 设计和提需求，优先顺序应该是：

1. `renderer` 的页面结构和交互
2. `preload` 暴露了哪些能力
3. `main` 是否按正确方式注册了能力
4. 是否存在安全边界混乱的问题

---

## 3. 当前项目的阅读地图

建议按下面顺序读代码。

### 第 1 遍：只看整体，不抠细节

1. `package.json`
2. `electron.vite.config.ts`
3. `src/main/index.ts`
4. `src/preload/index.ts`
5. `src/renderer/src/main.tsx`
6. `src/renderer/src/App.tsx`
7. `src/renderer/src/styles.css`
8. `src/renderer/src/App.test.tsx`
9. `vitest.config.ts`

### 第 2 遍：带着问题看

每看一个文件，回答这些问题：

- 这个文件属于哪一层
- 这个文件的职责是什么
- 输入是什么
- 输出是什么
- 它依赖谁
- 谁依赖它

### 第 3 遍：能复述

要求自己能不用看代码就讲出来：

- 应用从启动到页面显示的路径是什么
- 页面为什么能访问 `window.desktop`
- 为什么 `renderer` 不能直接乱用 Node 能力
- 现在的 mock 数据存在哪里
- 测试是怎么伪造 `window.desktop` 的

---

## 4. 必学知识清单

下面不是“可选了解”，而是你要 review 和提需求时必须掌握的基础。

### 4.1 React 基础

#### 学会这些概念

- 组件是什么
- JSX 是什么
- `props` 和 `state` 的区别
- 事件处理
- 条件渲染
- 列表渲染
- 表单输入控制
- `useState`
- `useEffect`
- `useDeferredValue`
- `startTransition`

#### 在当前项目里对应看哪里

- `App.tsx` 中的状态定义
- `handleSend`
- `handlePromptApply`
- 搜索过滤逻辑
- 会话切换逻辑
- 输入框受控状态

#### 学习完成的标准

- 你能解释为什么输入框要绑定 `value` 和 `onChange`
- 你能解释为什么点“发送任务”后界面会立即追加一条用户消息和一条 agent 消息
- 你能自己加一个新按钮和一个新状态

### 4.2 TypeScript 基础

#### 学会这些概念

- 类型注解
- `interface`
- `type`
- 联合类型
- 数组和对象类型
- 函数参数和返回值类型
- 可选属性
- 类型收窄

#### 在当前项目里对应看哪里

- `SessionStatus`
- `SessionSummary`
- `WorkspaceGroup`
- `UserTurn`
- `AssistantTurn`
- `Turn`

#### 学习完成的标准

- 你能看懂 `Turn = UserTurn | AssistantTurn`
- 你能新增一个字段并让类型检查通过
- 你知道为什么 `strict: true` 会帮你提前发现问题

### 4.3 CSS 布局与桌面端信息架构

#### 学会这些概念

- `display: flex`
- `display: grid`
- `minmax`
- `overflow`
- `position`
- `gap`
- `padding`
- `border-radius`
- 层级和视觉分组
- 空状态、悬停态、选中态、禁用态
- 桌面端布局和响应式的区别

#### 在当前项目里对应看哪里

- `.app-shell`
- `.sidebar`
- `.canvas`
- `.workspace-list`
- `.thread-shell`
- `.composer`
- `.metric-card`
- `.session-card`

#### 学习完成的标准

- 你能解释为什么主布局用了 grid
- 你能自己调整左右栏比例
- 你能自己加一个 loading 卡片样式

### 4.4 Electron 核心概念

#### 必须搞懂

- `app.whenReady`
- `BrowserWindow`
- `ipcMain.handle`
- `ipcRenderer.invoke`
- `contextBridge.exposeInMainWorld`
- `contextIsolation: true`
- `nodeIntegration: false`

#### 在当前项目里对应看哪里

- `src/main/index.ts`
- `src/preload/index.ts`

#### 学习完成的标准

- 你能解释 `window.desktop.getInfo()` 到底经过了哪几层
- 你能自己加一个新的 IPC 能力
- 你知道为什么不要在 renderer 里直接暴露危险能力

### 4.5 测试基础

#### 学会这些概念

- 单元测试和界面测试是什么
- `render`
- `screen`
- `fireEvent`
- `waitFor`
- mock
- 断言

#### 在当前项目里对应看哪里

- `src/renderer/src/App.test.tsx`
- `src/renderer/src/test-setup.ts`
- `vitest.config.ts`

#### 学习完成的标准

- 你能看懂测试里为什么要 mock `window.desktop`
- 你能自己补一个“点击按钮后状态变化”的测试
- 你能区分“测试失败”和“类型检查失败”

---

## 5. 建议学习顺序

不要一开始就钻 Electron 文档。先把 renderer 层吃透，再理解跨进程通信。

### 阶段 1：先把 renderer 当普通 React 项目学会

目标：

- 能读懂页面代码
- 能调整布局
- 能改交互
- 能写一个简单测试

任务：

- [ ] 跑起项目并观察页面
- [ ] 阅读 `App.tsx`
- [ ] 阅读 `styles.css`
- [ ] 理解会话列表、主区域、底部 composer 的布局关系
- [ ] 看懂 state 是怎么驱动界面的
- [ ] 看懂发送任务时的数据追加逻辑
- [ ] 给 sidebar 增加一个新分组或新统计项
- [ ] 给主区域增加一个新卡片
- [ ] 新增一个小测试验证交互

### 阶段 2：理解 main / preload / renderer 的边界

目标：

- 能看懂 Electron 架构
- 能看懂为何要走 preload
- 能提出正确的能力接入需求

任务：

- [ ] 阅读 `src/main/index.ts`
- [ ] 阅读 `src/preload/index.ts`
- [ ] 画出 `renderer -> preload -> main` 调用路径
- [ ] 理解 `ipcMain.handle` 和 `ipcRenderer.invoke`
- [ ] 新增一个 IPC：例如 `desktop:get-app-version`
- [ ] 在页面上展示这个新字段
- [ ] 给这个能力补一条测试或至少补 mock

### 阶段 3：具备 review 一个桌面前端方案的能力

目标：

- 能指出结构问题
- 能指出边界问题
- 能指出状态缺失
- 能提出更工程化的需求

任务：

- [ ] 把 `App.tsx` 拆成多个组件
- [ ] 识别哪些是纯展示组件，哪些是容器组件
- [ ] 明确 mock 数据和未来真实数据的边界
- [ ] 给页面补 loading / empty / error 三种状态
- [ ] 检查哪些文本、按钮、列表项应该来自真实数据
- [ ] 检查哪些交互未来需要接入系统能力

### 阶段 4：补工程化能力

目标：

- 能自己验证改动
- 能控制回归风险
- 能为需求拆分任务

任务：

- [ ] 熟练使用 `npm run dev`
- [ ] 熟练使用 `npm run test`
- [ ] 熟练使用 `npm run typecheck`
- [ ] 学会先写需求，再改代码，再验证
- [ ] 学会将大组件拆成小组件
- [ ] 学会在改动前先列出验收标准

---

## 6. 按周执行的学习 TODO

如果你想系统学习，可以按 4 周推进。

### 第 1 周：只学 renderer 层

- [ ] 跑通项目，知道怎么启动、怎么看页面、怎么看控制台
- [ ] 读 `App.tsx`，标注出每一块 UI 对应的数据来源
- [ ] 读 `styles.css`，标注出每一块布局类名
- [ ] 自己修改 3 个视觉细节
- [ ] 自己修改 2 个交互细节
- [ ] 补 1 个测试

本周产出要求：

- 能讲清页面由哪些区域组成
- 能指出哪段代码负责渲染会话列表
- 能指出哪段代码负责发送消息
- 能独立改一个小需求

### 第 2 周：学 Electron 边界和 IPC

- [ ] 读 `src/main/index.ts`
- [ ] 读 `src/preload/index.ts`
- [ ] 画出调用链
- [ ] 新增一个桥接能力
- [ ] 在 renderer 中消费它
- [ ] 处理一个失败兜底逻辑

本周产出要求：

- 能解释为什么要用 `contextBridge`
- 能解释为什么 `nodeIntegration` 关闭更安全
- 能自己提出“这个能力应该加在 preload 还是 renderer”这种判断

### 第 3 周：做结构化重构

- [ ] 把 `App.tsx` 拆成多个组件
- [ ] 为组件定义更清晰的类型
- [ ] 整理 mock 数据结构
- [ ] 增加空状态、错误状态、加载状态
- [ ] 给关键流程再补 2 个测试

本周产出要求：

- 能 review 组件拆分是否合理
- 能指出哪些状态没有被建模
- 能识别“视觉问题”和“数据结构问题”的差别

### 第 4 周：模拟真实需求接入

- [ ] 设计一个真实功能，例如“读取本地工作区列表”
- [ ] 先写需求说明
- [ ] 再写数据流图
- [ ] 再补 main / preload / renderer 三层改动
- [ ] 再补测试和验收步骤

本周产出要求：

- 能把一个需求拆成可执行任务
- 能说明每层要改什么
- 能提出可验证的验收标准

---

## 7. 必做的项目内实战任务

下面这些任务最适合用来学习，因为它们都和当前代码直接相关。

### 任务 A：拆分 `App.tsx`

建议拆成：

- `Sidebar`
- `WorkspaceList`
- `CanvasHeader`
- `ThreadView`
- `AssistantCard`
- `Composer`

学习重点：

- 组件边界
- props 设计
- 状态归属
- 类型传递

验收标准：

- [ ] 页面行为不变
- [ ] 类型检查通过
- [ ] 现有测试通过

### 任务 B：增加一个新的 Electron 能力

功能建议：

- 获取应用版本
- 获取用户主目录路径
- 获取当前窗口状态

学习重点：

- `main` 注册能力
- `preload` 暴露能力
- `renderer` 调用能力
- 异步调用和失败兜底

验收标准：

- [ ] 页面可展示新数据
- [ ] renderer 不直接访问危险 API
- [ ] 类型检查通过

### 任务 C：给 UI 增加状态建模

建议新增：

- loading
- empty
- error
- sending

学习重点：

- 状态建模
- 条件渲染
- 交互一致性

验收标准：

- [ ] 四种状态都能被手动触发
- [ ] 状态切换逻辑清楚
- [ ] 测试覆盖至少其中 2 种状态

### 任务 D：修复文本与编码问题

当前 `App.tsx` 中有明显的中文乱码文本，这类问题非常值得你拿来学习。

学习重点：

- 字符编码问题识别
- 文案集中管理
- UI 文案和数据解耦

验收标准：

- [ ] 所有可见中文恢复正常显示
- [ ] placeholder、按钮、标题都可读
- [ ] 测试中的文本选择器同步更新

### 任务 E：让 mock 数据更接近真实数据

建议做法：

- 把 mock 数据从 `App.tsx` 拆出去
- 用单独文件管理
- 明确哪些字段是页面展示必需字段

学习重点：

- 数据模型
- 前端状态组织
- 组件与数据解耦

验收标准：

- [ ] `App.tsx` 体积变小
- [ ] mock 数据结构更容易 review
- [ ] 添加新 session 更容易

---

## 8. 每次学习时都要问自己的问题

### 看 UI 结构时

- 这块区域是干什么的
- 这块区域的数据从哪里来
- 这块区域是否应该拆组件
- 这块区域有哪些状态
- 这块区域是静态展示还是动态交互

### 看 React 代码时

- 这个 state 是否放在正确位置
- 这个逻辑是否应该抽成函数
- 这个组件是否太大
- 这段 JSX 是否难读
- 这个事件处理是否有副作用

### 看 Electron 代码时

- 这个能力是否必须在主进程实现
- 这个能力是否应该通过 preload 暴露
- 暴露给 renderer 的接口是否过大
- 这个能力是否有安全风险

### 看测试时

- 这个测试是在验证什么行为
- 这个行为是用户真正关心的吗
- 这个测试是否依赖了太多实现细节
- 如果 UI 改了，这个测试是否很脆弱

---

## 9. 你要掌握的命令

### 开发命令

```bash
npm run dev
```

作用：

- 启动 Electron 开发环境
- 同时构建 main、preload、renderer
- 修改代码后观察页面变化

### 类型检查

```bash
npm run typecheck
```

作用：

- 检查 TypeScript 类型问题
- 在运行前提前发现接口、字段、调用方式不匹配的问题

### 测试命令

```bash
npm run test
```

作用：

- 执行 `Vitest`
- 验证 renderer 层关键交互是否回归

### 打包命令

```bash
npm run build
```

作用：

- 构建桌面应用产物

### 你现在至少要养成的习惯

每次改动之后至少做这三步：

1. 手动看页面
2. 运行 `npm run typecheck`
3. 运行 `npm run test`

---

## 10. 测试学习 TODO

这部分单独列出来，因为它直接决定你以后 review 改动时有没有抓手。

### 第一步：看懂当前测试

文件：

- `src/renderer/src/App.test.tsx`

重点看：

- `beforeEach` 里是怎么 mock `window.desktop` 的
- 第一个测试验证了什么
- 第二个测试验证了什么
- 为什么用了 `waitFor`

完成标准：

- [ ] 你能自己口述这两个测试在验证的行为
- [ ] 你能解释为什么测试运行环境是 `jsdom`

### 第二步：新增一个小测试

建议从下面选一个：

- [ ] 点击 prompt chip 后，输入框内容会被替换
- [ ] 切换 `Autopilot / Review` 后，模式指标发生变化
- [ ] 搜索关键词后，列表会被过滤
- [ ] 点击“清空搜索”后，输入框恢复为空

完成标准：

- [ ] 你能独立写出 `render`
- [ ] 你能独立找到元素并触发事件
- [ ] 你能写出一个有效断言

### 第三步：补边界场景

建议测试：

- [ ] 空输入时点击发送，不追加消息
- [ ] `window.desktop.getInfo()` 失败时，页面能 fallback
- [ ] 搜索不到数据时显示 empty state

完成标准：

- [ ] 你开始关注失败路径，而不是只测 happy path

---

## 11. 未来 review 设计时的检查清单

当你以后 review 我给你的 Electron 前端方案时，按这个清单看。

### 结构层

- [ ] 页面是否分区明确
- [ ] 信息层级是否清楚
- [ ] 主次关系是否明确
- [ ] 用户主要操作路径是否明显

### 组件层

- [ ] 是否存在超大组件
- [ ] 组件职责是否单一
- [ ] props 是否过多
- [ ] 是否有可以复用的卡片、列表项、工具条

### 状态层

- [ ] 是否区分初始态、空态、加载态、错误态
- [ ] 是否区分本地状态和远程状态
- [ ] 是否存在状态散落、难以维护的问题

### Electron 边界层

- [ ] renderer 是否只做界面逻辑
- [ ] preload 是否只暴露必要 API
- [ ] main 是否承担系统能力
- [ ] 是否有直接暴露敏感能力给页面的问题

### 测试层

- [ ] 关键交互是否有测试
- [ ] 新增状态是否有测试
- [ ] mock 是否足够贴近真实接口

---

## 12. 常见误区

### 误区 1：把 Electron 学成“全是 API”

不对。你在这个项目里最先要学的是：

- React 组件
- 状态管理
- 页面布局
- IPC 边界

Electron API 是后面的壳层能力，不是第一优先级。

### 误区 2：一上来就做复杂主进程功能

不对。你现在更需要的是：

- 先会改 renderer
- 再会走 preload
- 最后再补 main

### 误区 3：只看页面，不看数据流

不对。界面问题往往不是“样式问题”，而是：

- 组件没拆好
- 状态没建模
- 数据结构不合理
- 层级职责不清楚

### 误区 4：只看 happy path

不对。真实项目一定要看：

- loading
- empty
- error
- fallback

### 误区 5：不做类型检查和测试

不对。桌面应用改动如果没有验证手段，review 的质量会很低。

---

## 13. 建议补充的知识主题

这些不是第一周必须掌握，但后面值得补。

- Electron 窗口管理
- 菜单与快捷键
- 文件系统访问
- 本地存储
- 日志与错误上报
- 性能优化
- React 组件拆分策略
- 更细致的状态管理方案
- E2E 测试
- 打包与发布

---

## 14. 这份项目的推荐学习路径总结

最务实的顺序是：

1. 先把 `renderer` 当 React 项目学懂
2. 再理解 `preload` 的桥接作用
3. 再看 `main` 如何注册系统能力
4. 再通过测试和类型检查建立验证习惯
5. 最后再进入更复杂的 Electron 能力接入

如果你只想先达到“能 review、能提需求”的水平，那么做到下面这些就已经够用了：

- 能读懂 `App.tsx`
- 能说清当前页面的区域结构
- 能指出哪些状态缺失
- 能说明一个新能力应该改 `main`、`preload` 还是 `renderer`
- 能跑测试、能补一个测试

---

## 15. 你的最小可执行学习计划

如果你今天就开始，先按下面做，不要发散。

### 今天

- [ ] 读 `App.tsx`
- [ ] 读 `styles.css`
- [ ] 跑 `npm run dev`
- [ ] 跑 `npm run test`
- [ ] 跑 `npm run typecheck`

### 明天

- [ ] 把 `App.tsx` 拆出 2 个组件
- [ ] 补 1 个小测试
- [ ] 修 1 个文案或布局问题

### 后天

- [ ] 读 `src/main/index.ts`
- [ ] 读 `src/preload/index.ts`
- [ ] 新增 1 个 IPC 能力

### 本周结束前

- [ ] 拆组件
- [ ] 补状态
- [ ] 补测试
- [ ] 学会用更准确的语言提需求

---

## 16. 提需求时建议你使用的表达方式

以后你给需求时，尽量从“感受描述”升级到“结构化描述”。

不够好的表达：

- 这个界面不太对
- 感觉不像桌面端
- 这里不高级

更好的表达：

- 左侧栏信息密度太高，应该减少摘要文本，只保留标题、状态和更新时间
- 主区域缺少 loading / empty / error 三种状态
- `App.tsx` 过大，建议拆成 sidebar、thread、composer 三层组件
- 这个能力属于系统能力，应该走 `main + preload`，不应该直接写在 renderer
- 发送任务后缺少 pending 状态，用户不知道是否正在处理

这会直接提高你 review 和提需求的效率。
