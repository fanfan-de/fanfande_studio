import { useState } from "react"
import { createComposerDraftStateFromPlainText } from "../composer/draft-state"
import type { ComposerAttachment, ComposerDraftState, ComposerPermissionMode } from "../types"

interface ComposerDraftStateOptions {
  initialTabKey: string | null
}

export function useComposerDraftState({ initialTabKey }: ComposerDraftStateOptions) {
  const [composerDraftStateByTabKey, setComposerDraftStateByTabKey] = useState<Record<string, ComposerDraftState>>(() =>
    initialTabKey
      ? {
          [initialTabKey]: createComposerDraftStateFromPlainText(
            "Help me align the desktop sidebar with the Pencil design.",
          ),
        }
      : {},
  )
  const [composerAttachmentsByTabKey, setComposerAttachmentsByTabKey] = useState<Record<string, ComposerAttachment[]>>({})
  const [composerPermissionModeByTabKey, setComposerPermissionModeByTabKey] = useState<
    Record<string, ComposerPermissionMode>
  >(
    () =>
      initialTabKey
        ? {
            [initialTabKey]: "default",
          }
        : {},
  )
  const [isSendingByTabKey, setIsSendingByTabKey] = useState<Record<string, boolean>>({})
  const [isCreatingSessionByTabKey, setIsCreatingSessionByTabKey] = useState<Record<string, boolean>>({})
  const [composerRefreshVersion, setComposerRefreshVersion] = useState(0)

  return {
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    composerPermissionModeByTabKey,
    composerRefreshVersion,
    isCreatingSessionByTabKey,
    isSendingByTabKey,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setComposerPermissionModeByTabKey,
    setComposerRefreshVersion,
    setIsCreatingSessionByTabKey,
    setIsSendingByTabKey,
  }
}
