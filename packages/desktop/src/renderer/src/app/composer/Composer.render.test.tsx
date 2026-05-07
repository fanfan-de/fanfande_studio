import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Composer } from "./Composer"
import { appendComposerTagToDraftState, createComposerDraftStateFromPlainText, createComposerFileTagData } from "./draft-state"

function renderComposer(input: Partial<Parameters<typeof Composer>[0]> = {}) {
  return render(
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
      selectedReasoningEffortLabel=""
      selectedSkillIDs={[]}
      skillOptions={[]}
      unsupportedAttachmentPaths={[]}
      workspaceDirectory={null}
      {...input}
    />,
  )
}

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
        selectedReasoningEffortLabel=""
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
        selectedReasoningEffortLabel=""
        selectedSkillIDs={[]}
        skillOptions={[]}
        unsupportedAttachmentPaths={[]}
        workspaceDirectory={null}
      />,
    )

    expect(screen.getByText("Ask a follow-up about this reply.")).toBeInTheDocument()
  })

  it("supports two-level provider and model selection in the model menu", () => {
    renderComposer({
      modelOptions: [
        {
          value: "openai/gpt-4o-mini",
          label: "GPT-4o mini",
          providerID: "openai",
          providerLabel: "OpenAI",
        },
        {
          value: "openrouter/gpt-4o-mini",
          label: "GPT-4o mini",
          providerID: "openrouter",
          providerLabel: "OpenRouter",
        },
      ],
      selectedModel: "openai/gpt-4o-mini",
      selectedModelLabel: "GPT-4o mini",
    })

    fireEvent.click(screen.getByRole("button", { name: "Select model: GPT-4o mini" }))

    const providerList = screen.getByRole("listbox", { name: "Model providers" })
    const modelList = screen.getByRole("listbox", { name: "Model selection" })

    expect(within(providerList).getByRole("option", { name: "OpenAI" })).toBeInTheDocument()
    expect(within(providerList).getByRole("option", { name: "OpenRouter" })).toBeInTheDocument()
    expect(within(modelList).getByRole("option", { name: "GPT-4o mini OpenAI" })).toBeInTheDocument()
    expect(within(modelList).queryByRole("option", { name: "GPT-4o mini OpenRouter" })).not.toBeInTheDocument()

    fireEvent.click(within(providerList).getByRole("option", { name: "OpenRouter" }))
    expect(within(modelList).getByRole("option", { name: "GPT-4o mini OpenRouter" })).toBeInTheDocument()
  })

  it("keeps the active model provider while the parent rerenders", () => {
    const createModelOptions = () => [
      {
        value: "deepseek/deepseek-v4-pro",
        label: "DeepSeek V4 Pro",
        providerID: "deepseek",
        providerLabel: "DeepSeek",
      },
      {
        value: "openrouter/claude-opus-4.5",
        label: "Claude Opus 4.5",
        providerID: "openrouter",
        providerLabel: "OpenRouter",
      },
    ]

    function Harness({ modelOptions }: { modelOptions: ReturnType<typeof createModelOptions> }) {
      return (
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
          modelOptions={modelOptions}
          onDraftStateChange={vi.fn()}
          onModelChange={vi.fn()}
          onPickAttachments={vi.fn()}
          onReasoningEffortChange={vi.fn()}
          onRemoveAttachment={vi.fn()}
          onSend={vi.fn()}
          reasoningEffortOptions={[]}
          selectedMcpServerIDs={[]}
          selectedModel="deepseek/deepseek-v4-pro"
          selectedModelLabel="DeepSeek V4 Pro"
          selectedReasoningEffort={null}
          selectedReasoningEffortLabel=""
          selectedSkillIDs={[]}
          skillOptions={[]}
          unsupportedAttachmentPaths={[]}
          workspaceDirectory={null}
        />
      )
    }

    const { rerender } = render(<Harness modelOptions={createModelOptions()} />)

    fireEvent.click(screen.getByRole("button", { name: "Select model: DeepSeek V4 Pro" }))
    fireEvent.click(
      within(screen.getByRole("listbox", { name: "Model providers" })).getByRole("option", { name: "OpenRouter" }),
    )
    expect(
      within(screen.getByRole("listbox", { name: "Model selection" })).getByRole("option", {
        name: "Claude Opus 4.5 OpenRouter",
      }),
    ).toBeInTheDocument()

    rerender(<Harness modelOptions={createModelOptions()} />)

    expect(
      within(screen.getByRole("listbox", { name: "Model selection" })).getByRole("option", {
        name: "Claude Opus 4.5 OpenRouter",
      }),
    ).toBeInTheDocument()
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
        selectedReasoningEffortLabel=""
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

  it("leaves plain space insertion to the editor input pipeline", () => {
    const { container } = renderComposer({
      draftState: createComposerDraftStateFromPlainText("Prompt before space"),
    })
    const editor = container.querySelector(".composer-editor-input")

    expect(editor).toBeInstanceOf(HTMLElement)
    expect(
      fireEvent.keyDown(editor as HTMLElement, {
        key: " ",
        code: "Space",
        charCode: 32,
      }),
    ).toBe(true)
  })

  it("passes pasted image files to the attachment handler", async () => {
    const onPasteImageAttachments = vi.fn()
    const { container } = renderComposer({
      canPasteImageAttachments: true,
      onPasteImageAttachments,
    })
    const editor = container.querySelector(".composer-editor-input")
    const imageFile = new File(["image"], "screenshot.png", { type: "image/png" })

    expect(editor).toBeInstanceOf(HTMLElement)
    expect(
      fireEvent.paste(editor as HTMLElement, {
        clipboardData: {
          items: [
            {
              kind: "file",
              type: "image/png",
              getAsFile: () => imageFile,
            },
          ],
          files: [],
        },
      }),
    ).toBe(false)

    await waitFor(() => expect(onPasteImageAttachments).toHaveBeenCalledTimes(1))
    expect(onPasteImageAttachments.mock.calls[0]?.[0]).toEqual([
      {
        dataUrl: "data:image/png;base64,aW1hZ2U=",
        mimeType: "image/png",
        name: "screenshot.png",
      },
    ])
  })

  it("switches the send button to stop while sending", () => {
    const onCancelSend = vi.fn()
    const onSend = vi.fn()

    render(
      <Composer
        attachments={[]}
        attachmentButtonTitle="Add attachments"
        attachmentDisabledReason={null}
        attachmentError={null}
        canSend
        draftState={createComposerDraftStateFromPlainText("Running prompt")}
        hasPendingPermissionRequests={false}
        isSending
        mcpOptions={[]}
        modelOptions={[]}
        onCancelSend={onCancelSend}
        onDraftStateChange={vi.fn()}
        onModelChange={vi.fn()}
        onPickAttachments={vi.fn()}
        onReasoningEffortChange={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onSend={onSend}
        reasoningEffortOptions={[]}
        selectedMcpServerIDs={[]}
        selectedModel={null}
        selectedModelLabel="Server default"
        selectedReasoningEffort={null}
        selectedReasoningEffortLabel=""
        selectedSkillIDs={[]}
        skillOptions={[]}
        unsupportedAttachmentPaths={[]}
        workspaceDirectory={null}
      />,
    )

    const button = screen.getByRole("button", { name: "Stop task" })

    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(onCancelSend).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })
})
