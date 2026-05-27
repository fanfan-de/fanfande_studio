import { describe, expect, it } from "vitest"
import { buildModelSelectionUpdatePayload } from "./use-settings-page"
import type { ProjectModelSelection } from "./types"

function createSelection(selection: Partial<ProjectModelSelection>): ProjectModelSelection {
  return {
    model: null,
    smallModel: null,
    reasoningEffort: null,
    imageModel: null,
    imageDefaultSize: null,
    imageDefaultCount: null,
    ...selection,
  }
}

describe("buildModelSelectionUpdatePayload", () => {
  it("only sends the primary model when unchanged secondary model selection is stale", () => {
    const savedSelection = createSelection({
      model: "anybox/deepseek-v4-pro",
      smallModel: "anybox/deepseek-v4-flash",
    })
    const nextSelection = createSelection({
      model: "openai/gpt-5.4",
      smallModel: "anybox/deepseek-v4-flash",
    })

    expect(buildModelSelectionUpdatePayload(savedSelection, nextSelection)).toEqual({
      model: "openai/gpt-5.4",
    })
  })

  it("sends null when the small model is explicitly cleared", () => {
    const savedSelection = createSelection({
      model: "openai/gpt-5.4",
      smallModel: "anybox/deepseek-v4-flash",
    })
    const nextSelection = createSelection({
      model: "openai/gpt-5.4",
      smallModel: null,
    })

    expect(buildModelSelectionUpdatePayload(savedSelection, nextSelection)).toEqual({
      small_model: null,
    })
  })
})
