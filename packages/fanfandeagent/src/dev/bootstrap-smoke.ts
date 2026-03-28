import path from "path"

import { Instance } from "#project/instance.ts"
import * as Session from "#session/session.ts"

const directory = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()

const result = await Instance.provide({
  directory,
  async fn() {
    const session = await Session.createSession({
      directory: Instance.directory,
      projectID: Instance.project.id,
    })

    const restored = Session.DataBaseRead("sessions", session.id)
    if (!restored) {
      throw new Error(`failed to read back session ${session.id}`)
    }

    return {
      directory: Instance.directory,
      worktree: Instance.worktree,
      project: Instance.project,
      session,
    }
  },
})

console.log(JSON.stringify(result, null, 2))
