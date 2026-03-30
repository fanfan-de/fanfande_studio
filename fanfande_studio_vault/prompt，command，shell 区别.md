# prompt、command、shell 三个入口的区别

## 总览对比

| 入口          | 路由                                                                      | 用途                       | 输入                                                  | 处理流程                                                                                                                  | 输出                                        |
| ----------- | ----------------------------------------------------------------------- | ------------------------ | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **prompt**  | `POST /:sessionID/message`（同步流式）<br>`POST /:sessionID/prompt_async`（异步） | 处理自然语言用户提示，启动 AI 会话循环    | `parts`（文本、文件、代理等）、`agent`、`model`、`format` 等       | 1. 创建用户消息<br>2. 进入 `SessionPrompt.loop`<br>3. AI 调用工具、压缩、生成回复                                                         | AI 助理消息（含工具调用结果）                          |
| **command** | `POST /:sessionID/command`                                              | 执行预定义命令模板，可参数化，支持子任务委派   | `command`（命令名）、`arguments`（参数字符串）、`agent`、`model` 等 | 1. 解析参数，替换模板占位符（`$1`、`$ARGUMENTS`）<br>2. 执行内联 shell 命令（`` !`...` ``）<br>3. 根据命令配置决定是否转为子任务<br>4. 调用 `prompt` 进入 AI 循环 | 同 prompt，但会发布 `Command.Event.Executed` 事件 |
| **shell**   | `POST /:sessionID/shell`                                                | 直接执行原始 shell 命令，无需 AI 推理 | `command`（shell 命令字符串）、`agent`、`model`              | 1. 创建虚拟用户消息<br>2. 创建 tool 类型 part（工具为 `"bash"`）<br>3. 直接 spawn 子进程执行命令，实时流式输出<br>4. 不进入 AI 循环                         | 工具执行结果（输出文本），无 AI 回复                      |

## 关键差异点

- **AI 参与度**：`prompt` 和 `command` 最终都会进入 AI 循环，而 `shell` 完全绕过 AI，仅记录工具执行结果。
- **输入形式**：`prompt` 接受自由文本/文件；`command` 依赖预定义模板和参数替换；`shell` 直接接受原生 shell 命令字符串。
- **子任务支持**：`command` 可根据配置将任务委派给子代理（subtask 模式），`prompt` 和 `shell` 无此机制。
- **内联命令**：`command` 支持在模板中使用 `` !`...` `` 语法预先执行 shell 片段并将结果注入提示。

## 适用场景

- **prompt**：通用对话、代码解释、自由式任务。
- **command**：标准化操作（如"运行测试"、"部署到生产"），需参数化且可能涉及多步骤 AI 协调。
- **shell**：直接执行系统命令（如 `git status`、`npm install`），无需 AI 解释或干预。

## 代码位置

- **prompt 函数**：`src/session/prompt.ts:161`
- **command 函数**：`src/session/prompt.ts:1781`
- **shell 函数**：`src/session/prompt.ts:1509`
- **路由定义**：`src/server/routes/session.ts:782, 854, 891`