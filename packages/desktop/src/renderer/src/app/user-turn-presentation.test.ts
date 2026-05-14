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

  it("persists and restores user turn diff summaries", () => {
    persistUserTurns("session-1", [
      buildUserTurn({
        displayText: "Update the app",
        diffSummary: {
          stats: {
            files: 1,
            additions: 4,
            deletions: 2,
          },
          diffs: [
            {
              file: "src/App.tsx",
              additions: 4,
              deletions: 2,
              patch: "@@ -1 +1 @@\n-old\n+new",
            },
          ],
        },
        timestamp: 10,
      }),
    ])

    expect(readPersistedUserTurns("session-1")[0]).toMatchObject({
      kind: "user",
      diffSummary: {
        stats: {
          files: 1,
          additions: 4,
          deletions: 2,
        },
        diffs: [
          {
            file: "src/App.tsx",
            additions: 4,
            deletions: 2,
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
    })
  })

  it("persists and restores steering submission mode", () => {
    persistUserTurns("session-1", [
      buildUserTurn({
        displayText: "Adjust the current task",
        submissionMode: "steer",
        streamInsertion: {
          assistantTurnID: "assistant-live",
          afterItemCount: 1,
        },
        timestamp: 10,
      }),
    ])

    const restoredTurn = readPersistedUserTurns("session-1")[0]
    expect(restoredTurn).toMatchObject({
      kind: "user",
      submissionMode: "steer",
    })
    expect(restoredTurn?.streamInsertion).toBeUndefined()
  })

  it("keeps backend diff summaries when merging user presentation state", () => {
    const previousTurns = [
      buildUserTurn({
        displayText: "local text",
        timestamp: 10,
      }),
    ]
    const historyTurns = buildTurnsFromHistory([
      {
        info: {
          id: "msg-user-diff",
          sessionID: "session-1",
          role: "user",
          created: 10,
          diffSummary: {
            stats: {
              files: 1,
              additions: 1,
              deletions: 0,
            },
            diffs: [
              {
                file: "src/new.ts",
                additions: 1,
                deletions: 0,
                patch: "@@ -0,0 +1 @@\n+new",
              },
            ],
          },
        },
        parts: [{ id: "part-user-diff", type: "text", text: "history text" }],
      },
    ])

    const mergedTurns = mergeUserTurnPresentationState(previousTurns, historyTurns)

    expect(mergedTurns[0]).toMatchObject({
      kind: "user",
      displayText: "local text",
      diffSummary: {
        diffs: [
          {
            file: "src/new.ts",
            additions: 1,
            deletions: 0,
            patch: "@@ -0,0 +1 @@\n+new",
          },
        ],
      },
    })
  })
})
