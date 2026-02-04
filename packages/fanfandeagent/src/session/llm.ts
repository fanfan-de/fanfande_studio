import os from "os"
//import { Installation } from "@/installation"
import { Provider } from "../provider/provider"
import { Log } from "@/util/log"
import {
  streamText,
  Output,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type Tool,
  type ToolSet,
  extractReasoningMiddleware,
  tool,
  jsonSchema,
  type StopCondition,
  stepCountIs,
  type PrepareStepResult,
  type Experimental_DownloadFunction,
  zodSchema
} from "ai"
import { clone, mergeDeep, pipe } from "remeda"
//import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import { Agent } from "@/agent/agent"
import { Message } from './message'
//import { Plugin } from "@/plugin"
///import { SystemPrompt } from "./system"
import { Flag } from "@/flag/flag"
///import { PermissionNext } from "@/permission/next"
import { Auth } from "../auth"
import { text } from "stream/consumers"
import { z } from "zod"

export namespace LLM {
  const log = Log.create({ service: "llm" })

  export const OUTPUT_TOKEN_MAX = Flag.FanFande_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  export type asda={as:string}

  export const VERSION = "1.0.0"; // 随便加个值
  //`StreamInput`：用于流式处理 LLM 消息的输入参数类型定义（使用vercal sdk  需要的参数）
  export type StreamInput = {
    user: Message.User,
    sessionID: string,
    model: Provider.Model,
    agent: Agent.Info,
    system: string[],
    abort: AbortSignal,
    messages: ModelMessage[],
    small?: boolean,
    tools: Record<string, Tool>,
    retries?: number,
  }

  export type StreamOutput = StreamTextResult<ToolSet, never>

