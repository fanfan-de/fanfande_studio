import { useWorkspaceStoreSelector, type WorkspaceStoreApi } from "./workspace-store"

interface WorkbenchStateOptions {
  store: WorkspaceStoreApi
}

export function useWorkbenchState({ store }: WorkbenchStateOptions) {
  const dockviewActiveState = useWorkspaceStoreSelector(store, (state) => state.workbench.dockviewActiveState)
  const dockviewLayout = useWorkspaceStoreSelector(store, (state) => state.workbench.dockviewLayout)
  const setDockviewActiveState = useWorkspaceStoreSelector(store, (state) => state.workbenchActions.setDockviewActiveState)
  const setDockviewLayout = useWorkspaceStoreSelector(store, (state) => state.workbenchActions.setDockviewLayout)

  return {
    dockviewActiveState,
    dockviewLayout,
    setDockviewActiveState,
    setDockviewLayout,
  }
}
