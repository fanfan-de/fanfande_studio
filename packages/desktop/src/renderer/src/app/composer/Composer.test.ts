import type { LexicalEditor } from "lexical"
import { describe, expect, it } from "vitest"
import { buildMenuStyle, getComposerKeyAction, shouldApplyExternalComposerDraftState } from "./Composer"
import { createComposerDraftStateFromPlainText } from "./draft-state"

function createEditorStateMock(lexicalJSON: string) {
  const json = JSON.parse(lexicalJSON)

  return {
    getEditorState() {
      return {
        toJSON() {
          return json
        },
      }
    },
  } as Pick<LexicalEditor, "getEditorState">
}

describe("shouldApplyExternalComposerDraftState", () => {
  it("skips reapplying a draft state that already matches the current editor contents", () => {
    const draftState = createComposerDraftStateFromPlainText("Keep the local composer selection intact")

    expect(shouldApplyExternalComposerDraftState(createEditorStateMock(draftState.lexicalJSON), draftState.lexicalJSON)).toBe(false)
  })

  it("applies external draft changes when the serialized editor state differs", () => {
    const currentDraftState = createComposerDraftStateFromPlainText("Current draft")
    const nextDraftState = createComposerDraftStateFromPlainText("Current draft plus external update")

    expect(shouldApplyExternalComposerDraftState(createEditorStateMock(currentDraftState.lexicalJSON), nextDraftState.lexicalJSON)).toBe(true)
  })
})

describe("buildMenuStyle", () => {
  it("positions the command menu above the active composer selection", () => {
    const anchorRect = {
      left: 196,
      top: 412,
    } as DOMRect
    const containerRect = {
      left: 140,
      bottom: 620,
    } as DOMRect

    expect(buildMenuStyle(anchorRect, containerRect)).toEqual({
      left: "56px",
      bottom: "218px",
    })
  })
})

describe("getComposerKeyAction", () => {
  it("uses Enter to select the active command when the menu has options", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        isSubmitKeyEvent: true,
        hasCommandMenu: true,
        commandMenuItemCount: 4,
      }),
    ).toEqual({
      type: "select-active",
      preventDefault: true,
    })
  })

  it("blocks Enter from sending while a visible menu has no available options", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        isSubmitKeyEvent: true,
        hasCommandMenu: true,
        commandMenuItemCount: 0,
      }),
    ).toEqual({
      type: "noop",
      preventDefault: true,
    })
  })

  it("keeps arrow navigation passive when the visible menu is empty", () => {
    expect(
      getComposerKeyAction({
        key: "ArrowDown",
        isSubmitKeyEvent: false,
        hasCommandMenu: true,
        commandMenuItemCount: 0,
      }),
    ).toEqual({
      type: "noop",
      preventDefault: false,
    })
  })

  it("preserves Enter-to-send when no command menu is visible", () => {
    expect(
      getComposerKeyAction({
        key: "Enter",
        isSubmitKeyEvent: true,
        hasCommandMenu: false,
        commandMenuItemCount: 0,
      }),
    ).toEqual({
      type: "send",
      preventDefault: true,
    })
  })
})
