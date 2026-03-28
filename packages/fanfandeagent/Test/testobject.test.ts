import * as Message from "#session/message.ts"
import { stream, type StreamInput } from '#session/llm.ts'; // 替换为实际路径
import { PromptInput } from "#session/prompt.ts"
import * as Provider from "#provider/provider.ts";
import * as Agent from "#agent/agent.ts"
import z from 'zod';
import * as project from "#project/project.ts"
import type { Prompt } from "ai";

//测试用user message 
export const user: Message.User = {
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

//Assistant message
export const assistant: Message.Assistant = {
    role: "assistant",
    created: Date.now(),
    //completed: z.number().optional(),
    // error: z
    //     .discriminatedUnion("name", [
    //         AuthError.Schema,
    //         NamedError.Unknown.Schema,
    //         OutputLengthError.Schema,
    //         AbortedError.Schema,
    //         APIError.Schema,
    //     ])
    //     .optional(),
    parentID: "",
    modelID: "deepseek",
    providerID: "deepseek-reasoner",

    agent: "plan",
    path: {
        cwd: "",
        root: "",
    },
    //summary: z.boolean().optional(),
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
    id: "message-qwew",
    sessionID: "session-101",
    mode: ""
}

// 构造模拟输入StreamInput的工厂函数
export const createMockInput = (overrides: Partial<StreamInput> = {}): StreamInput => {
    return {
        user: user,
        sessionID: 'session-101',
        model: Provider.testDeepSeekModel!,
        agent: Agent.planAgent,
        system: ['initial-system-msg'],
        abort: new AbortController().signal,
        messages: [
            { role: 'user', content: '今天温度多少度' }
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

//part
export const reasoningPart: Message.ReasoningPart = {
    id: "123",
    sessionid: "sessions-123",
    messageid: "messages-123",
    type: "reasoning",
    text: "ceshiwenben1",
    time: {
        start: Date.now()
    }
}


export const CreatePromptInput = (sessionid: string, messageID: string): PromptInput => {

    return {
        sessionID: sessionid,
        parts: [{
            type: "text",
            text: "今天天气怎么样",
            time: {
                start: Date.now()
            },
        }]
    }
}