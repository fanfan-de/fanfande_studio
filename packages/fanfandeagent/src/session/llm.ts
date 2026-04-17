import os from "os"
//import { Installation } from "@/installation"
import * as  Provider from "#provider/provider.ts"
import * as  Log from "#util/log.ts"
import {
  streamText,
  Output,
  wrapLanguageModel,
  type ModelMessage,
  type StreamTextResult,
  type ToolSet,
  extractReasoningMiddleware,
  type StopCondition,
  stepCountIs,
  type PrepareStepResult,
  type Experimental_DownloadFunction,
  zodSchema
} from "ai"
import { clone, mergeDeep, pipe } from "remeda"
//import { ProviderTransform } from "@/provider/transform"
import * as  Config from "#config/config.ts"
import * as  Agent from "#agent/agent.ts"
import * as  Message from '#session/message.ts'
//import { Plugin } from "@/plugin"
///import { SystemPrompt } from "./system"
import { Flag } from "@/flag/flag"
///import { PermissionNext } from "@/permission/next"
//import { Auth } from "../auth/auth"
import { text } from "stream/consumers"
import { z } from "zod"
import * as db from "#database/Sqlite.ts"



const log = Log.create({ service: "llm" })
const DEFAULT_LLM_TOTAL_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_LLM_STEP_TIMEOUT_MS = 10 * 60 * 1000

//export const OUTPUT_TOKEN_MAX = Flag.FanFande_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

//export const VERSION = "1.0.0"; // 版本号
// `StreamInput` 定义了发起 LLM 流式请求时需要的上下文参数。

export type StreamInput = {
  user: Message.User,
  sessionID: string,
  messageID: string,
  model: Provider.Model,
  agent: Agent.AgentInfo,
  system: string[],
  abort: AbortSignal,
  messages: ModelMessage[],
  small?: boolean,
  tools?: ToolSet,
  retries?: number,
}

export type StreamOutput = StreamTextResult<ToolSet, never>

