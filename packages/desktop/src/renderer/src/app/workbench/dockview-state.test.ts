import { beforeEach, describe, expect, it } from "vitest"
import type { SerializedDockview } from "dockview-react"
import type { WorkbenchTabReference } from "../types"
import {
  createInitialDockviewLayout,
  getActiveDockviewPanelReference,
  getDockviewGroupsInOrder,
  getOpenSessionIDs,
  getVisibleSessionIDs,
  getWorkbenchDockPanelId,
  getWorkbenchDockPanelReference,
  normalizeDockviewLayout,
  readPersistedDockviewLayout,
  sanitizeDockviewLayout,
  WORKBENCH_DOCK_PANEL_COMPONENT,
  WORKBENCH_DOCK_TAB_COMPONENT,
  WORKBENCH_DOCKVIEW_STORAGE_KEY,
  writePersistedDockviewLayout,
} from "./dockview-state"

const sessionReference: WorkbenchTabReference = {
  kind: "session",
  sessionID: "session-1",
}
const createReference: WorkbenchTabReference = {
  kind: "create-session",
  createSessionTabID: "create-1",
}

function addCreatePanel(layout: SerializedDockview) {
  const createPanelID = getWorkbenchDockPanelId(createReference)
  layout.panels[createPanelID] = {
    id: createPanelID,
    contentComponent: WORKBENCH_DOCK_PANEL_COMPONENT,
    tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
    title: "Create",
    params: createReference,
  }

  const root = layout.grid.root
  if (root.type === "branch" && Array.isArray(root.data)) {
    const leaf = root.data[0]
    if (leaf?.type === "leaf") {
      ;(leaf.data as { views: string[]; activeView?: string }).views.push(createPanelID)
    }
  }

  return createPanelID
}

describe("dockview state helpers", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it("maps panel ids and business references", () => {
    expect(getWorkbenchDockPanelId(sessionReference)).toBe("session:session-1")
    expect(getWorkbenchDockPanelReference("create-session:create-1")).toEqual(createReference)
  })

  it("creates an initial serialized Dockview layout", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")

    expect(layout.panels["session:session-1"]?.title).toBe("Session 1")
    expect(getDockviewGroupsInOrder(layout)).toHaveLength(1)
    expect(getActiveDockviewPanelReference(layout)).toEqual(sessionReference)
    expect(getOpenSessionIDs(layout)).toEqual(["session-1"])
    expect(getVisibleSessionIDs(layout)).toEqual(["session-1"])
  })

  it("normalizes invalid panels and empty groups", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const createPanelID = addCreatePanel(layout)
    const invalidPanelID = "session:deleted"
    layout.panels[invalidPanelID] = {
      id: invalidPanelID,
      contentComponent: WORKBENCH_DOCK_PANEL_COMPONENT,
      tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
      title: "Deleted",
      params: { kind: "session", sessionID: "deleted" },
    }

    const root = layout.grid.root
    if (root.type === "branch" && Array.isArray(root.data)) {
      const leaf = root.data[0]
      if (leaf?.type === "leaf") {
        ;(leaf.data as { views: string[]; activeView?: string }).views = [
          "session:session-1",
          createPanelID,
          invalidPanelID,
        ]
        ;(leaf.data as { views: string[]; activeView?: string }).activeView = invalidPanelID
      }
    }

    const normalized = normalizeDockviewLayout(layout, [sessionReference, createReference], {
      "session:session-1": "Renamed session",
      [createPanelID]: "Create / workspace",
    })

    expect(normalized?.panels[invalidPanelID]).toBeUndefined()
    expect(normalized?.panels["session:session-1"]?.title).toBe("Renamed session")
    expect(getActiveDockviewPanelReference(normalized)).toEqual(sessionReference)
    expect(getDockviewGroupsInOrder(normalized)[0]?.views).toEqual([sessionReference, createReference])
  })

  it("sanitizes malformed layouts before business normalization", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const invalidPanelID = "session:ghost"
    layout.activeGroup = "missing-group"
    layout.panels[invalidPanelID] = {
      id: invalidPanelID,
      contentComponent: "unknown-component",
      tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
      title: "Ghost",
      params: { kind: "session", sessionID: "ghost" },
    }

    const root = layout.grid.root
    if (root.type === "branch" && Array.isArray(root.data)) {
      const leaf = root.data[0]
      if (leaf?.type === "leaf") {
        ;(leaf.data as { views: string[]; activeView?: string }).views = ["session:session-1", invalidPanelID]
        ;(leaf.data as { views: string[]; activeView?: string }).activeView = invalidPanelID
      }
    }

    const sanitized = sanitizeDockviewLayout(layout)

    expect(sanitized?.panels[invalidPanelID]).toBeUndefined()
    expect(sanitized?.activeGroup).not.toBe("missing-group")
    expect(getActiveDockviewPanelReference(sanitized)).toEqual(sessionReference)
    expect(sanitizeDockviewLayout({ grid: { root: { type: "branch", data: [] } }, panels: {} })).toBeNull()
  })

  it("persists only real session panels and drops transient create-session tabs", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const createPanelID = addCreatePanel(layout)

    writePersistedDockviewLayout(layout)

    const rawValue = window.localStorage.getItem(WORKBENCH_DOCKVIEW_STORAGE_KEY)
    expect(rawValue).toBeTruthy()
    const persisted = JSON.parse(rawValue ?? "{}") as SerializedDockview
    expect(persisted.panels[createPanelID]).toBeUndefined()
    expect(persisted.panels["session:session-1"]).toBeTruthy()
    expect(getOpenSessionIDs(readPersistedDockviewLayout())).toEqual(["session-1"])
  })
})
