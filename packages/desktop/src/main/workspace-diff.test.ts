import { describe, expect, it } from "vitest"
import { getWorkspaceGitDiff } from "./workspace-diff"

describe("workspace git diff", () => {
  it("builds a workspace diff from tracked and untracked changes", async () => {
    const runner = async (args: string[]) => {
      const command = args.join(" ")

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      if (command.includes("rev-parse --verify HEAD")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "abc123\n",
        }
      }

      if (command.includes("diff --name-only --relative HEAD")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "src/App.tsx\n",
        }
      }

      if (command.includes("ls-files --others --exclude-standard")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "notes.txt\0",
        }
      }

      if (command.includes("diff --no-ext-diff --no-renames --relative HEAD -- src/App.tsx")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: [
            "diff --git a/src/App.tsx b/src/App.tsx",
            "--- a/src/App.tsx",
            "+++ b/src/App.tsx",
            "@@ -1,2 +1,3 @@",
            " import { App } from './App'",
            "+import { WorkspaceDiff } from './WorkspaceDiff'",
            " export default App",
          ].join("\n"),
        }
      }

      if (command.includes("diff --no-ext-diff --no-renames --relative HEAD -- notes.txt")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      if (command.includes("diff --no-index --no-ext-diff --label a/notes.txt --label b/notes.txt")) {
        return {
          exitCode: 1,
          stderr: "",
          stdout: [
            "diff --git a/notes.txt b/notes.txt",
            "--- a/notes.txt",
            "+++ b/notes.txt",
            "@@ -0,0 +1 @@",
            "+hello world",
          ].join("\n"),
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    const result = await getWorkspaceGitDiff("C:\\Projects\\Atlas\\client", runner)

    expect(result).toMatchObject({
      stats: {
        files: 2,
        additions: 2,
        deletions: 0,
      },
    })
    expect(result?.diffs.map((diff) => diff.file)).toEqual(["src/App.tsx", "notes.txt"])
  })

  it("treats a repo without HEAD as a workspace diff against an empty tree", async () => {
    const runner = async (args: string[]) => {
      const command = args.join(" ")

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\NewRepo\n",
        }
      }

      if (command.includes("rev-parse --verify HEAD")) {
        return {
          exitCode: 128,
          stderr: "fatal: Needed a single revision",
          stdout: "",
        }
      }

      if (command.includes("ls-files --cached --others --exclude-standard")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "random.txt\0",
        }
      }

      if (command.includes("diff --no-index --no-ext-diff --label a/random.txt --label b/random.txt")) {
        return {
          exitCode: 1,
          stderr: "",
          stdout: [
            "diff --git a/random.txt b/random.txt",
            "--- a/random.txt",
            "+++ b/random.txt",
            "@@ -0,0 +1 @@",
            "+Random content",
          ].join("\n"),
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    const result = await getWorkspaceGitDiff("C:\\Projects\\NewRepo", runner)

    expect(result?.stats).toEqual({
      files: 1,
      additions: 1,
      deletions: 0,
    })
    expect(result?.diffs[0]).toMatchObject({
      file: "random.txt",
      additions: 1,
      deletions: 0,
    })
  })

  it("returns null when the directory is not inside a git repository", async () => {
    const runner = async (args: string[]) => {
      if (args.join(" ").includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 128,
          stderr: "fatal: not a git repository",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${args.join(" ")}`)
    }

    await expect(getWorkspaceGitDiff("C:\\Projects\\Scratch", runner)).resolves.toBeNull()
  })
})
