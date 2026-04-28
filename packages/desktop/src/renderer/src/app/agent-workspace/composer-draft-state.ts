import type { ComposerAttachment, ComposerDraftState } from "../types"
import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface ComposerDraftStateOptions {
  store: WorkspaceStoreApi
}

export function useComposerDraftState({ store }: ComposerDraftStateOptions) {
  const composerAttachmentsByTabKey = useWorkspaceStoreSelector(
    store,
    (state) => state.composer.composerAttachmentsByTabKey as Record<string, ComposerAttachment[]>,
  )
  const composerDraftStateByTabKey = useWorkspaceStoreSelector(
    store,
    (state) => state.composer.composerDraftStateByTabKey as Record<string, ComposerDraftState>,
  )
  const composerRefreshVersion = useWorkspaceStoreSelector(store, (state) => state.composer.composerRefreshVersion)
  const isCreatingSessionByTabKey = useWorkspaceStoreSelector(store, (state) => state.composer.isCreatingSessionByTabKey)
  const isSendingByTabKey = useWorkspaceStoreSelector(store, (state) => state.composer.isSendingByTabKey)
  const setComposerAttachmentsByTabKey = useWorkspaceStoreSelector(
    store,
    (state) => state.composerActions.setComposerAttachmentsByTabKey,
  )
  const setComposerDraftStateByTabKey = useWorkspaceStoreSelector(
    store,
    (state) => state.composerActions.setComposerDraftStateByTabKey,
  )
  const setComposerRefreshVersion = useWorkspaceStoreSelector(
    store,
    (state) => state.composerActions.setComposerRefreshVersion,
  )
  const setIsCreatingSessionByTabKey = useWorkspaceStoreSelector(
    store,
    (state) => state.composerActions.setIsCreatingSessionByTabKey,
  )
  const setIsSendingByTabKey = useWorkspaceStoreSelector(store, (state) => state.composerActions.setIsSendingByTabKey)

  return {
    composerAttachmentsByTabKey,
    composerDraftStateByTabKey,
    composerRefreshVersion,
    isCreatingSessionByTabKey,
    isSendingByTabKey,
    setComposerAttachmentsByTabKey,
    setComposerDraftStateByTabKey,
    setComposerRefreshVersion,
    setIsCreatingSessionByTabKey,
    setIsSendingByTabKey,
  }
}
