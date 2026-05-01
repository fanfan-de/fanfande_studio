import { beforeEach, describe, expect, mock, test } from "bun:test"
import "./sqlite.cleanup.ts"

let capturedGenerateInput: Record<string, unknown> | null = null
let capturedModelLookups: Array<{ providerID: string; modelID: string; configID?: string }> = []
let generateTextResult = `"Session rename pipeline"\nextra`
let generateTextError: Error | null = null
let selectedSmallModel: string | undefined = "small/small-model"

mock.module("ai", () => ({
  generateText: async (input: Record<string, unknown>) => {
    capturedGenerateInput = input
    if (generateTextError) throw generateTextError
    return {
      text: generateTextResult,
    }
  },
}))

mock.module("#provider/provider.ts", () => ({
  getSelection: async () => ({
    small_model: selectedSmallModel,
  }),
  getModel: async (providerID: string, modelID: string, configID?: string) => {
    capturedModelLookups.push({ providerID, modelID, configID })
    return {
      providerID,
      id: modelID,
    }
  },
  getLanguage: async (model: Record<string, unknown>) => model,
}))

const SessionTitle = await import("#session/support/title.ts")
const Session = await import("#session/core/session.ts")

beforeEach(() => {
  capturedGenerateInput = null
  capturedModelLookups = []
  generateTextResult = `"Session rename pipeline"\nextra`
  generateTextError = null
  selectedSmallModel = "small/small-model"
})

describe("session title generation", () => {
  test("uses the configured small model and normalizes generated titles", async () => {
    const title = await SessionTitle.generateSessionTitle({
      projectID: "project_title",
      fallbackModel: {
        providerID: "primary",
        id: "large-model",
      } as never,
      parts: [
        {
          id: "part_text",
          sessionID: "session_title",
          messageID: "message_title",
          type: "text",
          text: "fix session title generation pipeline",
        } as never,
      ],
    })

    expect(title).toBe("Session rename pipeline")
    expect(capturedModelLookups).toEqual([
      {
        providerID: "small",
        modelID: "small-model",
        configID: "project_title",
      },
    ])
    expect(capturedGenerateInput).toMatchObject({
      model: {
        providerID: "small",
        id: "small-model",
      },
      temperature: 0,
    })
  })

  test("falls back to user text when title generation fails", async () => {
    generateTextError = new Error("title generation failed")

    const title = await SessionTitle.generateSessionTitle({
      projectID: "project_title",
      fallbackModel: {
        providerID: "primary",
        id: "large-model",
      } as never,
      parts: [
        {
          id: "part_text",
          sessionID: "session_title",
          messageID: "message_title",
          type: "text",
          text: "当前自动给session取名的模块似乎失效了，确认一下原因",
        } as never,
      ],
    })

    expect(title).toBe("当前自动给session取名的模块似乎失效了，确认一下原因")
  })
})

describe("session title persistence", () => {
  test("updates the stored title when the session still has the default title", async () => {
    const session = await Session.createSession({
      directory: process.cwd(),
      projectID: "project_session_title",
    })

    const updated = Session.updateSessionTitle(session.id, "Investigate session naming", {
      ifCurrentTitle: Session.DEFAULT_SESSION_TITLE,
    })
    const stored = Session.DataBaseRead("sessions", session.id) as typeof session | null

    expect(updated?.title).toBe("Investigate session naming")
    expect(stored?.title).toBe("Investigate session naming")
  })

  test("does not overwrite a non-default title when guarded by the current title", async () => {
    const session = await Session.createSession({
      directory: process.cwd(),
      projectID: "project_custom_title",
      title: "Custom title",
    })

    const updated = Session.updateSessionTitle(session.id, "Should not apply", {
      ifCurrentTitle: Session.DEFAULT_SESSION_TITLE,
    })
    const stored = Session.DataBaseRead("sessions", session.id) as typeof session | null

    expect(updated?.title).toBe("Custom title")
    expect(stored?.title).toBe("Custom title")
  })
})
