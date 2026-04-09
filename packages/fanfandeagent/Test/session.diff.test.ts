import { describe, expect, test } from "bun:test"
import { buildDiffSummary, summarizeSnapshotFileDiffs } from "#session/diff-summary.ts"

describe("session diff summary", () => {
  test("maps snapshot file diffs into compact file summaries", () => {
    const summary = summarizeSnapshotFileDiffs([
      {
        file: "src/App.tsx",
        before: "old",
        after: "new",
        additions: 5,
        deletions: 1,
      },
      {
        file: "src/styles.css",
        before: "old",
        after: "new",
        additions: 3,
        deletions: 2,
      },
    ])

    expect(summary).toEqual([
      {
        file: "src/App.tsx",
        additions: 5,
        deletions: 1,
      },
      {
        file: "src/styles.css",
        additions: 3,
        deletions: 2,
      },
    ])
  })

  test("builds aggregate stats and readable copy", () => {
    const summary = buildDiffSummary([
      {
        file: "src/App.tsx",
        additions: 5,
        deletions: 1,
      },
      {
        file: "src/styles.css",
        additions: 3,
        deletions: 2,
      },
      {
        file: "README.md",
        additions: 1,
        deletions: 0,
      },
      {
        file: "package.json",
        additions: 2,
        deletions: 0,
      },
    ])

    expect(summary.stats).toEqual({
      files: 4,
      additions: 11,
      deletions: 3,
    })
    expect(summary.title).toBe("4 file changes (+11 -3)")
    expect(summary.body).toBe("src/App.tsx, src/styles.css, README.md, +1 more")
  })

  test("renders an empty diff state", () => {
    const summary = buildDiffSummary([])

    expect(summary.stats).toEqual({
      files: 0,
      additions: 0,
      deletions: 0,
    })
    expect(summary.title).toBe("No file changes")
    expect(summary.body).toBe("No tracked workspace changes were captured for this turn.")
  })
})
