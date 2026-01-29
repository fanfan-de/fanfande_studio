import yargs, { type Argv } from "yargs"
import { cmd } from "./cmd"
import { Instance } from "@/project/instance"
import path from "path"


const AVAILABLE_TOOLS = [
    "bash",
    "read",
    "write",
    "edit",
    "list",
    "glob",
    "grep",
    "webfetch",
    "task",
    "todowrite",
    "todoread",
]


export const AgentCommand = cmd({
    command: "agent",
    describe: "manage agents",
    builder: (yargs) => yargs.command(AgentCreateCommand).command(AgentListCommand).demandCommand(),
    async handler() { },
})


const AgentCreateCommand = cmd({
    command: "create",
    describe: "create a new agent",
    builder: (yargs: Argv) =>
        yargs
            .option("path", {
                type: "string",
                describe: "directory path to generate the agent file"
            })
            .option("description", {
                type: "string",
                description: "what the agent should do"
            })
            .option("mode", {
                type: "string",
                describe: "agent mode",
                choices: ["all", "primary", "subagent"] as const,
            })
            .option("tools", {
                type: "string",
                describe: `comma-separated list of tools to enable (default: all). Available: "${AVAILABLE_TOOLS.join(", ")}"`,
            })
            .option("model", {
                type: "string",
                describe: "model to use in the format of provider/model",
            }),
    async handler(args) {
        await Instance.provide({
            directory: process.cwd(),
            async fn() {
                const cliPath = args.path
                const cliDescription = args.description
                const cliMode = args.mode
                const cliTools = args.tools
                const cliModel = args.model

                const isFullyNonInteractive = cliPath &&cliDescription&&cliMode&&cliTools&&cliModel !== undefined
                //参数不全，需要进入交互模式
                if(!isFullyNonInteractive)
                {
                    //清空屏幕，提供干净的交互环境
                    UI.Empty()
                    prompts.intro("create agent")//?
                }

                const project  = Instance.project

                let targetPath :string
                if(cliPath){
                    targetPath = path.join(cliPath,"agent")
                }
                else{
                    let scope: "global" | "project" = "global"
                    if(project.vcs === "git")
                    {
                        //todo
                    }
                }
            },
        }

        )


    }
})


const AgentListCommand = cmd({




})

