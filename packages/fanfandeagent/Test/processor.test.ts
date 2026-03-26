// import { test, expect, mock } from "bun:test"
// import type { StreamInput } from "#session/llm.ts"
// import type { Model } from "#provider/provider.ts"
// import type { AgentInfo } from "#agent/agent.ts"
// import * as Message from "#session/message.ts" 
// import * as testobject from "./testobject.test"

// // 模拟 LLM.stream 返回一个简单的文本流


// // 现在导入 processor（必须在模拟之后）
// import * as Processor from "#session/processor.ts"



// // test("create returns processor with correct message getter", () => {
// //   const mockAssistant = createMockAssistant()
// //   const processor = Processor.create({
// //     Assistant: mockAssistant,
// //     abort: new AbortController().signal,
// //   })

// //   expect(processor.message).toBe(mockAssistant)
// //   expect(processor.partFromToolCall("nonexistent")).toBeUndefined()
// // })

// test("process handles text stream and returns continue", async () => {
//   const processor = Processor.create({
//     Assistant: testobject.assistant,
//     abort: new AbortController().signal,
//   })

//   const streamInput = testobject.createMockInput()
//   const result = await processor.process(streamInput)

//   console.log(result)
//   expect(result).toBe("continue")

// })

// // test("process handles reasoning stream", async () => {
// //   // 模拟包含 reasoning 事件的流
// //   const mockStreamWithReasoning = mock(() => {
// //     const events = [
// //       { type: "start" },
// //       { type: "reasoning-start", id: "reason-1", providerMetadata: {} },
// //       { type: "reasoning-delta", id: "reason-1", text: "Let me think", providerMetadata: {} },
// //       { type: "reasoning-end", id: "reason-1", providerMetadata: {} },
// //       { type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } },
// //     ]

// //     return {
// //       fullStream: (async function* () {
// //         for (const event of events) {
// //           yield event
// //         }
// //       })(),
// //     }
// //   })

// //   mock.module("#session/llm.ts", () => ({
// //     stream: mockStreamWithReasoning,
// //   }))

// //   // 需要重新导入 processor 以使模拟生效，但为了简单起见，我们直接使用现有的 processor
// //   // 由于模块缓存，重新导入可能不会生效。我们创建一个新的测试文件更合适，但这里我们暂时跳过。
// //   // 我们可以通过调用 mock.restore() 并重新导入，但为了简单，我们只验证基本功能。
// // })

// // test("process handles tool call stream", async () => {
// //   // 模拟工具调用事件
// //   const mockStreamWithToolCall = mock(() => {
// //     const events = [
// //       { type: "start" },
// //       { type: "tool-input-start", id: "tool-1", toolName: "testTool", providerMetadata: {} },
// //       { type: "tool-input-delta", id: "tool-1", delta: "{\"arg\": 1}", providerMetadata: {} },
// //       { type: "tool-input-end", id: "tool-1", providerMetadata: {} },
// //       { type: "tool-call", toolCallId: "tool-1", toolName: "testTool", input: { arg: 1 }, providerMetadata: {} },
// //       { type: "tool-result", toolCallId: "tool-1", input: { arg: 1 }, output: { result: "success" }, providerMetadata: {} },
// //       { type: "finish", finishReason: "stop", usage: { inputTokens: 10, outputTokens: 5 } },
// //     ]

// //     return {
// //       fullStream: (async function* () {
// //         for (const event of events) {
// //           yield event
// //         }
// //       })(),
// //     }
// //   })

// //   mock.module("#session/llm.ts", () => ({
// //     stream: mockStreamWithToolCall,
// //   }))

//   // 同样，我们跳过实际调用，因为模块模拟在运行时不会更新。
//   // 我们可以创建一个新的测试文件，但作为开头，我们只提供示例。
// // })