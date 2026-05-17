import { describe, expect, it } from "vitest"
import type { LoadedSessionHistoryMessage } from "./types"
import { buildSessionMessageTree } from "./session-message-tree"

function createMessage(input: {
  created: number
  id: string
  parentMessageID?: string | null
  role: "user" | "assistant"
  text: string
}): LoadedSessionHistoryMessage {
  return {
    info: {
      created: input.created,
      id: input.id,
      parentMessageID: input.parentMessageID ?? null,
      role: input.role,
      sessionID: "session-1",
    },
    parts: [{ id: `part-${input.id}`, type: "text", text: input.text }],
  }
}

describe("session message tree", () => {
  it("builds active paths and branch options from parent message links", () => {
    const tree = buildSessionMessageTree([
      createMessage({ id: "user-1", role: "user", created: 1, text: "Start" }),
      createMessage({ id: "assistant-1", role: "assistant", created: 2, parentMessageID: "user-1", text: "Base answer" }),
      createMessage({ id: "user-2", role: "user", created: 3, parentMessageID: "assistant-1", text: "MVP branch" }),
      createMessage({ id: "assistant-2", role: "assistant", created: 4, parentMessageID: "user-2", text: "MVP result" }),
      createMessage({ id: "user-3", role: "user", created: 5, parentMessageID: "assistant-1", text: "Long-term branch" }),
      createMessage({ id: "assistant-3", role: "assistant", created: 6, parentMessageID: "user-3", text: "Long-term result" }),
    ], "assistant-3")

    expect(tree?.activePathMessageIDs).toEqual(["user-1", "assistant-1", "user-3", "assistant-3"])
    expect(tree?.branchOptionsByParentID["assistant-1"]).toMatchObject([
      {
        childMessageID: "user-2",
        isActive: false,
        leafMessageID: "assistant-2",
        preview: "MVP branch",
      },
      {
        childMessageID: "user-3",
        isActive: true,
        leafMessageID: "assistant-3",
        preview: "Long-term branch",
      },
    ])
  })
})
