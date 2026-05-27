import { Hono } from "hono"
import { ok, parseQuery } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as WorkspaceFilesUseCase from "#server/usecases/workspace-files.ts"

export function WorkspaceFilesRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/search", async (c) => {
    const query = parseQuery(
      c.req.query(),
      WorkspaceFilesUseCase.WorkspaceSearchQuery,
      "INVALID_QUERY",
      "Query must include a non-empty workspace directory",
    )
    return ok(c, await WorkspaceFilesUseCase.searchWorkspaceFiles(query))
  })

  app.get("/directory", async (c) => {
    const query = parseQuery(
      c.req.query(),
      WorkspaceFilesUseCase.WorkspaceDirectoryQuery,
      "INVALID_QUERY",
      "Query must include a non-empty workspace directory",
    )
    return ok(c, await WorkspaceFilesUseCase.listWorkspaceDirectory(query))
  })

  app.get("/file", async (c) => {
    const query = parseQuery(
      c.req.query(),
      WorkspaceFilesUseCase.WorkspaceFileQuery,
      "INVALID_QUERY",
      "Query must include a workspace directory and file path",
    )
    return ok(c, await WorkspaceFilesUseCase.readWorkspaceFile(query))
  })

  return app
}
