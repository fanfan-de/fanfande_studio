import { beforeEach, describe, expect, it } from "vitest"
import { buildTurnsFromHistory, buildUserTurn } from "./stream"
import { mergeUserTurnPresentationState, persistUserTurns, readPersistedUserTurns } from "./user-turn-presentation"

describe("user turn presentation persistence", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("restores comment tags after rebuilding a session from history", () => {
    persistUserTurns("session-1", [
      buildUserTurn({
        displayText: "@App.tsx:L10-L14",
        references: [
          {
            id: "comment-1",
            kind: "comment",
            label: "App.tsx:L10-L14",
            title: "src/App.tsx (lines 10-14)",
          },
        ],
        timestamp: 10,
      }),
    ])

    const historyTurns = buildTurnsFromHistory([
      {
        info: {
          id: "msg-user-comment",
          sessionID: "session-1",
          role: "user",
          created: 10,
        },
        parts: [
          {
            id: "part-user-comment",
            type: "text",
            text: "@App.tsx:L10-L14\n\nReview the selected lines before making changes.",
          },
        ],
      },
    ])

    const mergedTurns = mergeUserTurnPresentationState(readPersistedUserTurns("session-1"), historyTurns)

    expect(mergedTurns[0]).toMatchObject({
      kind: "user",
      displayText: "@App.tsx:L10-L14",
      references: [
        {
          id: "comment-1",
          kind: "comment",
          label: "App.tsx:L10-L14",
          title: "src/App.tsx (lines 10-14)",
        },
      ],
    })
    expect(mergedTurns[0]?.kind === "user" ? mergedTurns[0].text : "").not.toContain(
      "Review the selected lines before making changes.",
    )
  })
})
