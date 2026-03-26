
import { describe, it, expect, mock } from 'bun:test';
import { stream, type StreamInput } from '#session/llm.ts'; // 替换为实际路径
import * as Provider from "#provider/provider.ts";
import { simulateReadableStream } from 'ai'; // 模拟流工具
import * as Message from "#session/message.ts"
import * as Agent from "#agent/agent.ts"
import z from 'zod';

const color = {
    gray: (str: string) => `\x1b[2m${str}\x1b[0m`,
    cyan: (str: string) => `\x1b[36m${str}\x1b[0m`,
    yellow: (str: string) => `\x1b[33m${str}\x1b[0m`,
    green: (str: string) => `\x1b[32m${str}\x1b[0m`,
};




describe('LLM Stream Function Unit Tests', () => {
    // 打印 Key 的长度来确认是否读取成功（不要打印明文，安全起见）
    console.log('检查 API KEY 是否存在:', process.env.DEEPSEEK_API_KEY ? `已存在 (长度: ${process.env.DEEPSEEK_API_KEY.length})` : '未读取到 KEY');

    const user: Message.User = {
        id: "message-qwe",
        sessionID: "session-101",
        role: "user",
        created: Date.now(),
        // summary: z
        //     .object({
        //         title: z.string().optional(),
        //         body: z.string().optional(),
        //         diffs: Snapshot.FileDiff.array(),
        //     })
        //     .optional(),
        agent: "plan",
        model: {
            providerID: "deepseek",
            modelID: "deepseek-reasoner",
        },
        system: "你是一个助手",
        //tools: z.record(z.string(), z.boolean()).optional(),
        //variant: z.string().optional(),
    }

    // 构造模拟输入的工厂函数
    const createMockInput = (overrides: Partial<StreamInput> = {}): StreamInput => {
        return {
            user: user,
            sessionID: 'session-101',
            model: Provider.testDeepSeekModel!,
            agent: Agent.planAgent,
            system: ['initial-system-msg'],
            abort: new AbortController().signal,
            messages: [
                { role: 'user', content: 'Hello' }
            ],
            tools: {
                'get_weather': {
                    description: 'Get weather',
                    inputSchema: z.object({}),
                    execute: async () => ({ temperature: 25 })
                }
            },
            ...overrides,
        };
    };

    it('应该正确拼接系统提示词并捕获异常', async () => {
        const input = createMockInput();

        console.log('--- 测试开始 ---');

        try {
            // 1. 尝试调用 stream 函数
            const result = await stream(input);
            console.log('stream 函数成功返回 result 对象');

            if (!result || !result.textStream) {
                throw new Error("stream 函数返回的对象中缺少 textStream");
            }

            let fullText = '';

            // 在开始流之前打印一个提示
            process.stdout.write('\n[AI 正在响应]: ');

            // 2. 尝试迭代流
            try {
                for await (const delta of result.fullStream) {
                    switch (delta.type) {
                        case 'reasoning-delta': // DeepSeek 的推理过程
                            process.stdout.write(delta.text);
                            break;

                        case 'text-delta': // 普通文本内容
                            process.stdout.write(delta.text);
                            break;

                        case 'tool-call': // 准备调用工具
                            process.stdout.write(
                                `\n[工具调用]: ${delta.toolName}(${JSON.stringify(delta.input)})\n`
                            );
                            break;

                        case 'tool-result': // 工具执行结果
                            process.stdout.write(
                                `[工具返回]: ${JSON.stringify(delta.output)}\n`
                            );
                            break;

                        case 'error': // 错误信息
                            console.error(`\n[31m[错误]: ${delta.error}\n`);
                            break;

                        case 'finish': // 完成后的统计
                            process.stdout.write(`\n\n>>> 流结束。原因: ${delta.finishReason}\n`);

                            break;
                    }
                }
            }

            catch (streamError) {
                console.error('流读取过程中发生错误:', streamError);
                throw streamError;
            }

            // 流结束后，手动打印一个换行，保持控制台整洁
            process.stdout.write('\n\n');





        }
        catch (error) {
            console.error('--- 捕获到详细错误 ---');
            console.dir(error, { depth: null }); // 打印完整对象
            if (error instanceof Error) {
                console.error('消息:', error.message);
                console.error('堆栈:', error.stack);
                // 如果是 AI SDK 的错误，通常有这几个字段
                console.error('原因 (Cause):', (error as any).cause);
            }
            throw error;
        }
        finally {
            console.log('--- 测试结束 ---');
        }



        // it('应该根据 input.user.tools 过滤掉被禁用的工具', async () => {
        //     const input = createMockInput({
        //         tools: {
        //             toolA: { description: 'A', parameters: {} as any },
        //             toolB: { description: 'B', parameters: {} as any },
        //         },
        //         user: {
        //             tools: { toolA: false } // 禁用 toolA
        //         } as any
        //     });

        //     const result = await stream(input);

        //     // 验证 resolveTools 的结果
        //     // 我们可以通过检查流结果中关联的工具有哪些
        //     // 或者在 resolveTools 执行后设置断点/日志
        // });

        // it('当发生错误时应该调用 onError 回调', async () => {
        //     // 模拟模型抛出错误
        //     vi.mocked(Provider.deepseekreasoningmodel.doStream).mockRejectedValueOnce(new Error('API Error'));

        //     const input = createMockInput();

        //     // 验证 stream 函数是否能处理错误（根据你的 onError 逻辑）
        //     await expect(stream(input)).rejects.toThrow('API Error');
        // });

        // it('应该能够完整读取流内容', async () => {
        //     const input = createMockInput();
        //     const result = await stream(input);

        //     let fullText = '';
        //     for await (const delta of result.textStream) {
        //         fullText += delta;
        //     }

        //     expect(fullText).toBe('Hello world!');
        // });

        // it('测试 AbortSignal 是否能正常传递', async () => {
        //     const controller = new AbortController();
        //     const input = createMockInput({ abort: controller.signal });

        //     // 模拟立即中断
        //     controller.abort();

        //     const result = await stream(input);

        //     // 在 AI SDK 中，如果 signal 已中断，读取流通常会抛出错误
        //     await expect(async () => {
        //         for await (const chunk of result.textStream) { }
        //     }).rejects.toThrow();
        // });

    })
})
