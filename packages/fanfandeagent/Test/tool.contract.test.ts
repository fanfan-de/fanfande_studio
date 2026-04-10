import { describe, expect, it } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import z from "zod"
import { Instance } from "#project/instance.ts"
import * as Message from "#session/message.ts"
import { ExecCommandTool, resolveExecCommandBashExecutable } from "#tool/exec-command.ts"
import * as Tool from "#tool/tool.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

describe("tool contract", () => {
  it("wraps validation, authorization, aliases, and structured output", async () => {
    const customTool = Tool.define(
      "primary-tool",
      async () => ({
        title: "Primary Tool",
        description: "Test-only tool.",
        parameters: z.object({
          value: z.string(),
        }),
        validate: ({ value }) => {
          if (value === "invalid") return "value is invalid"
        },
        authorize: ({ value }) => {
          if (value === "blocked") {
            return { message: "value is blocked" }
          }
        },
        execute: async ({ value }) => ({
          text: `echo:${value}`,
          title: "Executed",
          metadata: { scope: "test" },
          data: { value },
        }),
      }),
      {
        title: "Primary Tool",
        aliases: ["secondary-tool"],
        capabilities: {
          kind: "read",
          readOnly: true,
          destructive: false,
          concurrency: "safe",
        },
      },
    )

    expect(customTool.aliases).toEqual(["secondary-tool"])
    expect(customTool.capabilities).toEqual({
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    })
    expect(Tool.toolMatchesName(customTool, "secondary-tool")).toBe(true)

    const runtime = await customTool.init()
    const output = await runtime.execute(
      { value: "ok" },
      {
        sessionID: "session-1",
        messageID: "message-1",
      },
    )

    expect(output).toEqual({
      text: "echo:ok",
      title: "Executed",
      metadata: { scope: "test" },
      data: { value: "ok" },
      attachments: undefined,
    })

    expect(Tool.normalizeToolOutput("plain-text")).toEqual({
      text: "plain-text",
    })

    expect(Tool.normalizeToolModelOutput("plain-text")).toEqual({
      type: "text",
      value: "plain-text",
    })

    await expect(
      runtime.execute(
        { value: "invalid" },
        {
          sessionID: "session-2",
          messageID: "message-2",
        },
      ),
    ).rejects.toThrow("value is invalid")

    await expect(
      runtime.execute(
        { value: "blocked" },
        {
          sessionID: "session-3",
          messageID: "message-3",
        },
      ),
    ).rejects.toThrow("value is blocked")
  })

  it("normalizes plain string tool results", async () => {
    const customTool = Tool.define(
      "string-tool",
      async () => ({
        description: "Test-only tool.",
        parameters: z.object({}),
        execute: () => "plain-result",
      }),
    )

    const runtime = await customTool.init()

    await expect(
      runtime.execute(
        {},
        {
          sessionID: "session-4",
          messageID: "message-4",
        },
      ),
    ).resolves.toEqual({
      text: "plain-result",
    })
  })

  it("exposes exec_command runtime hooks with structured behavior", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-exec-command-"))

    try {
      await createGitRepo(repositoryRoot, "exec-command")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ExecCommandTool.init()
          const ctx = {
            sessionID: "session-exec-command",
            messageID: "message-exec-command",
          }

          expect(runtime.formatValidationError).toBeTypeOf("function")
          expect(runtime.validate).toBeTypeOf("function")
          expect(runtime.authorize).toBeTypeOf("function")
          expect(runtime.toModelOutput).toBeTypeOf("function")

          await expect(
            runtime.execute(
              {
                command: "",
              } as never,
              ctx,
            ),
          ).rejects.toThrow("Invalid exec_command arguments. command:")

          await expect(runtime.validate?.({ command: "   " }, ctx)).resolves.toBe(
            "Command must contain non-whitespace characters.",
          )

          await expect(
            runtime.validate?.(
              {
                command: "pwd",
                workdir: "missing",
              },
              ctx,
            ),
          ).resolves.toBe("Workdir must be a directory: missing")

          expect(
            runtime.authorize?.(
              {
                command: "rm -rf /",
              },
              ctx,
            ),
          ).toEqual({
            message:
              "Command matched a dangerous pattern and was blocked. Set allowUnsafe=true only when this action is explicitly intended.",
          })

          const modelOutput = await runtime.toModelOutput?.({
            title: "exec_command: printf hello",
            text: "Command: printf hello\nWorkdir: .\nShell: /bin/bash\nExit: 0\n\nSTDOUT:\nhello\n\nSTDERR:\n(no stderr)",
            metadata: {
              command: "printf hello",
              shell: "/bin/bash",
              cwd: repositoryRoot,
              displayCwd: ".",
              timeoutMs: 60_000,
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              stdoutTruncated: false,
              stderrTruncated: false,
              stdout: "hello",
              stderr: "",
            },
          })

          expect(Tool.normalizeToolModelOutput(modelOutput!)).toEqual({
            type: "json",
            value: {
              title: "exec_command: printf hello",
              command: "printf hello",
              workdir: ".",
              shell: "/bin/bash",
              exitCode: 0,
              signal: null,
              timedOut: false,
              aborted: false,
              status: "ok",
              stdoutTruncated: false,
              stderrTruncated: false,
              stdout: "hello",
              stderr: "",
            },
          })
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  }, 120000)

  it("prefers Git Bash before a generic PATH bash on Windows", async () => {
    const selected = await resolveExecCommandBashExecutable({
      platform: "win32",
      shellEnv: "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      configuredGitBashPath: null,
      env: {
        PATH: "C:\\WINDOWS\\System32",
        PATHEXT: ".COM;.EXE;.BAT;.CMD",
      },
      whichCommand: (command) => {
        if (command === "git.exe" || command === "git") {
          return "C:\\Apps\\Git\\cmd\\git.exe"
        }

        if (command === "bash" || command === "bash.exe") {
          return "C:\\WINDOWS\\System32\\bash.exe"
        }

        return null
      },
      isFile: async (filePath) => filePath === "C:\\Apps\\Git\\bin\\bash.exe",
    })

    expect(selected).toBe("C:\\Apps\\Git\\bin\\bash.exe")
  })

  it("replays completed tool history through the tool model output formatter", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-tool-history-"))

    try {
      await createGitRepo(repositoryRoot, "tool-history")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const model = {
            capabilities: {
              reasoning: false,
              attachment: true,
              toolcall: true,
            },
          } as any

          const messages = await Message.toModelMessages(
            [
              {
                info: {
                  id: "assistant-history",
                  sessionID: "session-history",
                  role: "assistant",
                  created: Date.now(),
                  parentID: "user-history",
                  modelID: "test-model",
                  providerID: "test-provider",
                  agent: "plan",
                  path: {
                    cwd: repositoryRoot,
                    root: repositoryRoot,
                  },
                  cost: 0,
                  tokens: {
                    input: 0,
                    output: 0,
                    reasoning: 0,
                    cache: {
                      read: 0,
                      write: 0,
                    },
                  },
                } as Message.Assistant,
                parts: [
                  {
                    id: "tool-history",
                    sessionID: "session-history",
                    messageID: "assistant-history",
                    type: "tool",
                    callID: "call-history",
                    tool: "exec_command",
                    state: {
                      status: "completed",
                      input: { command: "printf hello" },
                      output: "Command: printf hello",
                      title: "exec_command: printf hello",
                      metadata: {
                        command: "printf hello",
                        shell: "/bin/bash",
                        cwd: repositoryRoot,
                        displayCwd: ".",
                        timeoutMs: 60_000,
                        exitCode: 0,
                        signal: null,
                        timedOut: false,
                        aborted: false,
                        stdoutTruncated: false,
                        stderrTruncated: false,
                        stdout: "hello",
                        stderr: "",
                      },
                      time: {
                        start: 1,
                        end: 2,
                      },
                    },
                  } as Message.ToolPart,
                ],
              },
            ],
            model,
          )

          const toolMessage = messages.find((item) => item.role === "tool") as any
          expect(toolMessage).toBeDefined()
          expect(toolMessage.content).toHaveLength(1)
          expect(toolMessage.content[0]).toMatchObject({
            type: "tool-result",
            toolCallId: "call-history",
            toolName: "exec_command",
            output: {
              type: "json",
              value: {
                status: "ok",
                stdout: "hello",
              },
            },
          })
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  }, 120000)
})
