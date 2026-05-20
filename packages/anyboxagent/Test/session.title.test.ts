import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import * as Provider from "#provider/provider.ts"
import * as SessionTitle from "#session/support/title.ts"
import * as Session from "#session/core/session.ts"

let capturedGenerateInput: Record<string, unknown> | null = null
let capturedModelLookups: Array<{ providerID: string; modelID: string; configID?: string }> = []
let generateTextResult = `"Session rename pipeline"\nextra`
let generateTextError: Error | null = null
let selectedSmallModel: string | undefined = "small/small-model"
let restoreProvider: (() => void) | undefined
let restoreTitle: (() => void) | undefined

function createTestModel(providerID: string, modelID: string): Provider.Model {
  return {
    ...Provider.testDeepSeekModel,
    providerID,
    id: modelID,
    api: {
      ...Provider.testDeepSeekModel.api,
      id: modelID,
      url: "https://example.test/v1",
    },
    capabilities: {
      ...Provider.testDeepSeekModel.capabilities,
      input: {
        ...Provider.testDeepSeekModel.capabilities.input,
      },
      output: {
        ...Provider.testDeepSeekModel.capabilities.output,
      },
    },
  }
}

beforeEach(() => {
  capturedGenerateInput = null
  capturedModelLookups = []
  generateTextResult = `"Session rename pipeline"\nextra`
  generateTextError = null
  selectedSmallModel = "small/small-model"
  restoreProvider = Provider.setProviderFunctionOverridesForTesting({
    getSelection: async () => ({
      small_model: selectedSmallModel,
    }),
    getModel: async (providerID: string, modelID: string, configID?: string) => {
      capturedModelLookups.push({ providerID, modelID, configID })
      return createTestModel(providerID, modelID)
    },
    getLanguage: async (model) => model as never,
  })
  restoreTitle = SessionTitle.setRuntimeDependenciesForTesting({
    getGenerateText: async () => async (input: Record<string, unknown>) => {
      capturedGenerateInput = input
      if (generateTextError) throw generateTextError
      return {
        text: generateTextResult,
      } as never
    },
  })
})

afterEach(() => {
  restoreTitle?.()
  restoreProvider?.()
  restoreTitle = undefined
  restoreProvider = undefined
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
