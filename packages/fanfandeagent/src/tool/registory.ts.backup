import { Instance } from "@/project/instance";
import type { Tool } from "./tool";
import { BashTool } from "./bash"
import { custom } from "zod";



export namespace ToolRegistry {
    export const state = Instance.state(async () => {
        const custom = [] as Tool.Info[]

        return {
            custom
        }
    }
    )

    async function all(): Promise<Tool.Info[]> {
        const custom = await state().then((x) => x.custom)
        return [
            BashTool,
            ...custom
        ]
    }


}