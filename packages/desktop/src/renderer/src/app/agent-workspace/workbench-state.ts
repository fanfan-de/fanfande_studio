import { useState } from "react"
import type { WorkbenchLayoutState } from "../workbench/core"

interface WorkbenchStateOptions {
  initialWorkbenchLayout: WorkbenchLayoutState
}

export function useWorkbenchState({ initialWorkbenchLayout }: WorkbenchStateOptions) {
  const [workbenchLayout, setWorkbenchLayout] = useState<WorkbenchLayoutState>(initialWorkbenchLayout)

  return {
    setWorkbenchLayout,
    workbenchLayout,
  }
}
