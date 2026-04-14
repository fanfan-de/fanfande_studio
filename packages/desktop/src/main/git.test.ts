import { afterEach, describe, expect, it, vi } from "vitest"
import { createGitBranch, getGitCapabilities } from "./git"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

describe("git project reconciliation", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("retries git capability lookups against the canonical project when the current project id is stale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)

      if (url.pathname === "/api/projects/global/git/capabilities") {
        return jsonResponse(
          {
            success: false,
            error: {
              code: "DIRECTORY_NOT_IN_PROJECT",
              message: "Directory is no longer part of project 'global'.",
            },
          },
          400,
        )
      }

      if (url.pathname === "/api/projects" && url.search === "") {
        return jsonResponse({
          success: true,
          data: {
            id: "project-atlas",
            worktree: "C:\\Projects\\Atlas",
            name: "Atlas",
            created: 1,
            updated: 2,
            sandboxes: [],
          },
        })
      }

      if (url.pathname === "/api/projects/project-atlas/git/capabilities") {
        return jsonResponse({
          success: true,
          data: {
            directory: "C:\\Projects\\Atlas\\client",
            root: "C:\\Projects\\Atlas",
            branch: "main",
            defaultBranch: "main",
            isGitRepo: true,
            canCommit: {
              enabled: true,
            },
            canPush: {
              enabled: false,
            },
            canCreatePullRequest: {
              enabled: false,
            },
            canCreateBranch: {
              enabled: true,
            },
          },
        })
      }

      throw new Error(`Unexpected request: ${url.pathname}${url.search}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await getGitCapabilities({
      projectID: "global",
      directory: "C:\\Projects\\Atlas\\client",
    })

    expect(result.projectID).toBe("project-atlas")
    expect(result.root).toBe("C:\\Projects\\Atlas")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("retries git write actions against the canonical project when the current project id is stale", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)

      if (url.pathname === "/api/projects/global/git/branches") {
        return jsonResponse(
          {
            success: false,
            error: {
              code: "DIRECTORY_NOT_IN_PROJECT",
              message: "Directory is no longer part of project 'global'.",
            },
          },
          400,
        )
      }

      if (url.pathname === "/api/projects" && url.search === "") {
        return jsonResponse({
          success: true,
          data: {
            id: "project-atlas",
            worktree: "C:\\Projects\\Atlas",
            name: "Atlas",
            created: 1,
            updated: 2,
            sandboxes: [],
          },
        })
      }

      if (url.pathname === "/api/projects/project-atlas/git/branches") {
        expect(init?.method).toBe("POST")
        return jsonResponse({
          success: true,
          data: {
            directory: "C:\\Projects\\Atlas\\client",
            root: "C:\\Projects\\Atlas",
            branch: "feature/refactor",
            stdout: "",
            stderr: "",
            summary: "Created and switched to feature/refactor.",
          },
        })
      }

      throw new Error(`Unexpected request: ${url.pathname}${url.search}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await createGitBranch({
      projectID: "global",
      directory: "C:\\Projects\\Atlas\\client",
      name: "feature/refactor",
    })

    expect(result.projectID).toBe("project-atlas")
    expect(result.branch).toBe("feature/refactor")
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
