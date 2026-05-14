import { describe, expect, it } from "vitest"
import { getWorkspaceGitDiff, restoreWorkspaceDiffFile, reverseApplyWorkspaceDiffPatches } from "./workspace-diff"

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

      if (command.includes("diff --no-index --no-ext-diff")) {
        return {
          exitCode: 1,
          stderr: "",
          stdout: [
            "diff --git a/C:/tmp/empty b/notes.txt",
            "--- a/C:/tmp/empty",
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

      if (command.includes("diff --no-index --no-ext-diff")) {
        return {
          exitCode: 1,
          stderr: "",
          stdout: [
            "diff --git a/C:/tmp/empty b/random.txt",
            "--- a/C:/tmp/empty",
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

  it("restores tracked file changes to HEAD", async () => {
    const commands: string[] = []
    const runner = async (args: string[]) => {
      const command = args.join(" ")
      commands.push(command)

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

      if (command.includes("ls-files --error-unmatch -- src/App.tsx")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "src/App.tsx\n",
        }
      }

      if (command.includes("restore --source=HEAD --staged --worktree -- src/App.tsx")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    await expect(
      restoreWorkspaceDiffFile(
        {
          directory: "C:\\Projects\\Atlas\\client",
          file: "src\\App.tsx",
        },
        runner,
      ),
    ).resolves.toEqual({
      directory: "C:\\Projects\\Atlas\\client",
      file: "src/App.tsx",
    })
    expect(commands).toContain(
      "-C C:\\Projects\\Atlas\\client restore --source=HEAD --staged --worktree -- src/App.tsx",
    )
  })

  it("cleans untracked file changes", async () => {
    const commands: string[] = []
    const runner = async (args: string[]) => {
      const command = args.join(" ")
      commands.push(command)

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

      if (command.includes("ls-files --error-unmatch -- notes.txt")) {
        return {
          exitCode: 1,
          stderr: "",
          stdout: "",
        }
      }

      if (command.includes("clean -f -- notes.txt")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    await restoreWorkspaceDiffFile(
      {
        directory: "C:\\Projects\\Atlas\\client",
        file: "notes.txt",
      },
      runner,
    )
    expect(commands).toContain("-C C:\\Projects\\Atlas\\client clean -f -- notes.txt")
  })

  it("removes tracked-in-index files when a repository has no HEAD", async () => {
    const commands: string[] = []
    const runner = async (args: string[]) => {
      const command = args.join(" ")
      commands.push(command)

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

      if (command.includes("ls-files --error-unmatch -- src/App.tsx")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "src/App.tsx\n",
        }
      }

      if (command.includes("rm -f -- src/App.tsx")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    await restoreWorkspaceDiffFile(
      {
        directory: "C:\\Projects\\NewRepo",
        file: "src/App.tsx",
      },
      runner,
    )
    expect(commands).toContain("-C C:\\Projects\\NewRepo rm -f -- src/App.tsx")
  })

  it("rejects invalid restore targets", async () => {
    const gitRunner = async (args: string[]) => {
      const command = args.join(" ")

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
    const nonGitRunner = async (args: string[]) => {
      if (args.join(" ").includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 128,
          stderr: "fatal: not a git repository",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${args.join(" ")}`)
    }

    await expect(
      restoreWorkspaceDiffFile(
        {
          directory: "C:\\Projects\\Scratch",
          file: "src/App.tsx",
        },
        nonGitRunner,
      ),
    ).rejects.toThrow("Workspace directory must be inside a git repository.")
    await expect(
      restoreWorkspaceDiffFile(
        {
          directory: "C:\\Projects\\Atlas\\client",
          file: "",
        },
        gitRunner,
      ),
    ).rejects.toThrow("Workspace diff file is required.")
    await expect(
      restoreWorkspaceDiffFile(
        {
          directory: "C:\\Projects\\Atlas\\client",
          file: "../secret.txt",
        },
        gitRunner,
      ),
    ).rejects.toThrow("Workspace diff file must stay within the current project.")
  })

  it("reverse-applies patch text after checking it", async () => {
    const commands: string[] = []
    const inputs: string[] = []
    const runner = async (args: string[], options: { input?: string }) => {
      const command = args.join(" ")
      commands.push(command)
      if (options.input !== undefined) inputs.push(options.input)

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      if (command.includes("apply -R --check") || command.includes("apply -R")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    await expect(
      reverseApplyWorkspaceDiffPatches(
        {
          directory: "C:\\Projects\\Atlas\\client",
          diffs: [
            {
              file: "src/App.tsx",
              patch: [
                "diff --git a/src/App.tsx b/src/App.tsx",
                "--- a/src/App.tsx",
                "+++ b/src/App.tsx",
                "@@ -1 +1 @@",
                "-old",
                "+new",
              ].join("\n"),
            },
          ],
        },
        runner,
      ),
    ).resolves.toEqual({
      directory: "C:\\Projects\\Atlas\\client",
      restored: [{ file: "src/App.tsx" }],
      failed: [],
    })
    expect(commands).toContain("-C C:\\Projects\\Atlas\\client apply -R --check")
    expect(commands).toContain("-C C:\\Projects\\Atlas\\client apply -R")
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toContain("diff --git a/src/App.tsx b/src/App.tsx")
  })

  it("continues reverse-applying later files after a patch fails", async () => {
    const commands: string[] = []
    const runner = async (args: string[], options: { input?: string }) => {
      const command = args.join(" ")
      commands.push(command)

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      if (command.includes("apply -R --check") && options.input?.includes("src/App.tsx")) {
        return {
          exitCode: 1,
          stderr: "error: patch does not apply",
          stdout: "",
        }
      }

      if (command.includes("apply -R --check") || command.includes("apply -R")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    const result = await reverseApplyWorkspaceDiffPatches(
      {
        directory: "C:\\Projects\\Atlas\\client",
        diffs: [
          {
            file: "src/App.tsx",
            patch: "diff --git a/src/App.tsx b/src/App.tsx\n--- a/src/App.tsx\n+++ b/src/App.tsx\n@@ -1 +1 @@\n-old\n+new",
          },
          {
            file: "src/styles.css",
            patch: "diff --git a/src/styles.css b/src/styles.css\n--- a/src/styles.css\n+++ b/src/styles.css\n@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
      runner,
    )

    expect(result).toEqual({
      directory: "C:\\Projects\\Atlas\\client",
      restored: [{ file: "src/styles.css" }],
      failed: [{ file: "src/App.tsx", message: "error: patch does not apply" }],
    })
    expect(commands.filter((command) => command.includes("apply -R --check"))).toHaveLength(2)
    expect(commands.filter((command) => command.includes("apply -R") && !command.includes("--check"))).toHaveLength(1)
  })

  it("reports missing patch text without restoring the whole file", async () => {
    const commands: string[] = []
    const runner = async (args: string[]) => {
      const command = args.join(" ")
      commands.push(command)

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    const result = await reverseApplyWorkspaceDiffPatches(
      {
        directory: "C:\\Projects\\Atlas\\client",
        diffs: [{ file: "src/App.tsx" }],
      },
      runner,
    )

    expect(result).toEqual({
      directory: "C:\\Projects\\Atlas\\client",
      restored: [],
      failed: [{ file: "src/App.tsx", message: "Patch text is required for precise undo." }],
    })
    expect(commands.some((command) => command.includes("restore --source=HEAD"))).toBe(false)
    expect(commands.some((command) => command.includes("clean -f"))).toBe(false)
  })

  it("rejects reverse patches whose headers target another file or escape the workspace", async () => {
    const runner = async (args: string[]) => {
      const command = args.join(" ")

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    const result = await reverseApplyWorkspaceDiffPatches(
      {
        directory: "C:\\Projects\\Atlas\\client",
        diffs: [
          {
            file: "src/App.tsx",
            patch: "diff --git a/src/Other.tsx b/src/Other.tsx\n--- a/src/Other.tsx\n+++ b/src/Other.tsx\n@@ -1 +1 @@\n-old\n+new",
          },
          {
            file: "src/App.tsx",
            patch: "diff --git a/../secret.txt b/../secret.txt\n--- a/../secret.txt\n+++ b/../secret.txt\n@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
      runner,
    )

    expect(result.restored).toEqual([])
    expect(result.failed[0]).toEqual({
      file: "src/App.tsx",
      message: "Patch path 'src/Other.tsx' does not match 'src/App.tsx'.",
    })
    expect(result.failed[1]).toEqual({
      file: "src/App.tsx",
      message: "Workspace diff file must stay within the current project.",
    })
  })

  it("wraps hunk-only patch text for the declared file before reverse-applying", async () => {
    let checkedPatch = ""
    const runner = async (args: string[], options: { input?: string }) => {
      const command = args.join(" ")

      if (command.includes("rev-parse --show-toplevel")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "C:\\Projects\\Atlas\n",
        }
      }

      if (command.includes("apply -R --check")) {
        checkedPatch = options.input ?? ""
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      if (command.includes("apply -R")) {
        return {
          exitCode: 0,
          stderr: "",
          stdout: "",
        }
      }

      throw new Error(`Unexpected command: ${command}`)
    }

    await reverseApplyWorkspaceDiffPatches(
      {
        directory: "C:\\Projects\\Atlas\\client",
        diffs: [
          {
            file: "src/App.tsx",
            patch: "@@ -1 +1 @@\n-old\n+new",
          },
        ],
      },
      runner,
    )

    expect(checkedPatch).toBe([
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "",
    ].join("\n"))
  })
})
