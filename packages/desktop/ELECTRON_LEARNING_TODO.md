# Electron Frontend Learning TODO

最后更新: 2026-04-02  
定位: 这是一份补充性的入门清单，不是项目规范。真实实现以 `README.md`、`AI_AGENT_FRONTEND_SPEC.md`、`DESKTOP_SERVER_API_SPEC.md` 为准。

## 1. 入门目标

如果你是第一次接手 `packages/desktop`，先把目标收窄到这四件事：

1. 看懂 `main / preload / renderer` 三层边界。
2. 能定位当前侧栏、会话和流式消息分别在哪些文件实现。
3. 能独立跑类型检查、测试和本地联调。
4. 能在不破坏边界的前提下，完成一个小需求或一个小修复。

## 2. 第一天先做什么

在 `packages/desktop` 执行：

```powershell
npm install
npm run dev
npm run typecheck
npm run test
```

第一天只要求你做到：

1. 知道项目能跑起来。
2. 知道测试和类型检查在哪里失败、在哪里通过。
3. 知道页面不是直接访问 Electron，而是通过 `window.desktop`。

## 3. 推荐阅读顺序

1. `README.md`
2. `FRONTEND_ARCHITECTURE_GUIDE.md`
3. `AI_AGENT_FRONTEND_SPEC.md`
4. `DESKTOP_SERVER_API_SPEC.md`
5. `src/renderer/src/App.tsx`
6. `src/renderer/src/app/use-desktop-shell.ts`
7. `src/renderer/src/app/use-agent-workspace.ts`
8. `src/renderer/src/app/components.tsx`
9. `src/renderer/src/app/stream.ts`
10. `src/preload/index.ts`
11. `src/main/ipc.ts`
12. `src/renderer/src/App.test.tsx`
13. `src/renderer/src/app/stream.test.ts`

## 4. 第一周练习清单

### 4.1 先读懂现状

- [ ] 能解释 `App.tsx` 为什么现在只是装配层。
- [ ] 能指出文件夹工作区加载逻辑在 `use-agent-workspace.ts` 的哪里。
- [ ] 能指出 `window.desktop` 是在哪里暴露出来的。
- [ ] 能解释历史消息回放为什么走 `stream.ts`。

### 4.2 做一个小改动

优先选这种低风险任务：

- [ ] 调整一个按钮文案或 aria-label。
- [ ] 给某个 trace item 增加一条样式。
- [ ] 为侧栏或 thread 增加一个小的空态/提示文案。
- [ ] 给 `stream.test.ts` 补一个新的 part 映射测试。

### 4.3 学会最基本的验证

- [ ] 每次改完都先跑 `npm run typecheck`。
- [ ] 再跑 `npm run test`。
- [ ] 能手动验证“打开文件夹 / 切会话 / 发消息”这三条主链路。

## 5. 第二周练习建议

如果第一周已经能独立定位代码，再做这些：

- [ ] 新增一个简单的 `window.desktop` 能力。
- [ ] 让 renderer 消费这个新能力。
- [ ] 给它补一个测试或至少补一个 mock 场景。
- [ ] 画出一次消息发送的跨层路径。

推荐题目：

1. 增加一个只读信息能力，例如 app version 或当前工作目录。
2. 新增一种简单的 trace 显示样式。
3. 给 `SidebarResizer` 增加一个额外的键盘交互测试。

## 6. 读代码时反复问自己的问题

### 看 renderer 时

- 这段状态属于桌面壳，还是属于工作区/会话业务？
- 这段逻辑应该放在 hook 里，还是只需要展示组件？
- 这是 UI 行为，还是 bridge / API 契约？

### 看 preload 时

- 这个能力真的应该暴露给页面吗？
- 暴露的入参和返回值是否足够稳定、足够小？

### 看 main 时

- 这是系统能力、后端网关，还是其实应该留在 renderer 的本地状态？
- 请求返回的数据是否已经整理成 renderer 可以直接消费的结构？

### 看测试时

- 测的是用户真正关心的行为，还是测试实现细节？
- 是否覆盖了失败路径、回退路径和流式过程？

## 7. 当前最值得做的实战任务

### 任务 A: 给 `stream.ts` 增加一种新 part 映射

学习点：

- 类型扩展
- 纯函数测试
- 样式与 UI 同步

验收：

- [ ] `stream.test.ts` 有新用例
- [ ] `App.test.tsx` 没被破坏
- [ ] 文档同步更新

### 任务 B: 新增一个 bridge 能力

学习点：

- `main -> preload -> renderer` 的完整路径
- 类型定义和错误处理

验收：

- [ ] preload 正确暴露 API
- [ ] renderer 不直接碰 Electron API
- [ ] `npm run typecheck` 和 `npm run test` 通过

### 任务 C: 做一次小型文档同步

学习点：

- 理解什么是 SSOT
- 识别“规范”和“教程”的边界

验收：

- [ ] UI 变更同步更新 `AI_AGENT_FRONTEND_SPEC.md`
- [ ] API 变更同步更新 `DESKTOP_SERVER_API_SPEC.md`

## 8. 最低测试指令

日常改动：

```powershell
npm run typecheck
npm run test
```

联调后端协议时，再加：

```powershell
cd ..\fanfandeagent
bun test Test/server.api.test.ts
```

## 9. 常见误区

1. 只盯着 `App.tsx`，不看 hook 和 `stream.ts`。
2. 在 renderer 里直接想办法绕过 `window.desktop`。
3. 只测 happy path，不测后端失败和 seed fallback。
4. 把学习文档当成规范文档，结果越写越重复。
