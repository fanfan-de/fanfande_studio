import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance";
import z from "zod"
import { Engine } from "./engine"
import {Session} from "../session"


//#region Types & Interfaces
export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
        .object({
            providerID: z.string(),
            modelID: z.string(),
        })
        .optional(),
    command: z.string(),
})
export type ShellInput = z.infer<typeof ShellInput>

//#region Internal Helpers (private)
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


export async function shell(input: ShellInput): Promise<{}> {
    const { sessionID, agent, command, model } = input;
    //
    const abort = start(input.sessionID)
    if (!abort) {
        //已经存在
        //throw new Session.BusyError(input.sessionID)
    }
    
    const session =  await Session.get(input.sesssion)

    const cwd = Instance.directory

    //parser command



}



