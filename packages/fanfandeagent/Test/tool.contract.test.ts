import { describe, expect, it } from "bun:test"
import z from "zod"
import * as Tool from "#tool/tool.ts"

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
})
