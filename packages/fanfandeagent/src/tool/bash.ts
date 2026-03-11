import { Tool } from "./tool"
import { Shell } from "../shell/shell"
import z from "zod"
import { Instance } from "@/project/instance"
import { spawn } from "node:child_process"



export const BashTool = Tool.define(
    "bash",
    async () => {
        const shell = Shell.preferred()
        return {
            description: "shell 工具描述",
            parameters: z.object({
                command: z.string().describe("运行的指令"),
                timeout: z.number().describe("Optional timeout in milliseconds").optional(),
                workdir: z.string()
                    .describe(`The working directory to run the command in. Defaults to ${Instance.directory}. Use this instead of 'cd' commands.`)
                    .optional(),
            }),
            execute: async (parameters, ctx) => {
                const cwd = parameters.workdir || Instance.directory//优先参数目录，其次是工作目录
                //const tree = await parser().then((p) => p.parse(params.command))

                //proc是一个 ChildProcess
                const proc = spawn(parameters.command, {
                    shell,
                    cwd,
                })

                let output = ""
                let timedOut = false
                let aborted = false
                let exited = false

                const append = (chunk: Buffer) => {
                    output += chunk.toString()
                }

                proc.stdout?.on("data", append)
                proc.stderr?.on("data", append)


                await new Promise<void>((resolve, reject) => {
                    proc.once("exit", () => {
                        exited = true
                        resolve
                    })
                    proc.once("error", (error) => {
                        exited = true
                        reject(error)
                    })
                }
                )

                return {
                    output,
                }
            }
        }
    }
)