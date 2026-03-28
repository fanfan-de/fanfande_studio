import { test, expect } from "bun:test"
import { Instance } from "#project/instance.ts"
import * as Session from "#session/session.ts"

test("instance -> project -> session -> sqlite flow works", async () => {
  const cwd = process.cwd()

  const result = await Instance.provide({
    directory: cwd,
    async fn() {
      expect(Instance.directory).toBe(cwd)
      expect(Instance.worktree.length).toBeGreaterThan(0)
      expect(Instance.project.id).toBeTruthy()
      expect(Instance.project.initialized).toBeTypeOf("number")

      const session = await Session.createSession({
        directory: Instance.directory,
        projectID: Instance.project.id,
      })

      const restored = Session.DataBaseRead("sessions", session.id)
      expect(restored).not.toBeNull()
      expect(restored?.id).toBe(session.id)
      expect(restored?.projectID).toBe(Instance.project.id)
      expect(restored?.directory).toBe(Instance.directory)

      return {
        directory: Instance.directory,
        worktree: Instance.worktree,
        projectID: Instance.project.id,
        sessionID: session.id,
      }
    },
  })

  expect(result.directory).toBe(cwd)
  expect(result.projectID).toBeTruthy()
  expect(result.sessionID).toBeTruthy()
}, 120000)
