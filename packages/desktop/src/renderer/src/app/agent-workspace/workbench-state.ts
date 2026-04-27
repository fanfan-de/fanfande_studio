import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface WorkbenchStateOptions {
  store: WorkspaceStoreApi
}

export function useWorkbenchState({ store }: WorkbenchStateOptions) {
  const workbenchLayout = useWorkspaceStoreSelector(store, (state) => state.workbench.workbenchLayout)
  const setWorkbenchLayout = useWorkspaceStoreSelector(store, (state) => state.workbenchActions.setWorkbenchLayout)

  return {
    setWorkbenchLayout,
    workbenchLayout,
  }
}
