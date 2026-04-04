import z from "zod"
import type { JSONValue } from "@ai-sdk/provider"
import type * as Agent from "#agent/agent.ts"

type Metadata = Record<string, unknown>
export type Awaitable<T> = T | Promise<T>

export type ToolKind = "read" | "write" | "search" | "exec" | "other"
export type ToolConcurrency = "safe" | "exclusive"

export interface ToolCapabilities {
  kind?: ToolKind
  readOnly?: boolean
  destructive?: boolean
  concurrency?: ToolConcurrency
  needsShell?: boolean
}

export interface InitContext {
  agent?: Agent.AgentInfo
}

export interface Context {
  sessionID: string
  messageID: string
  cwd?: string
  worktree?: string
  abort?: AbortSignal
  toolCallID?: string
}

export interface ToolAttachment<M extends Metadata = Metadata> {
  url: string
  mime: string
  filename?: string
  metadata?: M
}

export interface ToolOutput<M extends Metadata = Metadata, D = unknown> {
  text: string
  title?: string
  metadata?: M
  data?: D
  attachments?: ToolAttachment<M>[]
}

export type ToolGuardResult =
  | void
  | string
  | {
    message: string
  }

export type ToolModelOutput =
  | string
  | { type: "text"; value: string }
  | { type: "json"; value: JSONValue }
  | { type: "error-text"; value: string }
  | { type: "error-json"; value: JSONValue }
  | { type: "execution-denied"; reason?: string }

export interface ToolRuntime<
  Parameters extends z.ZodType = z.ZodType,
  M extends Metadata = Metadata,
  D = unknown,
> {
  description: string
  title?: string
  parameters: Parameters
  execute(
    args: z.infer<Parameters>,
    ctx: Context,
  ): Awaitable<ToolOutput<M, D> | string>

  formatValidationError?(error: z.ZodError): string
  validate?(args: z.infer<Parameters>, ctx: Context): Promise<ToolGuardResult> | ToolGuardResult
  authorize?(args: z.infer<Parameters>, ctx: Context): Promise<ToolGuardResult> | ToolGuardResult
  toModelOutput?(
    result: ToolOutput<M, D>,
  ): Awaitable<ToolModelOutput>
}

export interface ToolInfo<
  Parameters extends z.ZodType = z.ZodType,
  M extends Metadata = Metadata,
  D = unknown,
> {
  id: string
  title?: string
  aliases?: string[]
  capabilities?: ToolCapabilities
  init: (ctx?: InitContext) => Promise<ToolRuntime<Parameters, M, D>>
}

type ToolDefineOptions<
  Parameters extends z.ZodType = z.ZodType,
  M extends Metadata = Metadata,
  D = unknown,
> = Omit<ToolInfo<Parameters, M, D>, "id" | "init">

function toGuardErrorMessage(result: ToolGuardResult): string | undefined {
  if (typeof result === "string") {
    const message = result.trim()
    return message ? message : undefined
  }

  if (result && typeof result === "object" && typeof result.message === "string") {
    const message = result.message.trim()
    return message ? message : undefined
  }

  return undefined
}

export function toolMatchesName(
  tool: Pick<ToolInfo, "id" | "aliases">,
  name: string,
): boolean {
  return tool.id === name || (tool.aliases?.includes(name) ?? false)
}

export function normalizeToolOutput<M extends Metadata = Metadata, D = unknown>(
  result: ToolOutput<M, D> | string,
): ToolOutput<M, D> {
  if (typeof result === "string") {
    return { text: result }
  }

  return {
    text: result.text,
    title: result.title,
    metadata: result.metadata,
    data: result.data,
    attachments: result.attachments,
  }
}

export function normalizeToolModelOutput(output: ToolModelOutput): Exclude<ToolModelOutput, string> {
  if (typeof output === "string") {
    return {
      type: "text",
      value: output,
    }
  }

  return output
}

export function define<Parameters extends z.ZodType, Result extends Metadata, Data = unknown>(
  id: string,
  init: ToolInfo<Parameters, Result, Data>["init"],
  options: ToolDefineOptions<Parameters, Result, Data> = {},
): ToolInfo<Parameters, Result, Data> {
  return {
    id,
    ...options,
    init: async (initctx) => {
      const toolinfo = await init(initctx)
      const execute = toolinfo.execute

      toolinfo.execute = async (args, ctx) => {
        const parsed = toolinfo.parameters.safeParse(args)
        if (!parsed.success) {
          if (toolinfo.formatValidationError) {
            throw new Error(toolinfo.formatValidationError(parsed.error), { cause: parsed.error })
          }

          throw new Error(
            `The ${id} tool was called with invalid arguments: ${parsed.error.message}. Please rewrite the input so it satisfies the expected schema.`,
            { cause: parsed.error },
          )
        }

        const validationFailure = toGuardErrorMessage(await toolinfo.validate?.(parsed.data, ctx))
        if (validationFailure) {
          throw new Error(validationFailure)
        }

        const authorizationFailure = toGuardErrorMessage(await toolinfo.authorize?.(parsed.data, ctx))
        if (authorizationFailure) {
          throw new Error(authorizationFailure)
        }

        return normalizeToolOutput(await execute(parsed.data, ctx))
      }

      return toolinfo
    },
  }
}
