import { describe, expect, it } from "vitest"
import type { LoadedSessionHistoryMessage } from "./types"
import { buildSessionMessageTree } from "./session-message-tree"

function createMessage(input: {
  created: number
  internal?: boolean
  id: string
  parentMessageID?: string | null
  role: "user" | "assistant"
  parts?: unknown[]
  text: string
}): LoadedSessionHistoryMessage {
  return {
    info: {
      created: input.created,
      id: input.id,
      internal: input.internal,
      parentMessageID: input.parentMessageID ?? null,
      role: input.role,
      sessionID: "session-1",
    },
    parts: input.parts ?? [{ id: `part-${input.id}`, type: "text", text: input.text }],
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
    expect(tree?.rootMessageIDs).toEqual(["user-1"])
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

  it("exposes multiple roots in stable created and id order", () => {
    const tree = buildSessionMessageTree([
      createMessage({ id: "root-c", role: "user", created: 3, text: "Third root" }),
      createMessage({ id: "root-b", role: "user", created: 1, text: "Second by id" }),
      createMessage({ id: "root-a", role: "user", created: 1, text: "First by id" }),
      createMessage({ id: "assistant-1", role: "assistant", created: 4, parentMessageID: "root-a", text: "Child" }),
    ], "assistant-1")

    expect(tree?.rootMessageIDs).toEqual(["root-a", "root-b", "root-c"])
    expect(tree?.activePathMessageIDs).toEqual(["root-a", "assistant-1"])
    expect(tree?.branchOptionsByParentID).toEqual({})
  })

  it("keeps only user messages and final assistant response text in the tree", () => {
    const tree = buildSessionMessageTree([
      createMessage({ id: "user-1", role: "user", created: 1, text: "Start" }),
      createMessage({
        id: "assistant-hidden",
        role: "assistant",
        created: 2,
        parentMessageID: "user-1",
        text: "",
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Private reasoning" },
          { id: "tool-1", type: "tool", tool: "read-file", state: { status: "completed" } },
        ],
      }),
      createMessage({
        id: "user-2",
        role: "user",
        created: 3,
        parentMessageID: "assistant-hidden",
        text: "Follow up",
      }),
      createMessage({
        id: "assistant-1",
        role: "assistant",
        created: 4,
        parentMessageID: "user-2",
        text: "",
        parts: [
          { id: "reasoning-2", type: "reasoning", text: "More private reasoning" },
          { id: "tool-2", type: "tool", tool: "grep", state: { status: "completed" } },
          { id: "text-1", type: "text", text: "Final response only" },
        ],
      }),
      createMessage({ id: "internal-1", role: "assistant", created: 5, internal: true, text: "Compaction" }),
    ], "assistant-1")

    expect(Object.keys(tree?.nodesByID ?? {})).toEqual(["user-1", "user-2", "assistant-1"])
    expect(tree?.childIDsByParentID["user-1"]).toEqual(["user-2"])
    expect(tree?.nodesByID["assistant-1"]?.preview).toBe("Final response only")
    expect(tree?.activePathMessageIDs).toEqual(["user-1", "user-2", "assistant-1"])
  })
})
