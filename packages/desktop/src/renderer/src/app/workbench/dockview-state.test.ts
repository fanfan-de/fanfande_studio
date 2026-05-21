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

function addPopoutPanel(layout: SerializedDockview, reference: WorkbenchTabReference, title: string) {
  const panelID = getWorkbenchDockPanelId(reference)
  layout.panels[panelID] = {
    id: panelID,
    contentComponent: WORKBENCH_DOCK_PANEL_COMPONENT,
    tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
    title,
    params: reference,
  }
  layout.popoutGroups = [
    ...(layout.popoutGroups ?? []),
    {
      data: {
        id: "popout-group-1",
        views: [panelID],
        activeView: panelID,
      },
      position: {
        height: 720,
        left: 1600,
        top: 120,
        width: 960,
      },
      url: "/dockview-popout.html",
    },
  ]

  return panelID
}

function addStackedSessionPanel(layout: SerializedDockview, reference: WorkbenchTabReference, title: string) {
  const panelID = getWorkbenchDockPanelId(reference)
  layout.panels[panelID] = {
    id: panelID,
    contentComponent: WORKBENCH_DOCK_PANEL_COMPONENT,
    tabComponent: WORKBENCH_DOCK_TAB_COMPONENT,
    title,
    params: reference,
  }

  const root = layout.grid.root
  if (root.type === "branch" && Array.isArray(root.data)) {
    const firstLeaf = root.data[0]
    if (firstLeaf?.type === "leaf") {
      root.data = [
        {
          type: "branch",
          data: [
            firstLeaf,
            {
              type: "leaf",
              data: {
                id: "stacked-group-2",
                views: [panelID],
                activeView: panelID,
              },
              size: 100,
            },
          ],
          size: 100,
        },
      ]
    }
  }

  return panelID
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

  it("preserves single-child branches that encode orthogonal Dockview splits", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const stackedReference: WorkbenchTabReference = {
      kind: "session",
      sessionID: "session-2",
    }
    addStackedSessionPanel(layout, stackedReference, "Session 2")

    const normalized = normalizeDockviewLayout(layout, [sessionReference, stackedReference], {
      "session:session-1": "Session 1",
      "session:session-2": "Session 2",
    })

    expect(normalized?.grid.root.type).toBe("branch")
    expect(Array.isArray(normalized?.grid.root.data)).toBe(true)
    expect((normalized?.grid.root.data as Array<{ type: string }> | undefined)?.[0]?.type).toBe("branch")
    expect(getDockviewGroupsInOrder(normalized).map((group) => group.views)).toEqual([
      [sessionReference],
      [stackedReference],
    ])
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

  it("persists stacked session panes without flattening them into a horizontal split", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const stackedReference: WorkbenchTabReference = {
      kind: "session",
      sessionID: "session-2",
    }
    addStackedSessionPanel(layout, stackedReference, "Session 2")

    writePersistedDockviewLayout(layout)

    const persisted = readPersistedDockviewLayout()
    expect((persisted?.grid.root.data as Array<{ type: string }> | undefined)?.[0]?.type).toBe("branch")
    expect(getDockviewGroupsInOrder(persisted).map((group) => group.views)).toEqual([
      [sessionReference],
      [stackedReference],
    ])
  })

  it("reads popout groups with their location", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const popoutReference: WorkbenchTabReference = {
      kind: "session",
      sessionID: "session-popout",
    }
    addPopoutPanel(layout, popoutReference, "Popout")

    expect(getDockviewGroupsInOrder(layout)).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        location: "grid",
        views: [sessionReference],
      }),
      expect.objectContaining({
        id: "popout-group-1",
        location: "popout",
        views: [popoutReference],
      }),
    ])
    expect(getVisibleSessionIDs(layout)).toEqual(["session-1", "session-popout"])
  })

  it("persists popout sessions back into the main grid", () => {
    const layout = createInitialDockviewLayout(sessionReference, "Session 1")
    const popoutReference: WorkbenchTabReference = {
      kind: "session",
      sessionID: "session-popout",
    }
    const popoutPanelID = addPopoutPanel(layout, popoutReference, "Popout")

    writePersistedDockviewLayout(layout)

    const rawValue = window.localStorage.getItem(WORKBENCH_DOCKVIEW_STORAGE_KEY)
    expect(rawValue).toBeTruthy()
    const persisted = JSON.parse(rawValue ?? "{}") as SerializedDockview
    expect(persisted.popoutGroups).toBeUndefined()
    expect(persisted.panels[popoutPanelID]?.title).toBe("Popout")
    expect(getDockviewGroupsInOrder(persisted).map((group) => group.location)).toEqual(["grid", "grid"])
    expect(getOpenSessionIDs(readPersistedDockviewLayout())).toEqual(["session-1", "session-popout"])
  })
})
