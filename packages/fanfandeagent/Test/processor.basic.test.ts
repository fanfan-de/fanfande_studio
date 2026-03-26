import { test, expect } from "bun:test"
import * as Processor from "#session/processor.ts"
import * as Message from "#session/message.ts"


test("create returns processor with correct message getter", () => {
  // 准备阶段：构造一个模拟的 AI 助手消息对象 (Assistant Message)
  // 该对象包含了消息的所有元数据，如：ID、模型 ID、消耗统计、路径信息等。
  const mockAssistant: Message.Assistant = {
    id: "msg-123",
    sessionID: "sess-456",
    role: "assistant",
    created: Date.now(),
    parentID: "parent-789",
    modelID: "deepseek-reasoner", // 指定使用的模型
    providerID: "deepseek",
    mode: "default",
    agent: "plan",
    path: {
      cwd: "/test",
      root: "/",
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: {
        read: 0,
        write: 0,
      },
    },
  }

  // 执行阶段：使用工厂方法创建一个处理器实例
  const processor = Processor.create({
    Assistant: mockAssistant,
    abort: new AbortController().signal, // 模拟中止信号
  })

  // 断言阶段 1：验证 processor.message 属性是否正确引用了传入的消息对象
  expect(processor.message).toBe(mockAssistant)

  // 断言阶段 2：边界测试
  // 当处理器刚刚创建且没有任何 tool_call 时，通过不存在的 ID 查询 tool part 应该返回 undefined
  expect(processor.partFromToolCall("nonexistent")).toBeUndefined()

})

/**
 * 测试意图：验证工具调用（Tool Call）处理后的状态变更。
 * 
 * 预期行为：
 * 当处理器通过流式输出或直接处理产生了一个带有工具调用的消息段（Part）后，
 * 应该能够通过特定的 Tool Call ID 检索到对应的消息段。
 * 
 * 注意：由于该测试涉及到 Processor 的异步处理逻辑或流式逻辑，
 * 这里预留了占位，说明需要模拟 process 调用后的副作用。
 */
test("partFromToolCall returns tool part after processing", () => {
  // 待实现逻辑：
  // 1. 调用 processor.process() 模拟产生包含工具调用的响应。
  // 2. 验证 processor.partFromToolCall(callID) 能返回正确的 ToolCallPart。
})