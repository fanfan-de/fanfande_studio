import { createContext, useContext, type ReactNode } from "react"
import type { WorkspaceStoreApi } from "./workspace-store"

const WorkspaceStoreContext = createContext<WorkspaceStoreApi | null>(null)

export function WorkspaceStoreProvider({
  children,
  store,
}: {
  children: ReactNode
  store: WorkspaceStoreApi
}) {
  return (
    <WorkspaceStoreContext.Provider value={store}>
      {children}
    </WorkspaceStoreContext.Provider>
  )
}

export function useWorkspaceStoreContext() {
  const store = useContext(WorkspaceStoreContext)
  if (!store) {
    throw new Error("Workspace store is not available.")
  }
  return store
}
