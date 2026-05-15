import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface WorkbenchStateOptions {
  store: WorkspaceStoreApi
}

export function useWorkbenchState({ store }: WorkbenchStateOptions) {
  const dockviewLayout = useWorkspaceStoreSelector(store, (state) => state.workbench.dockviewLayout)
  const setDockviewLayout = useWorkspaceStoreSelector(store, (state) => state.workbenchActions.setDockviewLayout)

  return {
    dockviewLayout,
    setDockviewLayout,
  }
}
