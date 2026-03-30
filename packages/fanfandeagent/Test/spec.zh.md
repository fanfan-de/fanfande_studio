# Test 目录规范（中文）

## 目的
该目录用于存放 `fanfandeagent` 包的测试资产：单元测试、集成测试、端到端测试、夹具（fixtures）和仅测试使用的辅助代码。

## 测试规则
- 涉及 LLM 行为验证的集成测试和端到端测试必须使用真实 LLM 调用
- 不允许使用 `mock`、`stub`、`fake` 或任何模拟模型输出进行 LLM 验证
- 若测试依赖模型能力，必须使用真实凭据与真实 provider endpoint
- 涉及目录进入、会话创建、prompt 执行、结果恢复的测试应放在本目录
- 允许存在测试辅助工具，但不得替代真实模型调用完成 LLM 覆盖

## API 层测试
- `Test/server.api.test.ts` 是 Hono 服务层的确定性 API smoke test
- 该文件验证传输层行为（健康检查、请求体校验、统一 404 包络）
- 该文件包含 `POST /api/sessions/:id/messages/stream` 的参数校验与缺失会话校验
- 它不验证 LLM 行为，因此不要求真实模型调用

## API 真实 Prompt E2E
- `Test/server.prompt.e2e.test.ts` 用于验证 API 入口下的真实 prompt 流程
- 流程：通过 API 创建会话 -> 调用 `/api/sessions/:id/messages/stream` 发送消息 -> 断言 SSE 包含 `started` 和 `done`
- 该测试依赖真实模型凭据（`DEEPSEEK_API_KEY`）

## 测试指令
- 运行 Server API smoke tests：`bun run test:server`
- 运行 Server Prompt E2E：`bun run test:server-prompt-e2e`
- 直接运行：`bun test Test/server.api.test.ts`
- 现有 prompt e2e 测试：`bun run test:prompt`

## 期望
- 尽量保持测试聚焦且可重复（deterministic）
- 优先断言可观察行为，而不是内部实现细节
- 运行后清理测试过程中创建的临时文件和目录