  export async function stream(input: StreamInput): Promise<StreamOutput> {
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("small", (input.small ?? false).toString())
      .tag("agent", input.agent.name)
      .tag("mode", input.agent.mode)
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID,
    })

    const [language, cfg, provider, auth] = await Promise.all([
      Provider.getLanguage(input.model),
      Config.get(),
      Provider.getProvider(input.model.providerID),
      Auth.get(input.model.providerID),
    ])

    const isCodex = provider.id === "openai" && auth?.type === "oauth"

    //系统提示词
    const system = []
    system.push(
      [
        // use agent prompt otherwise provider prompt
        // 1. 基础指令选择：如果 agent（智能体）有提示词则用它，否则根据模型获取提供商提示词
        // For Codex sessions, skip SystemPrompt.provider() since it's sent via options.instructions
        // 注意：如果是 Codex 模型会话，则跳过提供商提示词，因为它会通过 options.instructions 发送
        ///...(input.agent.prompt ? [input.agent.prompt] : isCodex ? [] : SystemPrompt.provider(input.model)),
        // any custom prompt passed into this call

        ...input.system,
        // any custom prompt from last user message
        // 3. 最后一项用户消息中可能携带的自定义系统指令（如果有的话）

        ...(input.user.system ? [input.user.system] : []),
      ]
        .filter((x) => x)
        .join("\n"),
    )

    const header = system[0]
    const original = clone(system)
    //await Plugin.trigger("experimental.chat.system.transform", { sessionID: input.sessionID }, { system })
    if (system.length === 0) {
      system.push(...original)
    }
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1)
      system.length = 0
      system.push(header, rest.join("\n"))
    }

    // const variant =
    //   !input.small && input.model.variants && input.user.variant ? input.model.variants[input.user.variant] : {}
    // const base = input.small
    //   ? ProviderTransform.smallOptions(input.model)
    //   : ProviderTransform.options({
    //       model: input.model,
    //       sessionID: input.sessionID,
    //       providerOptions: provider.options,
    //     })
    // const options: Record<string, any> = pipe(
    //   base,
    //   mergeDeep(input.model.options),
    //   mergeDeep(input.agent.options),
    //   mergeDeep(variant),
    // )
    // if (isCodex) {
    //   options.instructions = SystemPrompt.instructions()
    // }

    // const params = await Plugin.trigger(
    //   "chat.params",
    //   {
    //     sessionID: input.sessionID,
    //     agent: input.agent,
    //     model: input.model,
    //     provider,
    //     message: input.user,
    //   },
    //   {
    //     temperature: input.model.capabilities.temperature
    //       ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
    //       : undefined,
    //     topP: input.agent.topP ?? ProviderTransform.topP(input.model),
    //     topK: ProviderTransform.topK(input.model),
    //     options,
    //   },
    // )

    // const { headers } = await Plugin.trigger(
    //   "chat.headers",
    //   {
    //     sessionID: input.sessionID,
    //     agent: input.agent,
    //     model: input.model,
    //     provider,
    //     message: input.user,
    //   },
    //   {
    //     headers: {},
    //   },
    // )
    //创建一个AbortController,将之signal注入streamtext参数
    const controller = new AbortController();


    // const maxOutputTokens = isCodex
    //   ? undefined
    //   : ProviderTransform.maxOutputTokens(
    //       input.model.api.npm,
    //       params.options,
    //       input.model.limit.output,
    //       OUTPUT_TOKEN_MAX,
    //     )
    //**解析和过滤工具**：根据用户权限和代理设置，解析并过滤可用的工具集，获得参数tools
    const tools = await resolveTools(input)

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    // Add a dummy tool that is never called to satisfy this validation.
    // This is enabled for:
    // 1. Providers with "litellm" in their ID or API ID (auto-detected)
    // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
    const isLiteLLMProxy =
      provider.options?.["litellmProxy"] === true ||
      input.model.providerID.toLowerCase().includes("litellm") ||
      input.model.api.id.toLowerCase().includes("litellm")

    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description:
          "Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed",
        inputSchema: jsonSchema({ type: "object", properties: {} }),
        execute: async () => ({ output: "", title: "", metadata: {} }),
      })
    }
    //**执行流式生成**：调用 Vercel AI SDK，并挂载中间件（Middleware）处理推理内容和参数转换。
    return streamText({
      //------事件回调与网络 (Callbacks & Network)------
      onError(error) {
        l.error("stream error", {
          error,
        })
      },
      onFinish: () => { },
      onStepFinish: () => { },
      onAbort: () => { },
      //-------网络-----------------
      timeout: { totalMs: 60000, stepMs: 10000 },//超时配置
      abortSignal: controller.signal,//打断配置
      maxRetries: input.retries ?? 0,//重试次数
      //headers:       //Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
      //-----------输出配置--------------------
      output: Output.text(),//配置输出格式，默认就是text
      ///temperature: params.temperature,
      temperature: 1,
      ///topP: params.topP,
      ///topK: params.topK,
      //maxOutputTokens : maxOutputTokens ,
      presencePenalty: 0,//控制模型“谈论新话题”的积极,只要出现过，惩罚就是固定的。
      frequencyPenalty: 0,//频率惩罚,抑制模型在生成内容时反复使用相同的词汇或短语,出现次数越多，惩罚就越重（累积制）。
      ///providerOptions: ProviderTransform.providerOptions(input.model, params.options),//虽然 SDK（如 Vercel AI SDK）试图把所有模型
      //  （OpenAI, Claude, Gemini 等）的参数都统一化（比如 temperature, maxTokens），
      // 但每个供应商总有一些独家、非标准的功能。
      //providerOptions 就是让你传递这些供应商专属参数的“口袋”。
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),//可用工具

      ///stopSequences:, //string[],结束字符串
      ///seed:123124,//seed（随机种子）是一个用于控制随机性、实现结果可复现性的关键参数。
      includeRawChunks: false,//在流式传输（Streaming）过程中，能够直接获取来自大模型供应商（如 OpenAI、Anthropic 等）的“原始数据包”。
      //------------多步任务设置-----------------
      //stopWhen:()=>{return true}, //写入多步任务的打断逻辑
      //prepareStep:()=>{return {}},              //根据前一步的结果，临时改变下一步的操作方式。
      //------------实验-----------------------
      // async experimental_repairToolCall(failed) {
      //   const lower = failed.toolCall.toolName.toLowerCase()
      //   if (lower !== failed.toolCall.toolName && tools[lower]) {
      //     l.info("repairing tool call", {
      //       tool: failed.toolCall.toolName,
      //       repaired: lower,
      //     })
      //     return {
      //       ...failed.toolCall,
      //       toolName: lower,
      //     }
      //   }
      //   return {
      //     ...failed.toolCall,
      //     input: JSON.stringify({
      //       tool: failed.toolCall.toolName,
      //       error: failed.error.message,
      //     }),
      //     toolName: "invalid",
      //   }
      // },
      //async experimental_generateMessageId:()=>{return {}},//自定义生成每条消息唯一标识符（ID）的逻辑,streamtext似乎没有？
      //async experimental_transform(failed){}
      //experimental_telemetry
      //experimental_context(){},  //把开发者代码中的“系统变量”直接传递给工具（Tools）的执行函数，而不让 AI 模型看到这些信息。
      //   async experimental_download(downloads){// Vercel AI SDK 提供的一个实验性高级功能，它允许你完全接管和自定义 Prompt 中 URL 资源的下载行为。
      //       return Promise.all(
      //           downloads.map(async ({ url }) => 
      //             {
      //               // 1. 检查是否是我们的私有域名
      //               if (url.hostname === 'my-private-s3.com') {
      //                 // 2. 手动下载，并带上私有的 Token
      //                 const response = await fetch(url, {
      //                   headers: { 'Authorization': 'Bearer MY_S3_TOKEN' }
      //                 });
      //                 const buffer = await response.arrayBuffer();

      //                 // 3. 返回给 SDK 数据，SDK 会将其转化为数据流发给 AI
      //                 return {
      //                   data: new Uint8Array(buffer),
      //                   mediaType: response.headers.get('content-type') || 'image/jpeg'
      //                 };
      //               }

      //               // 4. 其他公网链接，返回 null 让模型自己处理
      //               return null;
      //             }
      //           )

      //       );
      // },



      tools,
      // headers: {
      //   ...(input.model.providerID.startsWith("opencode")
      //     ? {
      //         "x-opencode-project": Instance.project.id,
      //         "x-opencode-session": input.sessionID,
      //         "x-opencode-request": input.user.id,
      //         "x-opencode-client": Flag.OPENCODE_CLIENT,
      //       }
      //     : input.model.providerID !== "anthropic"
      //       ? {
      //           "User-Agent": `opencode/${Installation.VERSION}`,
      //         }
      //       : undefined),
      //   ...input.model.headers,
      //   ...headers,
      // },
      prompt: [
        {
          role: "system",
          content: "you are a helpful assistant",
        },

        ...input.messages,
      ],
      // model: wrapLanguageModel({
      //   model: language,
      //   middleware: [
      //     { 
      //       specificationVersion: 'v3', 
      //       async transformParams(args) {
      //         if (args.type === "stream") {
      //           args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
      //         }
      //         return args.params
      //       },
      //     },
      //     extractReasoningMiddleware({ tagName: "think", startWithReasoning: false }),
      //   ],
      // }),
      model: language,
      experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
    })
  }

  async function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "user">) {
    //const disabled = PermissionNext.disabled(Object.keys(input.tools), input.agent.permission)
    for (const tool of Object.keys(input.tools)) {
      if (input.user.tools?.[tool] === false/* || disabled.has(tool)*/) {
        delete input.tools[tool]
      }
    }
    return input.tools
  }

  // Check if messages contain any tool-call content
  // Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
  export function hasToolCalls(messages: ModelMessage[]): boolean {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content) {
        if (part.type === "tool-call" || part.type === "tool-result") return true
      }
    }
    return false
  }
}
