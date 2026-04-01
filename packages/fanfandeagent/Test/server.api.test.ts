import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServerApp } from "#server/server.ts"

interface JsonEnvelope {
  success: boolean
  requestId?: string
  data?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
}

interface SessionResponseEnvelope extends JsonEnvelope {
  data?: {
    id: string
    projectID: string
    directory: string
    title: string
  }
}

interface ProjectRecord {
  id: string
  worktree: string
  name?: string
  created: number
  updated: number
  sandboxes: string[]
}

interface ProjectsResponseEnvelope extends JsonEnvelope {
  data?: ProjectRecord[]
}

interface ProjectSessionsResponseEnvelope extends JsonEnvelope {
  data?: Array<{
    id: string
    projectID: string
    directory: string
    title: string
    time: {
      created: number
      updated: number
    }
  }>
}

interface ProjectResponseEnvelope extends JsonEnvelope {
  data?: ProjectRecord
}

interface DeleteSessionResponseEnvelope extends JsonEnvelope {
  data?: {
    sessionID: string
    projectID: string
  }
}

interface DeleteProjectResponseEnvelope extends JsonEnvelope {
  data?: {
    projectID: string
    deletedSessionIDs: string[]
  }
}

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

describe("server api", () => {
  test("GET /healthz should return request id header", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/healthz")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(200)
    expect(response.headers.get("x-request-id")).toBeString()
    expect(body.success).toBe(true)
    expect(body.data?.ok).toBe(true)
    expect(body.requestId).toBeString()
  })

  test("POST /api/sessions should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("POST /api/projects should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("GET unknown route should return 404 json envelope", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/unknown-route")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("NOT_FOUND")
  })

  test("POST /api/sessions/:id/messages/stream should validate payload", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions/session_1/messages/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("INVALID_PAYLOAD")
  })

  test("POST /api/sessions/:id/messages/stream should return 404 for missing session", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/sessions/session_missing/messages/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    })
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("SESSION_NOT_FOUND")
  })

  test("GET /api/projects should include the project after creating a session", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.projectID).toBeString()

    const response = await app.request("http://localhost/api/projects")
    const body = (await response.json()) as ProjectsResponseEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.some((project) => project.id === createBody.data?.projectID)).toBe(true)
  })

  test("POST /api/projects should create a project and expose its session list", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as ProjectResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.id).toBeString()
    expect(createBody.data?.worktree).toBeString()

    const sessionsResponse = await app.request(`http://localhost/api/projects/${createBody.data!.id}/sessions`)
    const sessionsBody = (await sessionsResponse.json()) as ProjectSessionsResponseEnvelope

    expect(sessionsResponse.status).toBe(200)
    expect(sessionsBody.success).toBe(true)
    expect(Array.isArray(sessionsBody.data)).toBe(true)
    expect(sessionsBody.data?.every((session) => session.projectID === createBody.data?.id)).toBe(true)
  })

  test("POST /api/projects should keep folders in the same git repo under one project", async () => {
    const app = createServerApp()
    const repositoryRoot = await mkdtemp(join(tmpdir(), "fanfande-repo-"))
    const firstDirectory = join(repositoryRoot, "client")
    const secondDirectory = join(repositoryRoot, "server")

    try {
      await createGitRepo(repositoryRoot, "shared-repo")
      await mkdir(firstDirectory, { recursive: true })
      await mkdir(secondDirectory, { recursive: true })

      const firstResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstDirectory }),
      })
      const firstBody = (await firstResponse.json()) as ProjectResponseEnvelope

      const secondResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondDirectory }),
      })
      const secondBody = (await secondResponse.json()) as ProjectResponseEnvelope

      expect(firstResponse.status).toBe(201)
      expect(secondResponse.status).toBe(201)
      expect(firstBody.data?.id).toBeString()
      expect(secondBody.data?.id).toBeString()
      expect(firstBody.data?.id).toBe(secondBody.data?.id)
      expect(firstBody.data?.worktree).toBe(repositoryRoot)
      expect(secondBody.data?.worktree).toBe(repositoryRoot)
      expect(secondBody.data?.name).toBe(repositoryRoot.split(/[\\/]/).filter(Boolean).pop())

      const listResponse = await app.request("http://localhost/api/projects")
      const listBody = (await listResponse.json()) as ProjectsResponseEnvelope

      expect(listResponse.status).toBe(200)
      expect(
        listBody.data?.some(
          (project) =>
            project.id === firstBody.data?.id &&
            project.worktree === repositoryRoot &&
            project.sandboxes.includes(firstDirectory) &&
            project.sandboxes.includes(secondDirectory),
        ),
      ).toBe(true)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })

  test("POST /api/projects should keep different git repos as different projects", async () => {
    const app = createServerApp()
    const firstDirectory = await mkdtemp(join(tmpdir(), "fanfande-project-a-"))
    const secondDirectory = await mkdtemp(join(tmpdir(), "fanfande-project-b-"))

    try {
      await createGitRepo(firstDirectory, "repo-a")
      await createGitRepo(secondDirectory, "repo-b")

      const firstResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: firstDirectory }),
      })
      const firstBody = (await firstResponse.json()) as ProjectResponseEnvelope

      const secondResponse = await app.request("http://localhost/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ directory: secondDirectory }),
      })
      const secondBody = (await secondResponse.json()) as ProjectResponseEnvelope

      expect(firstResponse.status).toBe(201)
      expect(secondResponse.status).toBe(201)
      expect(firstBody.data?.id).toBeString()
      expect(secondBody.data?.id).toBeString()
      expect(firstBody.data?.id).not.toBe(secondBody.data?.id)
      expect(firstBody.data?.worktree).toBe(firstDirectory)
      expect(secondBody.data?.worktree).toBe(secondDirectory)
    } finally {
      await rm(firstDirectory, { recursive: true, force: true })
      await rm(secondDirectory, { recursive: true, force: true })
    }
  })

  test("GET /api/projects/:id/sessions should return sessions for the project", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.success).toBe(true)
    expect(createBody.data?.id).toBeString()
    expect(createBody.data?.projectID).toBeString()

    const response = await app.request(`http://localhost/api/projects/${createBody.data!.projectID}/sessions`)
    const body = (await response.json()) as ProjectSessionsResponseEnvelope

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data?.some((session) => session.id === createBody.data?.id && session.directory === directory)).toBe(true)
  })

  test("GET /api/projects/:id/sessions should return 404 for missing project", async () => {
    const app = createServerApp()
    const response = await app.request("http://localhost/api/projects/project_missing/sessions")
    const body = (await response.json()) as JsonEnvelope

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error?.code).toBe("PROJECT_NOT_FOUND")
  })

  test("POST /api/projects/:id/sessions should create a session for the project", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const projectResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope

    expect(projectResponse.status).toBe(201)
    expect(projectBody.data?.id).toBeString()

    const createSessionResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Backend chat", directory }),
    })
    const createSessionBody = (await createSessionResponse.json()) as SessionResponseEnvelope

    expect(createSessionResponse.status).toBe(201)
    expect(createSessionBody.success).toBe(true)
    expect(createSessionBody.data?.projectID).toBe(projectBody.data?.id)
    expect(createSessionBody.data?.title).toBe("Backend chat")

    const sessionsResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`)
    const sessionsBody = (await sessionsResponse.json()) as ProjectSessionsResponseEnvelope

    expect(sessionsResponse.status).toBe(200)
    expect(sessionsBody.data?.some((session) => session.id === createSessionBody.data?.id)).toBe(true)
  })

  test("DELETE /api/sessions/:id should remove the session", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const createResponse = await app.request("http://localhost/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const createBody = (await createResponse.json()) as SessionResponseEnvelope

    expect(createResponse.status).toBe(201)
    expect(createBody.data?.id).toBeString()

    const deleteResponse = await app.request(`http://localhost/api/sessions/${createBody.data!.id}`, {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeleteSessionResponseEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.success).toBe(true)
    expect(deleteBody.data?.sessionID).toBe(createBody.data?.id)
    expect(deleteBody.data?.projectID).toBe(createBody.data?.projectID)

    const readResponse = await app.request(`http://localhost/api/sessions/${createBody.data!.id}`)
    const readBody = (await readResponse.json()) as JsonEnvelope

    expect(readResponse.status).toBe(404)
    expect(readBody.error?.code).toBe("SESSION_NOT_FOUND")
  })

  test("DELETE /api/projects/:id should remove the project and its sessions", async () => {
    const app = createServerApp()
    const directory = process.cwd()

    const projectResponse = await app.request("http://localhost/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ directory }),
    })
    const projectBody = (await projectResponse.json()) as ProjectResponseEnvelope

    expect(projectResponse.status).toBe(201)
    expect(projectBody.data?.id).toBeString()

    const sessionResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Disposable chat", directory }),
    })
    const sessionBody = (await sessionResponse.json()) as SessionResponseEnvelope

    expect(sessionResponse.status).toBe(201)
    expect(sessionBody.data?.id).toBeString()

    const deleteResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}`, {
      method: "DELETE",
    })
    const deleteBody = (await deleteResponse.json()) as DeleteProjectResponseEnvelope

    expect(deleteResponse.status).toBe(200)
    expect(deleteBody.success).toBe(true)
    expect(deleteBody.data?.projectID).toBe(projectBody.data?.id)
    expect(deleteBody.data?.deletedSessionIDs).toContain(sessionBody.data?.id)

    const projectReadResponse = await app.request(`http://localhost/api/projects/${projectBody.data!.id}`)
    const projectReadBody = (await projectReadResponse.json()) as JsonEnvelope
    expect(projectReadResponse.status).toBe(404)
    expect(projectReadBody.error?.code).toBe("PROJECT_NOT_FOUND")

    const sessionReadResponse = await app.request(`http://localhost/api/sessions/${sessionBody.data!.id}`)
    const sessionReadBody = (await sessionReadResponse.json()) as JsonEnvelope
    expect(sessionReadResponse.status).toBe(404)
    expect(sessionReadBody.error?.code).toBe("SESSION_NOT_FOUND")
  })
})
