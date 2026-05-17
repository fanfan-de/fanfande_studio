import { afterEach, describe, expect, it } from "bun:test"
import { createGitPullRequest, getGitCapabilities } from "./git.ts"

type CommandResult = {
  stdout?: string
  stderr?: string
  exitCode?: number
}

type CommandCall = {
  binary: string
  args: string[]
  env: Record<string, string | undefined>
}

const originalWhich = Bun.which
const originalSpawn = Bun.spawn

afterEach(() => {
  ;(Bun as unknown as { which: typeof Bun.which }).which = originalWhich
  ;(Bun as unknown as { spawn: typeof Bun.spawn }).spawn = originalSpawn
})

function installCommandMock(results: Record<string, CommandResult>) {
  const calls: CommandCall[] = []

  ;(Bun as unknown as { which: (name: string) => string | null }).which = (name: string) => {
    if (name.startsWith("git")) return "git"
    if (name.startsWith("gh")) return "gh"
    return null
  }
  ;(Bun as unknown as { spawn: (command: string[], options: { env?: Record<string, string | undefined> }) => unknown }).spawn = (
    command,
    options,
  ) => {
    const [binary = "", ...args] = command
    const key = `${binary} ${args.join(" ")}`
    const result = results[key]
    if (!result) {
      throw new Error(`Unexpected command: ${key}`)
    }

    calls.push({
      binary,
      args,
      env: options.env ?? {},
    })

    return {
      stdout: new Response(result.stdout ?? "").body,
      stderr: new Response(result.stderr ?? "").body,
      exited: Promise.resolve(result.exitCode ?? 0),
    }
  }

  return calls
}

function localPrReadyCommands(overrides?: Record<string, CommandResult>) {
  return {
    "git rev-parse --show-toplevel": {
      stdout: "C:\\Projects\\Atlas",
    },
    "git symbolic-ref --quiet --short HEAD": {
      stdout: "feature/git-menu",
    },
    "git rev-parse --verify HEAD": {
      stdout: "abc123",
    },
    "git diff --cached --name-only": {
      stdout: "",
    },
    "git status --porcelain": {
      stdout: " M src/App.tsx",
    },
    "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}": {
      stdout: "origin/feature/git-menu",
    },
    "git rev-list --left-right --count @{upstream}...HEAD": {
      stdout: "0\t1",
    },
    "git symbolic-ref --short refs/remotes/origin/HEAD": {
      stdout: "origin/main",
    },
    ...overrides,
  }
}

describe("git capabilities", () => {
  it("keeps default capability checks local and disables optional git locks for status reads", async () => {
    const calls = installCommandMock(localPrReadyCommands())

    const capabilities = await getGitCapabilities("C:\\Projects\\Atlas\\client")

    expect(capabilities.canCreatePullRequest.enabled).toBe(true)
    expect(calls.some((call) => call.binary === "gh")).toBe(false)
    expect(calls.find((call) => call.args.join(" ") === "diff --cached --name-only")?.env.GIT_OPTIONAL_LOCKS).toBe("0")
    expect(calls.find((call) => call.args.join(" ") === "status --porcelain")?.env.GIT_OPTIONAL_LOCKS).toBe("0")
  })

  it("runs GitHub CLI checks only when remote pull request checks are requested", async () => {
    const calls = installCommandMock(localPrReadyCommands({
      "gh repo view --json url": {
        stdout: "{\"url\":\"https://github.com/example/repo\"}",
      },
      "gh pr list --head feature/git-menu --state open --json url": {
        stdout: "[]",
      },
    }))

    const capabilities = await getGitCapabilities("C:\\Projects\\Atlas\\client", {
      includePullRequestRemoteCheck: true,
    })

    expect(capabilities.canCreatePullRequest.enabled).toBe(true)
    expect(calls.filter((call) => call.binary === "gh").map((call) => call.args.join(" "))).toEqual([
      "repo view --json url",
      "pr list --head feature/git-menu --state open --json url",
    ])
  })

  it("uses remote pull request validation before creating pull requests", async () => {
    const calls = installCommandMock(localPrReadyCommands({
      "gh repo view --json url": {
        stdout: "{\"url\":\"https://github.com/example/repo\"}",
      },
      "gh pr list --head feature/git-menu --state open --json url": {
        stdout: "[{\"url\":\"https://github.com/example/repo/pull/1\"}]",
      },
    }))

    await expect(createGitPullRequest("C:\\Projects\\Atlas\\client")).rejects.toThrow(
      "An open pull request already exists for this branch.",
    )
    expect(calls.some((call) => call.args.join(" ") === "pr create --fill --base main")).toBe(false)
  })
})
