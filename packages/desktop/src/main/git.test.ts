import { afterEach, describe, expect, it, vi } from "vitest"
import { commitGitChanges, createGitBranch, getGitCapabilities } from "./git"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

describe("git api client", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requests git capabilities for the provided stable project id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)

      if (url.pathname === "/api/projects/prj_project-atlas/git/capabilities") {
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
            canStageAllCommit: {
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
      projectID: "prj_project-atlas",
      directory: "C:\\Projects\\Atlas\\client",
    })

    expect(result.root).toBe("C:\\Projects\\Atlas")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("posts git branch creation to the provided stable project id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)

      if (url.pathname === "/api/projects/prj_project-atlas/git/branches") {
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
      projectID: "prj_project-atlas",
      directory: "C:\\Projects\\Atlas\\client",
      name: "feature/refactor",
    })

    expect(result.branch).toBe("feature/refactor")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("passes stageAll through git commit requests", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url)

      if (url.pathname === "/api/projects/prj_project-atlas/git/commit") {
        expect(init?.method).toBe("POST")
        expect(init?.body).toBe(
          JSON.stringify({
            directory: "C:\\Projects\\Atlas\\client",
            message: "chore: stage all",
            stageAll: true,
          }),
        )

        return jsonResponse({
          success: true,
          data: {
            directory: "C:\\Projects\\Atlas\\client",
            root: "C:\\Projects\\Atlas",
            branch: "main",
            stdout: "",
            stderr: "",
            summary: "Committed to main.",
          },
        })
      }

      throw new Error(`Unexpected request: ${url.pathname}${url.search}`)
    })

    vi.stubGlobal("fetch", fetchMock)

    const result = await commitGitChanges({
      projectID: "prj_project-atlas",
      directory: "C:\\Projects\\Atlas\\client",
      message: "chore: stage all",
      stageAll: true,
    })

    expect(result.summary).toBe("Committed to main.")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
