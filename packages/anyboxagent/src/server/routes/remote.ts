import { Hono } from "hono"
import { ok, parseJsonBody, parseQuery } from "#server/http.ts"
import type { AppEnv } from "#server/types.ts"
import * as RemoteSshUseCase from "#server/usecases/remote-ssh.ts"

export function RemoteRoutes() {
  const app = new Hono<AppEnv>()

  app.get("/ssh/profiles", async (c) => ok(c, await RemoteSshUseCase.listSshProfiles()))

  app.post("/ssh/profiles", async (c) => {
    const payload = await parseJsonBody(
      c,
      RemoteSshUseCase.SaveSshProfileBody,
      "Body must include a valid SSH profile",
    )
    return ok(c, await RemoteSshUseCase.saveSshProfile(payload), 201)
  })

  app.delete("/ssh/profiles/:id", async (c) => ok(c, await RemoteSshUseCase.deleteSshProfile(c.req.param("id"))))

  app.post("/ssh/profiles/:id/test", async (c) => ok(c, await RemoteSshUseCase.testSshProfile(c.req.param("id"))))

  app.get("/ssh/profiles/:id/directories", async (c) => {
    const query = parseQuery(
      c.req.query(),
      RemoteSshUseCase.SshDirectoryQuery,
      "INVALID_QUERY",
      "Query parameter 'path' must be a string when provided",
    )
    return ok(c, await RemoteSshUseCase.listSshDirectory(c.req.param("id"), query))
  })

  return app
}