function summarizeModelMessages(messages: ModelMessage[]) {
  let userMessages = 0
  let textParts = 0
  let imageParts = 0
  let fileParts = 0

  for (const message of messages) {
    if (message.role === "user") {
      userMessages += 1
    }

    const content = Array.isArray(message.content) ? message.content : []
    for (const part of content) {
      if (!part || typeof part !== "object" || !("type" in part)) continue
      const type = (part as { type?: unknown }).type
      if (type === "text") textParts += 1
      if (type === "image") imageParts += 1
      if (type === "file") fileParts += 1
    }
  }

  return {
    userMessages,
    textParts,
    imageParts,
    fileParts,
  }
}

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
    messageSummary: summarizeModelMessages(input.messages),
    capabilities: {
      attachment: input.model.capabilities.attachment,
      imageInput: input.model.capabilities.input.image,
      pdfInput: input.model.capabilities.input.pdf,
      toolcall: input.model.capabilities.toolcall,
    },
  })


  // 组装 system prompt
  const system = []
  system.push(
    [
      ...input.system,
    ]
  )

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
  // 将 AbortController.signal 传给 streamText，用于中断请求。
  


  // const maxOutputTokens = isCodex
  //   ? undefined
  //   : ProviderTransform.maxOutputTokens(
  //       input.model.api.npm,
  //       params.options,
  //       input.model.limit.output,
  //       OUTPUT_TOKEN_MAX,
  //     )
  // 准备工具集，并解析最终使用的语言模型。
  const tools: ToolSet = input.tools ?? {}
  const model = await resolveLanguageModel(input.model)
  const totalTimeoutMs =
    Flag.FanFande_EXPERIMENTAL_LLM_TOTAL_TIMEOUT_MS ?? DEFAULT_LLM_TOTAL_TIMEOUT_MS
  const configuredStepTimeoutMs =
    Flag.FanFande_EXPERIMENTAL_LLM_STEP_TIMEOUT_MS ?? DEFAULT_LLM_STEP_TIMEOUT_MS
  const stepTimeoutMs = Math.min(configuredStepTimeoutMs, totalTimeoutMs)
  l.info("language model resolved", {
    messageSummary: summarizeModelMessages(input.messages),
    capabilities: {
      attachment: input.model.capabilities.attachment,
      imageInput: input.model.capabilities.input.image,
      pdfInput: input.model.capabilities.input.pdf,
      toolcall: input.model.capabilities.toolcall,
    },
    timeouts: {
      totalMs: totalTimeoutMs,
      stepMs: stepTimeoutMs,
    },
  })

  // LiteLLM and some Anthropic proxies require the tools parameter to be present
  // when message history contains tool calls, even if no tools are being used.
  // Add a dummy tool that is never called to satisfy this validation.
  // This is enabled for:
  // 1. Providers with "litellm" in their ID or API ID (auto-detected)
  // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
  // const isLiteLLMProxy =
  //   provider.options?.["litellmProxy"] === true ||
  //   input.model.providerID.toLowerCase().includes("litellm") ||
  //   input.model.api.id.toLowerCase().includes("litellm")

  // if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
  //   tools["_noop"] = tool({
  //     description:
  //       "Placeholder for LiteLLM/Anthropic proxy compatibility - required when message history contains tool calls but no active tools are needed",
  //     inputSchema: jsonSchema({ type: "object", properties: {} }),
  //     execute: async () => ({ output: "", title: "", metadata: {} }),
  //   })
  // }
  // 使用 Vercel AI SDK 发起流式请求；如需推理抽取，可在这里接入 middleware。
  return streamText({
    // ------ 回调与网络配置（Callbacks & Network）------
    onError(error) {
      //console.error("流式请求回调异常：AI SDK onError 捕获到错误", error)
      //console.log(error)
    },
    onFinish: () => {
      //console.log("流式请求结束：streamText.onFinish")
    },
    onStepFinish: () => {
      //console.log("流式步骤结束：streamText.onStepFinish")
    },
    onAbort: () => {
      //console.log("流式请求中止：streamText.onAbort")
    },
    // ------- 基础生成参数 ----------------
    timeout: { totalMs: totalTimeoutMs, stepMs: stepTimeoutMs },// 总超时与单步超时
    abortSignal: input.abort,// 取消信号
    maxRetries: input.retries ?? 0,// 最大重试次数
    //headers:       //Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
    //----------- 输出与采样参数 --------------------
    output: Output.text(),// 输出纯文本
    ///temperature: params.temperature,
    temperature: 1,
    ///topP: params.topP,
    ///topK: params.topK,
    //maxOutputTokens : maxOutputTokens ,
    presencePenalty: 0,// 降低重复提及已出现主题的倾向
    frequencyPenalty: 0,// 降低重复使用相同词语或短语的倾向
    ///providerOptions: ProviderTransform.providerOptions(input.model, params.options),// 如需透传 provider 专有参数，可在这里扩展
    // OpenAI、Claude、Gemini 等模型支持的 providerOptions 并不完全一致。
    // 如果后续需要细粒度控制，可以在这里按 provider 组装额外参数。
    // providerOptions 会原样透传给底层 SDK，用于覆盖各家模型的专有配置。
    activeTools: Object.keys(tools).filter((x) => x !== "invalid"),// 过滤掉兜底的 invalid 工具

    ///stopSequences:, // string[]，自定义停止序列
    ///seed:123124,// 固定随机种子，便于结果复现
    includeRawChunks: false,// 不返回底层原始分块，减少流式噪声与兼容性问题
    //------------ 实验能力扩展 ----------------
    stopWhen: stepCountIs(1),
    //prepareStep:()=>{return {}},              // prepareStep 可在每一步执行前动态调整参数
    //------------ 工具调用修复 ----------------------
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
    //async experimental_generateMessageId:()=>{return {}},// 自定义消息 ID 生成器；streamText 默认会自动生成 ID
    //async experimental_transform(failed){}
    //experimental_telemetry
    //experimental_context(){},  // 可在这里为工具调用或多模态下载补充上下文。
    //   async experimental_download(downloads){// Vercel AI SDK 支持拦截下载请求，把 Prompt 中的 URL 转成模型可消费的二进制内容
    //       return Promise.all(
    //           downloads.map(async ({ url }) => 
    //             {
    //               // 1. 命中私有资源域名时，走自定义下载逻辑
    //               if (url.hostname === 'my-private-s3.com') {
    //                 // 2. 带鉴权 Token 拉取私有对象
    //                 const response = await fetch(url, {
    //                   headers: { 'Authorization': 'Bearer MY_S3_TOKEN' }
    //                 });
    //                 const buffer = await response.arrayBuffer();

    //                 // 3. 按 SDK 约定返回二进制数据和媒体类型，供模型消费
    //                 return {
    //                   data: new Uint8Array(buffer),
    //                   mediaType: response.headers.get('content-type') || 'image/jpeg'
    //                 };
    //               }

    //               // 4. 不处理的地址返回 null，交还默认下载流程
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
    system:input.system.join(""),
    prompt: [
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
    model,
    //experimental_telemetry: { isEnabled: cfg.experimental?.openTelemetry },
  })
}

async function resolveLanguageModel(model: Provider.Model) {
  return Provider.getLanguage(model)
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


