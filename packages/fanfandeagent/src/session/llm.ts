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

//export const OUTPUT_TOKEN_MAX = Flag.FanFande_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

//export const VERSION = "1.0.0"; // 闅忎究鍔犱釜鍊?
//`StreamInput`锛氱敤浜庢祦寮忓鐞?LLM 娑堟伅鐨勮緭鍏ュ弬鏁扮被鍨嬪畾涔夛紙浣跨敤vercal sdk  闇€瑕佺殑鍙傛暟锛?

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

  //const isCodex = provider.id === "openai" && auth?.type === "oauth"

  //绯荤粺鎻愮ず璇?
  const system = []
  system.push(
    [
      // use agent prompt otherwise provider prompt
      // 1. 鍩虹鎸囦护閫夋嫨锛氬鏋?agent锛堟櫤鑳戒綋锛夋湁鎻愮ず璇嶅垯鐢ㄥ畠锛屽惁鍒欐牴鎹ā鍨嬭幏鍙栨彁渚涘晢鎻愮ず璇?
      // For Codex sessions, skip SystemPrompt.provider() since it's sent via options.instructions
      // 娉ㄦ剰锛氬鏋滄槸 Codex 妯″瀷浼氳瘽锛屽垯璺宠繃鎻愪緵鍟嗘彁绀鸿瘝锛屽洜涓哄畠浼氶€氳繃 options.instructions 鍙戦€?
      ///...(input.agent.prompt ? [input.agent.prompt] : isCodex ? [] : SystemPrompt.provider(input.model)),
      // any custom prompt passed into this call

      ...input.system,
      // any custom prompt from last user message
      // 3. 鏈€鍚庝竴椤圭敤鎴锋秷鎭腑鍙兘鎼哄甫鐨勮嚜瀹氫箟绯荤粺鎸囦护锛堝鏋滄湁鐨勮瘽锛?

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
  //鍒涘缓涓€涓狝bortController,灏嗕箣signal娉ㄥ叆streamtext鍙傛暟
  


  // const maxOutputTokens = isCodex
  //   ? undefined
  //   : ProviderTransform.maxOutputTokens(
  //       input.model.api.npm,
  //       params.options,
  //       input.model.limit.output,
  //       OUTPUT_TOKEN_MAX,
  //     )
  //**瑙ｆ瀽鍜岃繃婊ゅ伐鍏?*锛氭牴鎹敤鎴锋潈闄愬拰浠ｇ悊璁剧疆锛岃В鏋愬苟杩囨护鍙敤鐨勫伐鍏烽泦锛岃幏寰楀弬鏁皌ools
  const tools: ToolSet = input.tools ?? {}
  const model = await resolveLanguageModel(input.model)

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
  //**鎵ц娴佸紡鐢熸垚**锛氳皟鐢?Vercel AI SDK锛屽苟鎸傝浇涓棿浠讹紙Middleware锛夊鐞嗘帹鐞嗗唴瀹瑰拰鍙傛暟杞崲銆?
  return streamText({
    //------浜嬩欢鍥炶皟涓庣綉缁?(Callbacks & Network)------
    onError(error) {
      console.error("浜嬩欢鍥炶皟涓庣綉缁淒EBUG - AI SDK 鍘熷閿欒璇︽儏:", error);
      console.log(error)
    },
    onFinish: () => {
      console.log("浜嬩欢鍥炶皟涓庣綉缁渟treamTextfinish")
    },
    onStepFinish: () => {
      console.log("浜嬩欢鍥炶皟涓庣綉缁渟treamTextonStepFinish")
    },
    onAbort: () => {
      console.log("浜嬩欢鍥炶皟涓庣綉缁渟treamTextonAbort")
    },
    //-------缃戠粶-----------------
    timeout: { totalMs: 60000, stepMs: 10000 },//瓒呮椂閰嶇疆
    abortSignal: input.abort,//鎵撴柇閰嶇疆
    maxRetries: input.retries ?? 0,//閲嶈瘯娆℃暟
    //headers:       //Additional HTTP headers to be sent with the request. Only applicable for HTTP-based providers.
    //-----------杈撳嚭閰嶇疆--------------------
    output: Output.text(),//閰嶇疆杈撳嚭鏍煎紡锛岄粯璁ゅ氨鏄痶ext
    ///temperature: params.temperature,
    temperature: 1,
    ///topP: params.topP,
    ///topK: params.topK,
    //maxOutputTokens : maxOutputTokens ,
    presencePenalty: 0,//鎺у埗妯″瀷鈥滆皥璁烘柊璇濋鈥濈殑绉瀬,鍙鍑虹幇杩囷紝鎯╃綒灏辨槸鍥哄畾鐨勩€?
    frequencyPenalty: 0,//棰戠巼鎯╃綒,鎶戝埗妯″瀷鍦ㄧ敓鎴愬唴瀹规椂鍙嶅浣跨敤鐩稿悓鐨勮瘝姹囨垨鐭,鍑虹幇娆℃暟瓒婂锛屾儵缃氬氨瓒婇噸锛堢疮绉埗锛夈€?
    ///providerOptions: ProviderTransform.providerOptions(input.model, params.options),//铏界劧 SDK锛堝 Vercel AI SDK锛夎瘯鍥炬妸鎵€鏈夋ā鍨?
    //  锛圤penAI, Claude, Gemini 绛夛級鐨勫弬鏁伴兘缁熶竴鍖栵紙姣斿 temperature, maxTokens锛夛紝
    // 浣嗘瘡涓緵搴斿晢鎬绘湁涓€浜涚嫭瀹躲€侀潪鏍囧噯鐨勫姛鑳姐€?
    //providerOptions 灏辨槸璁╀綘浼犻€掕繖浜涗緵搴斿晢涓撳睘鍙傛暟鐨勨€滃彛琚嬧€濄€?
    activeTools: Object.keys(tools).filter((x) => x !== "invalid"),//鍙敤宸ュ叿

    ///stopSequences:, //string[],缁撴潫瀛楃涓?
    ///seed:123124,//seed锛堥殢鏈虹瀛愶級鏄竴涓敤浜庢帶鍒堕殢鏈烘€с€佸疄鐜扮粨鏋滃彲澶嶇幇鎬х殑鍏抽敭鍙傛暟銆?
    includeRawChunks: false,//鍦ㄦ祦寮忎紶杈擄紙Streaming锛夎繃绋嬩腑锛岃兘澶熺洿鎺ヨ幏鍙栨潵鑷ぇ妯″瀷渚涘簲鍟嗭紙濡?OpenAI銆丄nthropic 绛夛級鐨勨€滃師濮嬫暟鎹寘鈥濄€?
    //------------澶氭浠诲姟璁剧疆-----------------
    //stopWhen:()=>{return true}, //鍐欏叆澶氭浠诲姟鐨勬墦鏂€昏緫
    //prepareStep:()=>{return {}},              //鏍规嵁鍓嶄竴姝ョ殑缁撴灉锛屼复鏃舵敼鍙樹笅涓€姝ョ殑鎿嶄綔鏂瑰紡銆?
    //------------瀹為獙-----------------------
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
    //async experimental_generateMessageId:()=>{return {}},//鑷畾涔夌敓鎴愭瘡鏉℃秷鎭敮涓€鏍囪瘑绗︼紙ID锛夌殑閫昏緫,streamtext浼间箮娌℃湁锛?
    //async experimental_transform(failed){}
    //experimental_telemetry
    //experimental_context(){},  //鎶婂紑鍙戣€呬唬鐮佷腑鐨勨€滅郴缁熷彉閲忊€濈洿鎺ヤ紶閫掔粰宸ュ叿锛圱ools锛夌殑鎵ц鍑芥暟锛岃€屼笉璁?AI 妯″瀷鐪嬪埌杩欎簺淇℃伅銆?
    //   async experimental_download(downloads){// Vercel AI SDK 鎻愪緵鐨勪竴涓疄楠屾€ч珮绾у姛鑳斤紝瀹冨厑璁镐綘瀹屽叏鎺ョ鍜岃嚜瀹氫箟 Prompt 涓?URL 璧勬簮鐨勪笅杞借涓恒€?
    //       return Promise.all(
    //           downloads.map(async ({ url }) => 
    //             {
    //               // 1. 妫€鏌ユ槸鍚︽槸鎴戜滑鐨勭鏈夊煙鍚?
    //               if (url.hostname === 'my-private-s3.com') {
    //                 // 2. 鎵嬪姩涓嬭浇锛屽苟甯︿笂绉佹湁鐨?Token
    //                 const response = await fetch(url, {
    //                   headers: { 'Authorization': 'Bearer MY_S3_TOKEN' }
    //                 });
    //                 const buffer = await response.arrayBuffer();

    //                 // 3. 杩斿洖缁?SDK 鏁版嵁锛孲DK 浼氬皢鍏惰浆鍖栦负鏁版嵁娴佸彂缁?AI
    //                 return {
    //                   data: new Uint8Array(buffer),
    //                   mediaType: response.headers.get('content-type') || 'image/jpeg'
    //                 };
    //               }

    //               // 4. 鍏朵粬鍏綉閾炬帴锛岃繑鍥?null 璁╂ā鍨嬭嚜宸卞鐞?
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


