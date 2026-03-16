/**
 * @file UserService.ts
 * @description 用户相关的核心业务逻辑，包括注册、登录、权限校验。
 *              该服务作为 Controller 与 Repository 之间的中间层。
 * @module user
 * @depends AuthProvider, DatabaseClient, Logger
 * @exports createUser, loginUser, validateToken, UserVO, CreateUserDTO
 */
import { Instance } from "@/project/instance";
import { Log } from "@/util/log";
import { Message } from "./message"
import z from "zod";
import { Identifier } from "@/id/id";
import { fn } from "@/util/fn";
import { loop } from "./Loop";


const log = Log.create({ service: "session.engine" })

//每个项目实例拥有独立的Session State状态隔离，注意，这里是运行时的状态，不是所有的历史session
//仅仅是当前正在运行的session
export const state = Instance.state(
    () => {
        const data: Record<
            string,
            {
                abort: AbortController
                callbacks: {
                    resolve(input: Message.WithParts): void
                    reject(): void
                }[]
            }
        > = {}
        return data
    },
)

//#region Types & Interfaces
export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z
        .record(z.string(), z.boolean())
        .optional()
        .describe(
            "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
        ),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(
        z.discriminatedUnion("type", [
            Message.TextPart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "TextPartInput",
                }),
            Message.FilePart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "FilePartInput",
                }),
            Message.AgentPart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "AgentPartInput",
                }),
            Message.SubtaskPart.omit({
                messageID: true,
                sessionID: true,
            })
                .partial({
                    id: true,
                })
                .meta({
                    ref: "SubtaskPartInput",
                }),
        ]),
    ),
})
export type PromptInput = z.infer<typeof PromptInput>



//#endregion

// #region Internal Helpers (private)
function start(sessionID: string): AbortSignal | undefined {
    const s = Engine.state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
        abort: controller,
        callbacks: [],
    }
    return controller.signal
}
//#endregion


// #region Exports
// #endregion


//推入Engine一次prompt,
export const prompt = fn(PromptInput, async (input) => {



    return loop(input.sessionID)
})



