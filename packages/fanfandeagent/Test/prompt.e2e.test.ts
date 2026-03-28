import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"

test("prompt flow from directory entry to assistant reply", async () => {
  expect(process.env.DEEPSEEK_API_KEY).toBeTruthy()

  const workspaceRoot = process.cwd()
  const tempRoot = path.join(workspaceRoot, "Test", ".tmp")
  const targetDirectory = path.join(
    tempRoot,
    `prompt-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )

  await fs.mkdir(targetDirectory, { recursive: true })

  try {
    const { Instance } = await import("#project/instance.ts")
    const Session = await import("#session/session.ts")
    const { prompt } = await import("#session/prompt.ts")

    const result = await Instance.provide({
      directory: targetDirectory,
      async fn() {
        expect(Instance.directory).toBe(targetDirectory)

        const session = await Session.createSession({
          directory: Instance.directory,
          projectID: Instance.project.id,
        })

        const promptResult = await prompt({
          sessionID: session.id,
          parts: [
            {
              type: "text",
              text: "介绍一下埃菲尔铁塔",
              time: {
                start: Date.now(),
              },
            },
          ],
        })

        expect(promptResult.info.role).toBe("assistant")

        const textParts = promptResult.parts.filter((part) => part.type === "text") as Array<{
          type: "text"
          text: string
        }>
        expect(textParts.length).toBeGreaterThan(0)

        const assistantText = textParts.map((part) => part.text).join("")
        expect(assistantText.length).toBeGreaterThan(0)

        const restoredSession = Session.DataBaseRead("sessions", session.id)
        expect(restoredSession?.directory).toBe(Instance.directory)

        const restoredAssistant = Session.DataBaseRead("messages", promptResult.info.id)
        expect(restoredAssistant?.role).toBe("assistant")

        return {
          directory: Instance.directory,
          sessionID: session.id,
          assistantID: promptResult.info.id,
          assistantText,
        }
      },
    })

    expect(result.directory).toBe(targetDirectory)
    expect(result.assistantText.length).toBeGreaterThan(0)
    expect(result.sessionID).toBeTruthy()
    expect(result.assistantID).toBeTruthy()
  } finally {
    await fs.rm(targetDirectory, { recursive: true, force: true })
  }
}, 120000)
