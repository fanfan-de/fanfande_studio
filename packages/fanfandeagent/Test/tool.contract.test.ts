import { describe, expect, it } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import z from "zod"
import { Instance } from "#project/instance.ts"
import * as Message from "#session/message.ts"
import { ExecCommandTool, resolveExecCommandBashExecutable } from "#tool/exec-command.ts"
import { GlobTool } from "#tool/glob.ts"
import { GrepTool } from "#tool/grep.ts"
import { ReadFileTool } from "#tool/read-file.ts"
import { ReplaceTextTool } from "#tool/replace-text.ts"
import * as Tool from "#tool/tool.ts"
import { WriteFileTool } from "#tool/write-file.ts"

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

  it("maps user image and file parts to the AI SDK multimodal shape", async () => {
    const model = {
      capabilities: {
        reasoning: false,
        attachment: true,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: true,
          video: false,
          pdf: true,
        },
      },
    } as any

    const messages = await Message.toModelMessages(
      [
        {
          info: {
            id: "user-multimodal",
            sessionID: "session-multimodal",
            role: "user",
            created: Date.now(),
            agent: "plan",
            model: {
              providerID: "test-provider",
              modelID: "test-model",
            },
          } as Message.User,
          parts: [
            {
              id: "part-1",
              sessionID: "session-multimodal",
              messageID: "user-multimodal",
              type: "text",
              text: "Describe these references.",
            } as Message.TextPart,
            {
              id: "part-2",
              sessionID: "session-multimodal",
              messageID: "user-multimodal",
              type: "image",
              mime: "image/png",
              filename: "hero.png",
              url: "data:image/png;base64,aGVsbG8=",
            } as Message.ImagePart,
            {
              id: "part-3",
              sessionID: "session-multimodal",
              messageID: "user-multimodal",
              type: "file",
              mime: "application/pdf",
              filename: "brief.pdf",
              url: "data:application/pdf;base64,aGVsbG8=",
            } as Message.FilePart,
          ],
        },
      ],
      model,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "text",
          text: "Describe these references.",
        },
        {
          type: "image",
          image: "data:image/png;base64,aGVsbG8=",
          mediaType: "image/png",
        },
        {
          type: "file",
          data: "data:application/pdf;base64,aGVsbG8=",
          filename: "brief.pdf",
          mediaType: "application/pdf",
        },
      ],
    })
  })

  it("does not replay assistant reasoning parts into subsequent model context", async () => {
    const model = {
      capabilities: {
        reasoning: true,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
    } as any

    const messages = await Message.toModelMessages(
      [
        {
          info: {
            id: "assistant-reasoning-history",
            sessionID: "session-reasoning-history",
            role: "assistant",
            created: Date.now(),
            parentID: "user-reasoning-history",
            modelID: "test-model",
            providerID: "test-provider",
            agent: "plan",
            path: {
              cwd: ".",
              root: ".",
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
              id: "assistant-reasoning-text",
              sessionID: "session-reasoning-history",
              messageID: "assistant-reasoning-history",
              type: "text",
              text: "Final answer",
            } as Message.TextPart,
            {
              id: "assistant-reasoning-part",
              sessionID: "session-reasoning-history",
              messageID: "assistant-reasoning-history",
              type: "reasoning",
              text: "Hidden chain-of-thought",
              time: {
                start: Date.now(),
              },
            } as Message.ReasoningPart,
          ],
        },
      ],
      model,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: [
        {
          type: "text",
          text: "Final answer",
        },
      ],
    })
    expect((messages[0] as any).content).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "reasoning",
        }),
      ]),
    )
  })

  it("fails fast with a clear error when the model does not support image input", async () => {
    const model = {
      id: "deepseek-chat",
      providerID: "deepseek",
      capabilities: {
        reasoning: false,
        attachment: true,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
    } as any

    await expect(
      Message.toModelMessages(
        [
          {
            info: {
              id: "user-image-unsupported",
              sessionID: "session-image-unsupported",
              role: "user",
              created: Date.now(),
              agent: "plan",
              model: {
                providerID: "deepseek",
                modelID: "deepseek-chat",
              },
            } as Message.User,
            parts: [
              {
                id: "part-1",
                sessionID: "session-image-unsupported",
                messageID: "user-image-unsupported",
                type: "image",
                mime: "image/png",
                filename: "hero.png",
                url: "data:image/png;base64,aGVsbG8=",
              } as Message.ImagePart,
            ],
          },
        ],
        model,
      ),
    ).rejects.toThrow("does not support image input")
  })

  it("accepts image parts when the model supports image input without generic attachments", async () => {
    const model = {
      id: "qwen-vl-max",
      providerID: "alibaba-cn",
      capabilities: {
        reasoning: false,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: true,
          video: false,
          pdf: false,
        },
      },
    } as any

    const messages = await Message.toModelMessages(
      [
        {
          info: {
            id: "user-image-supported",
            sessionID: "session-image-supported",
            role: "user",
            created: Date.now(),
            agent: "plan",
            model: {
              providerID: "alibaba-cn",
              modelID: "qwen-vl-max",
            },
          } as Message.User,
          parts: [
            {
              id: "part-1",
              sessionID: "session-image-supported",
              messageID: "user-image-supported",
              type: "image",
              mime: "image/png",
              filename: "hero.png",
              url: "data:image/png;base64,aGVsbG8=",
            } as Message.ImagePart,
          ],
        },
      ],
      model,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      role: "user",
      content: [
        {
          type: "image",
          image: "data:image/png;base64,aGVsbG8=",
          mediaType: "image/png",
        },
      ],
    })
  })

  it("replays provider-executed MCP history on the assistant message", async () => {
    const model = {
      capabilities: {
        reasoning: false,
        attachment: false,
        toolcall: true,
      },
    } as any

    const messages = await Message.toModelMessages(
      [
        {
          info: {
            id: "assistant-provider-executed",
            sessionID: "session-provider-executed",
            role: "assistant",
            created: Date.now(),
            parentID: "user-provider-executed",
            modelID: "gpt-5",
            providerID: "openai",
            agent: "plan",
            path: {
              cwd: ".",
              root: ".",
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
              id: "provider-executed-tool",
              sessionID: "session-provider-executed",
              messageID: "assistant-provider-executed",
              type: "tool",
              callID: "call-provider-executed",
              tool: "mcp.remote-search",
              providerExecuted: true,
              metadata: {
                openai: {
                  itemId: "item-1",
                },
              },
              state: {
                status: "completed",
                input: {
                  query: "latest ai news",
                },
                output: "headline results",
                modelOutput: {
                  type: "call",
                  serverLabel: "remote-search",
                  name: "search",
                  arguments: "{\"query\":\"latest ai news\"}",
                  output: "headline results",
                },
                title: "Remote Search",
                metadata: {
                  openai: {
                    itemId: "item-1",
                  },
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

    const assistantMessage = messages.find((item) => item.role === "assistant") as any
    expect(assistantMessage).toBeDefined()
    expect(assistantMessage.content).toEqual([
      {
        type: "tool-call",
        toolCallId: "call-provider-executed",
        toolName: "mcp.remote-search",
        input: {
          query: "latest ai news",
        },
        providerExecuted: true,
        providerOptions: {
          openai: {
            itemId: "item-1",
          },
        },
      },
      {
        type: "tool-result",
        toolCallId: "call-provider-executed",
        toolName: "mcp.remote-search",
        output: {
          type: "call",
          serverLabel: "remote-search",
          name: "search",
          arguments: "{\"query\":\"latest ai news\"}",
          output: "headline results",
        },
        providerOptions: {
          openai: {
            itemId: "item-1",
          },
        },
      },
    ])

    expect(messages.find((item) => item.role === "tool")).toBeUndefined()
  })

  it("reads line ranges from large text files", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-read-file-"))

    try {
      await createGitRepo(repositoryRoot, "read-file")

      const bigFile = path.join(repositoryRoot, "large.txt")
      const lines = Array.from({ length: 25_000 }, (_, index) =>
        `line ${String(index + 1).padStart(5, "0")} ${"x".repeat(48)}`,
      ).join("\n")
      await writeFile(bigFile, lines)

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReadFileTool.init()
          const result = Tool.normalizeToolOutput(await runtime.execute(
            {
              path: "large.txt",
              startLine: 12_500,
              endLine: 12_502,
            },
            {
              sessionID: "session-read-file",
              messageID: "message-read-file",
            },
          ))

          expect(result.title).toBe("Read large.txt")
          expect(result.text).toContain("Lines: 12500-12502 of 25000")
          expect(result.text).toContain("12500 | line 12500")
          expect(result.text).toContain("12502 | line 12502")
          expect(result.text).not.toContain("12503 |")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  }, 120000)

  it("rejects binary files for text reads", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-read-binary-"))

    try {
      await createGitRepo(repositoryRoot, "read-binary")
      await writeFile(path.join(repositoryRoot, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReadFileTool.init()

          await expect(
            runtime.execute(
              {
                path: "image.png",
              },
              {
                sessionID: "session-read-binary",
                messageID: "message-read-binary",
              },
            ),
          ).rejects.toThrow("appears to be a binary file")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("creates new files with write-file and uses create wording in approval", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-write-file-create-"))

    try {
      await createGitRepo(repositoryRoot, "write-file-create")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await WriteFileTool.init()
          const displayPath = path.join("generated", "from-tool.txt")
          const ctx = {
            sessionID: "session-write-file-create",
            messageID: "message-write-file-create",
          }

          await expect(runtime.describeApproval?.({
            path: "generated/from-tool.txt",
            content: "hello",
          }, ctx)).resolves.toMatchObject({
            title: `Write ${displayPath}`,
            summary: `Create ${displayPath} with new file contents.`,
          })

          const result = Tool.normalizeToolOutput(await runtime.execute(
            {
              path: "generated/from-tool.txt",
              content: "hello",
            },
            ctx,
          ))

          expect(await readFile(path.join(repositoryRoot, "generated", "from-tool.txt"), "utf8")).toBe("hello")
          expect(result.title).toBe(`Wrote ${displayPath}`)
          expect(result.text).toBe(`Wrote 5 bytes to ${displayPath}.`)
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("overwrites existing text files with write-file and keeps overwrite wording", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-write-file-overwrite-"))

    try {
      await createGitRepo(repositoryRoot, "write-file-overwrite")
      await writeFile(path.join(repositoryRoot, "notes.txt"), "old", "utf8")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await WriteFileTool.init()
          const ctx = {
            sessionID: "session-write-file-overwrite",
            messageID: "message-write-file-overwrite",
          }

          await expect(runtime.describeApproval?.({
            path: "notes.txt",
            content: "new text",
          }, ctx)).resolves.toMatchObject({
            title: "Write notes.txt",
            summary: "Overwrite notes.txt with new file contents.",
          })

          await runtime.execute(
            {
              path: "notes.txt",
              content: "new text",
            },
            ctx,
          )

          expect(await readFile(path.join(repositoryRoot, "notes.txt"), "utf8")).toBe("new text")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("rejects binary files for write-file updates", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-write-file-binary-"))

    try {
      await createGitRepo(repositoryRoot, "write-file-binary")
      await writeFile(path.join(repositoryRoot, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await WriteFileTool.init()

          await expect(
            runtime.execute(
              {
                path: "image.png",
                content: "not-a-png",
              },
              {
                sessionID: "session-write-file-binary",
                messageID: "message-write-file-binary",
              },
            ),
          ).rejects.toThrow("Cannot write image.png because it appears to be a binary file.")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("rejects directory targets for write-file with a clear error", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-write-file-directory-"))

    try {
      await createGitRepo(repositoryRoot, "write-file-directory")
      await mkdir(path.join(repositoryRoot, "nested"))

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await WriteFileTool.init()

          await expect(
            runtime.execute(
              {
                path: "nested",
                content: "hello",
              },
              {
                sessionID: "session-write-file-directory",
                messageID: "message-write-file-directory",
              },
            ),
          ).rejects.toThrow("Cannot write nested because it is a directory.")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("creates new files with Claude-style replace-text arguments", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-replace-text-create-"))

    try {
      await createGitRepo(repositoryRoot, "replace-text-create")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReplaceTextTool.init()
          const displayPath = path.join("generated", "from-tool.txt")
          const ctx = {
            sessionID: "session-replace-text-create",
            messageID: "message-replace-text-create",
          }

          await expect(runtime.describeApproval?.({
            file_path: "generated/from-tool.txt",
            old_string: "",
            new_string: "hello",
          }, ctx)).resolves.toMatchObject({
            title: `Create ${displayPath}`,
            summary: `Create ${displayPath} with new file contents.`,
          })

          const result = Tool.normalizeToolOutput(await runtime.execute(
            {
              file_path: "generated/from-tool.txt",
              old_string: "",
              new_string: "hello",
            },
            ctx,
          ))

          expect(await readFile(path.join(repositoryRoot, "generated", "from-tool.txt"), "utf8")).toBe("hello")
          expect(result.title).toBe(`Created ${displayPath}`)
          expect(result.text).toBe(`Created ${displayPath} with 5 bytes.`)
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("rejects ambiguous replace-text edits unless replace_all is true", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-replace-text-ambiguous-"))

    try {
      await createGitRepo(repositoryRoot, "replace-text-ambiguous")
      await writeFile(path.join(repositoryRoot, "notes.txt"), "alpha beta alpha", "utf8")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReplaceTextTool.init()

          await expect(
            runtime.execute(
              {
                file_path: "notes.txt",
                old_string: "alpha",
                new_string: "omega",
              },
              {
                sessionID: "session-replace-text-ambiguous",
                messageID: "message-replace-text-ambiguous",
              },
            ),
          ).rejects.toThrow("Found 2 matches in notes.txt, but replace_all is false.")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("keeps backwards-compatible replace-text aliases and preserves CRLF replacements", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-replace-text-alias-"))

    try {
      await createGitRepo(repositoryRoot, "replace-text-alias")
      await writeFile(path.join(repositoryRoot, "notes.txt"), "alpha\r\nbeta\r\n", "utf8")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReplaceTextTool.init()
          const result = Tool.normalizeToolOutput(await runtime.execute(
            {
              path: "notes.txt",
              search: "alpha\nbeta",
              replace: "omega\ngamma",
              all: true,
            },
            {
              sessionID: "session-replace-text-alias",
              messageID: "message-replace-text-alias",
            },
          ))

          expect(await readFile(path.join(repositoryRoot, "notes.txt"), "utf8")).toBe("omega\r\ngamma\r\n")
          expect(result.title).toBe("Updated notes.txt")
          expect(result.text).toBe("Replaced 1 occurrence(s) in notes.txt.")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("matches files and directories with glob", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-glob-"))

    try {
      await createGitRepo(repositoryRoot, "glob")
      await mkdir(path.join(repositoryRoot, "src", "utils"), { recursive: true })
      await mkdir(path.join(repositoryRoot, "docs"), { recursive: true })
      await writeFile(path.join(repositoryRoot, "src", "app.ts"), "export const app = true\n", "utf8")
      await writeFile(path.join(repositoryRoot, "src", "utils", "helper.ts"), "export const helper = true\n", "utf8")
      await writeFile(path.join(repositoryRoot, "docs", "guide.md"), "# docs\n", "utf8")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await GlobTool.init()
          const ctx = {
            sessionID: "session-glob",
            messageID: "message-glob",
          }

          const fileResult = Tool.normalizeToolOutput(await runtime.execute(
            {
              pattern: "**/*.ts",
              path: "src",
            },
            ctx,
          ))

          expect(fileResult.title).toBe("Glob **/*.ts")
          expect(fileResult.text).toContain(`[file] ${path.join("src", "app.ts")}`)
          expect(fileResult.text).toContain(`[file] ${path.join("src", "utils", "helper.ts")}`)
          expect(fileResult.text).not.toContain("guide.md")

          const dirResult = Tool.normalizeToolOutput(await runtime.execute(
            {
              pattern: "**/utils",
              type: "dirs",
            },
            ctx,
          ))

          expect(dirResult.text).toContain(`[dir] ${path.join("src", "utils")}`)
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("searches file contents with grep and respects glob filters", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-grep-"))

    try {
      await createGitRepo(repositoryRoot, "grep")
      await mkdir(path.join(repositoryRoot, "src"), { recursive: true })
      await writeFile(path.join(repositoryRoot, "src", "one.ts"), "const Alpha = 1\nconst beta = Alpha + 1\n", "utf8")
      await writeFile(path.join(repositoryRoot, "src", "two.ts"), "const beta = 2\n", "utf8")
      await writeFile(path.join(repositoryRoot, "notes.txt"), "Alpha outside src\n", "utf8")

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await GrepTool.init()
          const result = Tool.normalizeToolOutput(await runtime.execute(
            {
              pattern: "Alpha\\s*=\\s*\\d",
              glob: "src/**/*.ts",
            },
            {
              sessionID: "session-grep",
              messageID: "message-grep",
            },
          ))

          expect(result.title).toBe("Grep Alpha\\s*=\\s*\\d")
          expect(result.text).toContain(`${path.join("src", "one.ts")}:1:7: const Alpha = 1`)
          expect(result.text).not.toContain("notes.txt")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  it("rejects symlinked paths that resolve outside the project boundary", async () => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), "fanfande-read-symlink-"))
    const outsideRoot = await mkdtemp(path.join(tmpdir(), "fanfande-read-symlink-target-"))

    try {
      await createGitRepo(repositoryRoot, "read-symlink")
      await writeFile(path.join(outsideRoot, "secret.txt"), "outside project\n")

      const linkedDirectory = path.join(repositoryRoot, "linked")
      await symlink(
        outsideRoot,
        linkedDirectory,
        process.platform === "win32" ? "junction" : "dir",
      )

      await Instance.provide({
        directory: repositoryRoot,
        async fn() {
          const runtime = await ReadFileTool.init()

          await expect(
            runtime.execute(
              {
                path: "linked/secret.txt",
              },
              {
                sessionID: "session-read-symlink",
                messageID: "message-read-symlink",
              },
            ),
          ).rejects.toThrow("outside the active project boundary")
        },
      })
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
      await rm(outsideRoot, { recursive: true, force: true })
    }
  })
})
