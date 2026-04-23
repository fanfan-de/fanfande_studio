import { describe, expect, it } from "vitest"
import type { ComposerCommentReference, ComposerMcpOption, ComposerSkillOption } from "../types"
import {
  appendComposerTagToDraftState,
  appendTextToComposerDraftState,
  compileComposerSubmission,
  createComposerCommentTagData,
  createComposerDraftStateFromPlainText,
  createComposerFileTagData,
  createComposerMcpTagData,
  createComposerSkillTagData,
  createEmptyComposerDraftState,
  readComposerTagsFromDraftState,
  removeComposerTagFromDraftState,
  syncComposerMcpTagsWithSelection,
} from "./draft-state"

const SKILL_OPTION: ComposerSkillOption = {
  value: "build-web-apps:react-best-practices",
  label: "React Best Practices",
  description: "Review React component structure and performance",
}

const MCP_OPTIONS: ComposerMcpOption[] = [
  {
    value: "filesystem",
    label: "Filesystem",
    description: "Browse and inspect local files",
  },
  {
    value: "browser",
    label: "Browser",
    description: "Automate browser verification",
  },
]

function createCommentReference(): ComposerCommentReference {
  return {
    id: "comment-1",
    filePath: "src/App.tsx",
    startLineNumber: 10,
    endLineNumber: 14,
    label: "App.tsx:10-14",
    title: "src/App.tsx (lines 10-14)",
    prompt: "Review the selected lines before making changes.",
  }
}

describe("composer draft-state", () => {
  it("serializes tags and plain text into a compiled submission", () => {
    let draftState = createComposerDraftStateFromPlainText("Implement the composer with Lexical.")
    draftState = appendComposerTagToDraftState(draftState, createComposerFileTagData("src/app/components.tsx"))
    draftState = appendComposerTagToDraftState(draftState, createComposerCommentTagData(createCommentReference()))
    draftState = appendComposerTagToDraftState(draftState, createComposerSkillTagData(SKILL_OPTION))
    draftState = appendComposerTagToDraftState(draftState, createComposerMcpTagData(MCP_OPTIONS[0]!))

    const compiled = compileComposerSubmission({
      draftState,
      selectedSkillIDs: ["existing-skill"],
    })

    expect(compiled.displayText).toContain("Implement the composer with Lexical.")
    expect(compiled.displayText).toContain("@src/app/components.tsx")
    expect(compiled.displayText).toContain("@App.tsx:10-14")
    expect(compiled.taggedFilePaths).toEqual(["src/app/components.tsx"])
    expect(compiled.taggedMcpServerIDs).toEqual(["filesystem"])
    expect(compiled.commentReferences).toHaveLength(1)
    expect(compiled.selectedSkillIDs).toEqual(["existing-skill", SKILL_OPTION.value])
    expect(compiled.transportText).toContain("Referenced files:\n- src/app/components.tsx")
    expect(compiled.transportText).toContain("Review the selected lines before making changes.")
  })

  it("adds plain text in a new paragraph without dropping existing tags", () => {
    let draftState = createEmptyComposerDraftState()
    draftState = appendComposerTagToDraftState(draftState, createComposerSkillTagData(SKILL_OPTION))
    draftState = appendTextToComposerDraftState(draftState, "Add command menus next.")

    const tags = readComposerTagsFromDraftState(draftState)
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatchObject({
      kind: "skill",
      skillID: SKILL_OPTION.value,
    })
    expect(draftState.plainText).toContain("@React Best Practices")
    expect(draftState.plainText).toContain("Add command menus next.")
  })

  it("removes a comment tag by reference id", () => {
    const commentReference = createCommentReference()
    let draftState = createComposerDraftStateFromPlainText("Need feedback.")
    draftState = appendComposerTagToDraftState(draftState, createComposerCommentTagData(commentReference))

    const nextDraftState = removeComposerTagFromDraftState(draftState, commentReference.id)

    expect(readComposerTagsFromDraftState(nextDraftState)).toEqual([])
    expect(nextDraftState.plainText).toBe("Need feedback.")
  })

  it("keeps MCP tags aligned with the selected project MCP list", () => {
    let draftState = createComposerDraftStateFromPlainText("Check integrations.")
    draftState = appendComposerTagToDraftState(draftState, createComposerMcpTagData(MCP_OPTIONS[0]!))

    const nextDraftState = syncComposerMcpTagsWithSelection(draftState, ["browser"], MCP_OPTIONS)
    const tagServerIDs = readComposerTagsFromDraftState(nextDraftState)
      .filter((tag) => tag.kind === "mcp")
      .map((tag) => tag.serverID)

    expect(tagServerIDs).toEqual(["browser"])
    expect(nextDraftState.plainText).toContain("@Browser")
    expect(nextDraftState.plainText).not.toContain("@Filesystem")
  })
})
