import { Instance } from "#project/instance.ts";
import * as Tool  from "#tool/tool.ts";
import { BashTool } from "#tool/bash.ts"
import { custom } from "zod";
import * as Log from "#util/log.ts"


const log = Log.create({ service: "tool.registry" })


//项目级工具存储 
export const state = Instance.state(async () => {
    const custom = [] as Tool.ToolInfo[]

    return { custom }
}
)

async function all(): Promise<Tool.ToolInfo[]> {
    const custom = await state().then((x) => x.custom)
    return [
        BashTool,
        ...custom
    ]
}
