我已经分析了 `src/bus` 文件夹的内容。以下是详细分析：

## 文件结构

- `src/bus/index.ts`：核心总线实现，提供发布-订阅模式
- `src/bus/bus-event.ts`：事件定义和注册表，使用 Zod 进行模式验证
- `src/bus/global.ts`：全局事件发射器，用于跨实例通信

## 功能概述

### 1. 事件定义系统 (`bus-event.ts`)

- 提供 `BusEvent.define(type, properties)` 方法，用于创建类型安全的事件定义
- 使用 Zod schema 验证事件属性
- 维护全局注册表 (`registry`) 跟踪所有已定义事件
- 提供 `payloads()` 方法生成所有事件的 Zod 鉴别联合类型

### 2. 发布-订阅总线 (`index.ts`)

- __核心功能__：`Bus.publish()` 和 `Bus.subscribe()` 方法

- __类型安全__：基于 Zod schema 的强类型事件发布和订阅

- __订阅选项__：

  - `subscribe(def, callback)`：订阅特定事件类型
  - `subscribeAll(callback)`：订阅所有事件（通配符 "*"）
  - `once(def, callback)`：一次性订阅

- __实例级隔离__：使用 `Instance.state()` 确保每个项目实例有独立的事件状态

- __生命周期管理__：自动处理实例销毁时的事件通知

### 3. 全局总线 (`global.ts`)

- 基于 Node.js `EventEmitter` 的简单全局事件发射器
- 允许跨不同项目实例的事件传播
- 主要事件：`"event"`，携带目录和负载信息

## 设计模式

1. __观察者模式__：经典的发布-订阅实现
2. __类型安全__：利用 TypeScript 和 Zod 确保运行时和编译时类型安全
3. __依赖注入__：通过 `Instance.state()` 实现状态管理
4. __单例模式__：每个实例有独立的总线状态

## 在 OpenCode 架构中的作用

- __内部通信__：组件间松耦合通信
- __状态通知__：实例生命周期事件（如实例销毁）
- __插件系统__：可能用于插件与核心系统之间的通信
- __调试和日志__：所有事件都通过 `Log.create({ service: "bus" })` 记录

## 关键代码特点

- 使用 `Map` 存储订阅关系，键为事件类型或 "*"
- 异步事件处理：`publish()` 返回 `Promise.all(pending)`
- 内存管理：提供取消订阅函数，防止内存泄漏
- 通配符支持：`"*"` 订阅所有事件

`src/bus` 模块是 OpenCode 内部的事件总线系统，提供类型安全、实例隔离的事件通信机制，是系统组件解耦的关键基础设施。



根据代码分析，bus 在 OpenCode 的 AI agent 系统中扮演&#x7740;__&#x6838;心事件通信总&#x7EBF;__&#x7684;角色。以下是具体的使用场景：

## 1. __会话生命周期管理__

- __会话状态变更__：当 AI agent 会话创建、更新、删除时，通过 `Bus.publish(Session.Event.Created/Updated/Deleted)` 通知整个系统
- __错误处理__：AI agent 执行过程中出现错误时，通过 `Bus.publish(Session.Event.Error)` 广播错误信息
- __状态跟踪__：会话空闲、活跃状态通过 `Bus.publish(Session.Event.Idle/Status)` 通知

## 2. __工具执行与文件操作__

- __文件编辑__：当 AI agent 使用编辑工具修改文件时，`Bus.publish(File.Event.Edited)` 触发文件系统监听和自动格式化
- __补丁应用__：`Bus.publish(FileWatcher.Event.Updated)` 通知文件变更，用于版本控制系统同步
- __工具执行结果__：命令执行后通过 `Bus.publish(Command.Event.Executed)` 广播执行结果

## 3. __消息流处理__

- __消息更新__：AI agent 生成的消息部分更新时，`Bus.publish(MessageV2.Event.PartUpdated)` 实现实时流式传输
- __消息完成__：完整消息通过 `Bus.publish(MessageV2.Event.Updated)` 通知存储和同步服务
- __消息删除__：回滚操作时通过 `Bus.publish(MessageV2.Event.Removed)` 清理消息

## 4. __插件系统集成__

- __插件钩子__：插件通过 `Bus.subscribeAll` 监听所有事件，实现自定义处理逻辑
- __工具变更__：MCP 服务器工具列表变化时，`Bus.publish(ToolsChanged)` 通知系统更新可用工具集

## 5. __实时协作与共享__

- __会话同步__：`Bus.subscribe(Session.Event.Updated)` 用于实时同步会话状态到共享存储
- __消息同步__：`Bus.subscribe(MessageV2.Event.Updated)` 确保多客户端消息一致性

## 6. __用户界面交互__

- __TUI 事件__：AI agent 通过 `Bus.publish(TuiEvent.PromptAppend/CommandExecute)` 与终端用户界面通信
- __权限询问__：当需要用户授权时，`Bus.publish(Permission.Event.Asked)` 触发权限询问对话框

## 7. __系统级集成__

- __文件监视__：`Bus.subscribe(FileWatcher.Event.Updated)` 实现文件变更时的自动响应
- __版本控制__：Git 分支更新通过 `Bus.publish(Project.Event.BranchUpdated)` 通知
- __安装更新__：软件更新可用时 `Bus.publish(Installation.Event.UpdateAvailable)` 通知用户

## 设计优势

1. __解耦__：AI agent 核心逻辑与副作用（存储、UI、插件）分离
2. __可扩展__：新功能只需订阅相关事件，无需修改 agent 核心代码
3. __实时性__：事件驱动架构确保状态变更立即传播到所有相关组件
4. __类型安全__：基于 Zod 的事件定义确保运行时类型正确性

## 典型工作流示例

```javascript
AI Agent 执行编辑工具
    → Bus.publish(File.Event.Edited)
    → 文件系统监听器触发自动格式化
    → 版本控制系统检测变更
    → UI 更新文件状态显示
    → 插件执行自定义处理
```
