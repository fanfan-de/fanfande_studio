import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Composer } from "./Composer"
import { appendComposerTagToDraftState, createComposerDraftStateFromPlainText, createComposerFileTagData } from "./draft-state"

describe("Composer", () => {
  it("renders the empty-state placeholder inside the editor shell", () => {
    const { container } = render(
      <Composer
        attachments={[]}
        attachmentButtonTitle="Add attachments"
        attachmentDisabledReason={null}
        attachmentError={null}
        canSend
        draftState={createComposerDraftStateFromPlainText("")}
        hasPendingPermissionRequests={false}
        isSending={false}
        mcpOptions={[]}
        modelOptions={[]}
        onDraftStateChange={vi.fn()}
        onModelChange={vi.fn()}
        onPickAttachments={vi.fn()}
        onReasoningEffortChange={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSend={vi.fn()}
        reasoningEffortOptions={[]}
        selectedMcpServerIDs={[]}
        selectedModel={null}
        selectedModelLabel="Server default"
        selectedReasoningEffort={null}
        selectedReasoningEffortLabel="Model default"
        selectedSkillIDs={[]}
        skillOptions={[]}
        unsupportedAttachmentPaths={[]}
        workspaceDirectory={null}
      />,
    )

    const editorShell = container.querySelector(".composer-editor-shell")

    expect(editorShell).not.toBeNull()
    expect(editorShell?.querySelector(".composer-editor-input")).not.toBeNull()
    expect(editorShell?.querySelector(".composer-editor-placeholder")).not.toBeNull()
    expect(screen.getByText("Describe the UI, implementation task, or review target for the agent.")).toBeInTheDocument()
  })

  it("renders a custom placeholder when provided", () => {
    render(
      <Composer
        attachments={[]}
        attachmentButtonTitle="Add attachments"
        attachmentDisabledReason={null}
        attachmentError={null}
        canSend
        draftState={createComposerDraftStateFromPlainText("")}
        hasPendingPermissionRequests={false}
        isSending={false}
        mcpOptions={[]}
        modelOptions={[]}
        onDraftStateChange={vi.fn()}
        onModelChange={vi.fn()}
        onPickAttachments={vi.fn()}
        onReasoningEffortChange={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSend={vi.fn()}
        placeholder="Ask a follow-up about this reply."
        reasoningEffortOptions={[]}
        selectedMcpServerIDs={[]}
        selectedModel={null}
        selectedModelLabel="Server default"
        selectedReasoningEffort={null}
        selectedReasoningEffortLabel="Model default"
        selectedSkillIDs={[]}
        skillOptions={[]}
        unsupportedAttachmentPaths={[]}
        workspaceDirectory={null}
      />,
    )

    expect(screen.getByText("Ask a follow-up about this reply.")).toBeInTheDocument()
  })

  it("renders composer tags as non-editable DOM tokens", () => {
    const draftState = appendComposerTagToDraftState(
      createComposerDraftStateFromPlainText(""),
      createComposerFileTagData("C:\\Projects\\Atlas\\games\\plants-vs-zombies.html", "plants-vs-zombies.html"),
    )

    render(
      <Composer
        attachments={[]}
        attachmentButtonTitle="Add attachments"
        attachmentDisabledReason={null}
        attachmentError={null}
        canSend
        draftState={draftState}
        hasPendingPermissionRequests={false}
        isSending={false}
        mcpOptions={[]}
        modelOptions={[]}
        onDraftStateChange={vi.fn()}
        onModelChange={vi.fn()}
        onPickAttachments={vi.fn()}
        onReasoningEffortChange={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSend={vi.fn()}
        reasoningEffortOptions={[]}
        selectedMcpServerIDs={[]}
        selectedModel={null}
        selectedModelLabel="Server default"
        selectedReasoningEffort={null}
        selectedReasoningEffortLabel="Model default"
        selectedSkillIDs={[]}
        skillOptions={[]}
        unsupportedAttachmentPaths={[]}
        workspaceDirectory={null}
      />,
    )

    const tag = screen.getByText("@plants-vs-zombies.html")

    expect(tag).toHaveClass("composer-inline-tag", "is-file")
    expect(tag).toHaveProperty("contentEditable", "false")
    expect(tag).toHaveProperty("tabIndex", -1)
  })
})
