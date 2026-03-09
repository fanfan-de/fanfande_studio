import z from "zod"
import type { Message } from "../session/message"
import type { Agent } from "../agent/agent"
import type { keyframes } from "hono/css"
import type { initializeContext } from "zod/v4/core"
import type { ErrorMapCtx } from "zod/v3"


export namespace Tool {
    interface Metadata {
        [key: string]: any
    }

    export interface InitContext {
        agent?: Agent.Info
    }



    export type Context<M extends Metadata = Metadata> = {
        sessionID: string
        messageID: string
    }

    /**
     * 
     */
    export interface Info<Parameters extends z.ZodType = z.ZodType, M extends Metadata = Metadata> {
        id: string
        init: (ctx?: InitContext) => Promise<{
            description: string //工具描述
            parameters: Parameters //执行工具需要的参数
            execute(
                args: z.infer<Parameters>,
                ctx: Context,
            ): Promise<{
                title: string
                metadata: M
                output: string
                attachments?: Omit<Message.FilePart, "id" | "sessionID" | "messageID">[]
            }>//工具的执行方法
            formatValidationError?(error: z.ZodError): string
        }>
    }



    export function define<Parameters extends z.ZodType, Result extends Metadata>(
        id: string,
        init : Info<Parameters,Result>["init"]//|Awaited<ReturnType<Info<Parameters,Result>["init"]>>
    ) :Info<Parameters,Result>{
        return {
            id ,
            init :async (initctx)=>{
                const toolinfo =  init(initctx)
                return toolinfo
            }
        }
    }


    export type tool = {

    }


}