import { describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Instance } from "#project/instance.ts"
import { buildDetailedDiffSummary, buildDiffSummary, summarizeSnapshotFileDiffs } from "#session/diff/diff-summary.ts"
import * as Snapshot from "#snapshot/snapshot.ts"

const hasGit = spawnSync("git", ["--version"], { stdio: "ignore" }).status === 0
const testIfGit = hasGit ? test : test.skip

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

  test("preserves detailed patch text for UI expansion", () => {
    const summary = buildDetailedDiffSummary([
      {
        file: "src/App.tsx",
        before: "old",
        after: "new",
        additions: 1,
        deletions: 1,
        patch: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
      },
    ])

    expect(summary.stats).toEqual({
      files: 1,
      additions: 1,
      deletions: 1,
    })
    expect(summary.diffs[0]?.patch).toContain("@@ -1 +1 @@")
  })

  testIfGit("preserves patch text for non-ASCII file paths", async () => {
    const root = await mkdtemp(join(tmpdir(), "anybox-snapshot-unicode-"))

    try {
      await Instance.provide({
        directory: root,
        async fn() {
          const before = await Snapshot.track()
          await writeFile(join(root, "春暖花开.md"), "面朝大海\n春暖花开\n", "utf8")
          const after = await Snapshot.track()

          if (!before || !after) {
            throw new Error("Expected snapshots to be captured for the test workspace.")
          }

          const diffs = await Snapshot.diffFull(before, after, {
            includeContent: false,
          })

          expect(diffs).toHaveLength(1)
          expect(diffs[0]).toMatchObject({
            file: "春暖花开.md",
            additions: 2,
            deletions: 0,
          })
          expect(diffs[0]?.patch).toContain("diff --git")
          expect(diffs[0]?.patch).toContain("+面朝大海")
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  testIfGit("excludes generated dependency directories from snapshots", async () => {
    const root = await mkdtemp(join(tmpdir(), "anybox-snapshot-ignore-"))

    try {
      await Instance.provide({
        directory: root,
        async fn() {
          const before = await Snapshot.track()

          await mkdir(join(root, "app", "src"), { recursive: true })
          await mkdir(join(root, "app", "node_modules", "left-pad"), { recursive: true })
          await mkdir(join(root, "app", "dist"), { recursive: true })
          await writeFile(join(root, "app", "src", "index.ts"), "export const value = 1\n", "utf8")
          await writeFile(join(root, "app", "node_modules", "left-pad", "index.js"), "module.exports = 1\n", "utf8")
          await writeFile(join(root, "app", "dist", "bundle.js"), "console.log(1)\n", "utf8")

          const after = await Snapshot.track()

          if (!before || !after) {
            throw new Error("Expected snapshots to be captured for the test workspace.")
          }

          const diffs = await Snapshot.diffFull(before, after, {
            includeContent: false,
          })

          expect(diffs.map((diff) => diff.file)).toEqual(["app/src/index.ts"])
        },
      })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
