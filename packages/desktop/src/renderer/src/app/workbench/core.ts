import type { WorkbenchTabReference } from "../types"
import { createID } from "../utils"

export type WorkbenchNodeId = string
export type WorkbenchGroupId = string
export type WorkbenchSplitId = string
export type WorkbenchDocId = string
export type WorkbenchTabId = string
export type WorkbenchSplitAxis = "horizontal" | "vertical"
export type WorkbenchDockDirection = "left" | "right" | "top" | "bottom"

export type WorkbenchDoc =
  | {
      id: WorkbenchDocId
      type: "session"
      sessionID: string
    }
  | {
      id: WorkbenchDocId
      type: "create-session"
      createSessionTabID: string
    }

export interface WorkbenchTab {
  id: WorkbenchTabId
  docId: WorkbenchDocId
  closable: boolean
}

export interface WorkbenchGroupNode {
  id: WorkbenchGroupId
  kind: "group"
  tabs: WorkbenchTabId[]
  activeTabId: WorkbenchTabId | null
}

export interface WorkbenchSplitNode {
  id: WorkbenchSplitId
  kind: "split"
  axis: WorkbenchSplitAxis
  children: WorkbenchNodeId[]
  sizes: number[]
}

export type WorkbenchLayoutNode = WorkbenchGroupNode | WorkbenchSplitNode

export interface WorkbenchLayoutState {
  rootId: WorkbenchNodeId | null
  nodes: Record<WorkbenchNodeId, WorkbenchLayoutNode>
  tabs: Record<WorkbenchTabId, WorkbenchTab>
  docs: Record<WorkbenchDocId, WorkbenchDoc>
  focusedGroupId: WorkbenchGroupId | null
}

export interface LegacyWorkbenchPane {
  id: string
  size: number
  tabs: WorkbenchTabReference[]
  activeTabKey: string | null
}

interface NodeParentMatch {
  index: number
  parentId: WorkbenchSplitId | null
}

function normalizeSizes(sizes: number[], count: number) {
  if (count <= 0) return []

  const nextSizes = sizes.slice(0, count).map((value) => (Number.isFinite(value) && value > 0 ? value : 1))
  while (nextSizes.length < count) {
    nextSizes.push(1)
  }

  const total = nextSizes.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return Array.from({ length: count }, () => 1 / count)
  }

  return nextSizes.map((value) => value / total)
}

function emptyLayout(): WorkbenchLayoutState {
  return {
    rootId: null,
    nodes: {},
    tabs: {},
    docs: {},
    focusedGroupId: null,
  }
}

function buildDocForReference(reference: WorkbenchTabReference): WorkbenchDoc {
  if (reference.kind === "session") {
    return {
      id: getDocIdForReference(reference),
      type: "session",
      sessionID: reference.sessionID,
    }
  }

  return {
    id: getDocIdForReference(reference),
    type: "create-session",
    createSessionTabID: reference.createSessionTabID,
  }
}

function cloneLayoutState(state: WorkbenchLayoutState): WorkbenchLayoutState {
  return {
    ...state,
    nodes: { ...state.nodes },
    tabs: { ...state.tabs },
    docs: { ...state.docs },
  }
}

function ensureReferenceEntities(state: WorkbenchLayoutState, reference: WorkbenchTabReference) {
  const docId = getDocIdForReference(reference)
  const tabId = getTabIdForReference(reference)

  if (!state.docs[docId]) {
    state.docs[docId] = buildDocForReference(reference)
  }

  if (!state.tabs[tabId]) {
    state.tabs[tabId] = {
      id: tabId,
      docId,
      closable: true,
    }
  }

  return {
    docId,
    tabId,
  }
}

function createGroupNode(tabs: WorkbenchTabId[], activeTabId: WorkbenchTabId | null, id = createID("group")): WorkbenchGroupNode {
  const nextTabs = tabs.filter(Boolean)
  const nextActiveTabId = nextTabs.includes(activeTabId ?? "") ? activeTabId : nextTabs[0] ?? null

  return {
    id,
    kind: "group",
    tabs: nextTabs,
    activeTabId: nextActiveTabId,
  }
}

function createSplitNode(axis: WorkbenchSplitAxis, children: WorkbenchNodeId[], sizes: number[], id = createID("split")): WorkbenchSplitNode {
  return {
    id,
    kind: "split",
    axis,
    children,
    sizes: normalizeSizes(sizes, children.length),
  }
}

function findNodeParent(state: WorkbenchLayoutState, nodeId: WorkbenchNodeId, currentNodeId = state.rootId, parentId: WorkbenchSplitId | null = null): NodeParentMatch | null {
  if (!currentNodeId) return null
  if (currentNodeId === nodeId) {
    return {
      index: parentId ? (state.nodes[parentId] as WorkbenchSplitNode).children.indexOf(nodeId) : 0,
      parentId,
    }
  }

  const currentNode = state.nodes[currentNodeId]
  if (!currentNode || currentNode.kind !== "split") return null

  for (let index = 0; index < currentNode.children.length; index += 1) {
    const childId = currentNode.children[index]
    if (childId === nodeId) {
      return {
        index,
        parentId: currentNode.id,
      }
    }

    const match = findNodeParent(state, nodeId, childId, currentNode.id)
    if (match) return match
  }

  return null
}

function getFirstGroupIdInNode(state: WorkbenchLayoutState, nodeId: WorkbenchNodeId | null): WorkbenchGroupId | null {
  if (!nodeId) return null
  const node = state.nodes[nodeId]
  if (!node) return null
  if (node.kind === "group") return node.id

  for (const childId of node.children) {
    const match = getFirstGroupIdInNode(state, childId)
    if (match) return match
  }

  return null
}

function visitGroups(state: WorkbenchLayoutState, nodeId: WorkbenchNodeId | null, output: WorkbenchGroupId[]) {
  if (!nodeId) return
  const node = state.nodes[nodeId]
  if (!node) return

  if (node.kind === "group") {
    output.push(node.id)
    return
  }

  for (const childId of node.children) {
    visitGroups(state, childId, output)
  }
}

function cleanupUnreachableEntities(state: WorkbenchLayoutState) {
  const reachableNodeIds = new Set<WorkbenchNodeId>()
  const reachableTabIds = new Set<WorkbenchTabId>()

  function walk(nodeId: WorkbenchNodeId | null) {
    if (!nodeId || reachableNodeIds.has(nodeId)) return
    const node = state.nodes[nodeId]
    if (!node) return
    reachableNodeIds.add(nodeId)

    if (node.kind === "group") {
      for (const tabId of node.tabs) {
        if (state.tabs[tabId]) {
          reachableTabIds.add(tabId)
        }
      }
      return
    }

    for (const childId of node.children) {
      walk(childId)
    }
  }

  walk(state.rootId)

  for (const nodeId of Object.keys(state.nodes)) {
    if (!reachableNodeIds.has(nodeId)) {
      delete state.nodes[nodeId]
    }
  }

  const reachableDocIds = new Set<WorkbenchDocId>()
  for (const tabId of Object.keys(state.tabs)) {
    if (!reachableTabIds.has(tabId)) {
      delete state.tabs[tabId]
      continue
    }

    const tab = state.tabs[tabId]
    if (state.docs[tab.docId]) {
      reachableDocIds.add(tab.docId)
    }
  }

  for (const docId of Object.keys(state.docs)) {
    if (!reachableDocIds.has(docId)) {
      delete state.docs[docId]
    }
  }
}

export function getDocIdForReference(reference: WorkbenchTabReference) {
  return reference.kind === "session"
    ? `doc:session:${reference.sessionID}`
    : `doc:create-session:${reference.createSessionTabID}`
}

export function getTabIdForReference(reference: WorkbenchTabReference) {
  return reference.kind === "session"
    ? `tab:session:${reference.sessionID}`
    : `tab:create-session:${reference.createSessionTabID}`
}

export function getReferenceForTabId(state: WorkbenchLayoutState, tabId: WorkbenchTabId): WorkbenchTabReference | null {
  const tab = state.tabs[tabId]
  const doc = tab ? state.docs[tab.docId] : null
  if (!tab || !doc) return null

  if (doc.type === "session") {
    return {
      kind: "session",
      sessionID: doc.sessionID,
    }
  }

  return {
    kind: "create-session",
    createSessionTabID: doc.createSessionTabID,
  }
}

export function getGroupNode(state: WorkbenchLayoutState, groupId: WorkbenchGroupId | null) {
  if (!groupId) return null
  const node = state.nodes[groupId]
  return node?.kind === "group" ? node : null
}

export function getSplitNode(state: WorkbenchLayoutState, splitId: WorkbenchSplitId | null) {
  if (!splitId) return null
  const node = state.nodes[splitId]
  return node?.kind === "split" ? node : null
}

export function getGroupIdsInOrder(state: WorkbenchLayoutState) {
  const output: WorkbenchGroupId[] = []
  visitGroups(state, state.rootId, output)
  return output
}

export function getFirstGroupId(state: WorkbenchLayoutState) {
  return getFirstGroupIdInNode(state, state.rootId)
}

export function getGroupIdForTabId(state: WorkbenchLayoutState, tabId: WorkbenchTabId): WorkbenchGroupId | null {
  for (const groupId of getGroupIdsInOrder(state)) {
    const group = getGroupNode(state, groupId)
    if (group?.tabs.includes(tabId)) return groupId
  }

  return null
}

export function normalizeLayoutState(input: WorkbenchLayoutState): WorkbenchLayoutState {
  const state = cloneLayoutState(input)

  function normalizeNode(nodeId: WorkbenchNodeId | null): WorkbenchNodeId | null {
    if (!nodeId) return null
    const node = state.nodes[nodeId]
    if (!node) return null

    if (node.kind === "group") {
      const nextTabs = node.tabs.filter((tabId) => Boolean(state.tabs[tabId]))
      if (nextTabs.length === 0) {
        delete state.nodes[nodeId]
        return null
      }

      state.nodes[nodeId] = {
        ...node,
        tabs: nextTabs,
        activeTabId: nextTabs.includes(node.activeTabId ?? "") ? node.activeTabId : nextTabs[0] ?? null,
      }
      return nodeId
    }

    const nextChildren: WorkbenchNodeId[] = []
    const nextSizes: number[] = []

    for (let index = 0; index < node.children.length; index += 1) {
      const childId = normalizeNode(node.children[index] ?? null)
      if (!childId) continue
      nextChildren.push(childId)
      nextSizes.push(node.sizes[index] ?? 1)
    }

    if (nextChildren.length === 0) {
      delete state.nodes[nodeId]
      return null
    }

    if (nextChildren.length === 1) {
      delete state.nodes[nodeId]
      return nextChildren[0]
    }

    state.nodes[nodeId] = {
      ...node,
      children: nextChildren,
      sizes: normalizeSizes(nextSizes, nextChildren.length),
    }
    return nodeId
  }

  state.rootId = normalizeNode(state.rootId)
  cleanupUnreachableEntities(state)

  const orderedGroups = getGroupIdsInOrder(state)
  state.focusedGroupId = orderedGroups.includes(state.focusedGroupId ?? "")
    ? state.focusedGroupId
    : orderedGroups[0] ?? null

  return state
}

export function createWorkbenchLayoutFromLegacyPanes(panes: LegacyWorkbenchPane[]): WorkbenchLayoutState {
  if (panes.length === 0) return emptyLayout()

  const nextState = emptyLayout()
  const groups: WorkbenchGroupNode[] = []

  for (const pane of panes) {
    const tabIds: WorkbenchTabId[] = []
    let activeTabId: WorkbenchTabId | null = null

    for (const reference of pane.tabs) {
      const { tabId } = ensureReferenceEntities(nextState, reference)
      tabIds.push(tabId)

      const referenceKey = reference.kind === "session"
        ? `session:${reference.sessionID}`
        : `create-session:${reference.createSessionTabID}`
      if (pane.activeTabKey === referenceKey) {
        activeTabId = tabId
      }
    }

    const group = createGroupNode(tabIds, activeTabId, pane.id)
    nextState.nodes[group.id] = group
    groups.push(group)
  }

  if (groups.length === 1) {
    nextState.rootId = groups[0].id
    nextState.focusedGroupId = groups[0].id
    return normalizeLayoutState(nextState)
  }

  const split = createSplitNode(
    "horizontal",
    groups.map((group) => group.id),
    panes.map((pane) => pane.size),
  )
  nextState.nodes[split.id] = split
  nextState.rootId = split.id
  nextState.focusedGroupId = groups[0]?.id ?? null
  return normalizeLayoutState(nextState)
}

export function createWorkbenchLayoutWithTab(reference: WorkbenchTabReference) {
  const state = emptyLayout()
  const { tabId } = ensureReferenceEntities(state, reference)
  const group = createGroupNode([tabId], tabId)
  state.nodes[group.id] = group
  state.rootId = group.id
  state.focusedGroupId = group.id
  return state
}

export function focusGroup(state: WorkbenchLayoutState, groupId: WorkbenchGroupId | null) {
  const nextState = cloneLayoutState(state)
  nextState.focusedGroupId = groupId
  return normalizeLayoutState(nextState)
}

export function upsertTabReferenceInGroup(state: WorkbenchLayoutState, groupId: WorkbenchGroupId | null, reference: WorkbenchTabReference) {
  if (!groupId) {
    return createWorkbenchLayoutWithTab(reference)
  }

  const nextState = cloneLayoutState(state)
  const group = getGroupNode(nextState, groupId)
  if (!group) {
    return createWorkbenchLayoutWithTab(reference)
  }

  const { tabId } = ensureReferenceEntities(nextState, reference)
  const nextTabs = group.tabs.includes(tabId) ? group.tabs : [...group.tabs, tabId]

  nextState.nodes[group.id] = {
    ...group,
    tabs: nextTabs,
    activeTabId: tabId,
  }
  nextState.focusedGroupId = group.id
  return normalizeLayoutState(nextState)
}

export function replaceTabReferenceInGroup(
  state: WorkbenchLayoutState,
  groupId: WorkbenchGroupId | null,
  currentTabId: WorkbenchTabId,
  nextReference: WorkbenchTabReference,
) {
  if (!groupId) return state

  const nextState = cloneLayoutState(state)
  const group = getGroupNode(nextState, groupId)
  if (!group) return state

  const tabIndex = group.tabs.indexOf(currentTabId)
  if (tabIndex === -1) return state

  const { tabId } = ensureReferenceEntities(nextState, nextReference)
  const nextTabs = group.tabs.flatMap((item, index) => {
    if (index !== tabIndex) {
      return item === tabId ? [] : [item]
    }
    return [tabId]
  })

  nextState.nodes[group.id] = {
    ...group,
    tabs: nextTabs,
    activeTabId: tabId,
  }
  nextState.focusedGroupId = group.id
  return normalizeLayoutState(nextState)
}

export function setGroupActiveTab(state: WorkbenchLayoutState, groupId: WorkbenchGroupId | null, tabId: WorkbenchTabId | null) {
  if (!groupId) return state
  const group = getGroupNode(state, groupId)
  if (!group) return state

  const nextState = cloneLayoutState(state)
  nextState.nodes[group.id] = {
    ...group,
    activeTabId: group.tabs.includes(tabId ?? "") ? tabId : group.activeTabId,
  }
  nextState.focusedGroupId = group.id
  return normalizeLayoutState(nextState)
}

export function removeTabFromGroup(state: WorkbenchLayoutState, groupId: WorkbenchGroupId | null, tabId: WorkbenchTabId) {
  if (!groupId) return state
  const group = getGroupNode(state, groupId)
  if (!group || !group.tabs.includes(tabId)) return state

  const nextState = cloneLayoutState(state)
  const nextTabs = group.tabs.filter((item) => item !== tabId)
  nextState.nodes[group.id] = {
    ...group,
    tabs: nextTabs,
    activeTabId: nextTabs.includes(group.activeTabId ?? "") ? group.activeTabId : nextTabs[0] ?? null,
  }
  if (nextState.focusedGroupId === group.id && nextTabs.length === 0) {
    nextState.focusedGroupId = null
  }
  return normalizeLayoutState(nextState)
}

export function filterLayoutTabs(
  state: WorkbenchLayoutState,
  predicate: (reference: WorkbenchTabReference, tabId: WorkbenchTabId) => boolean,
) {
  const nextState = cloneLayoutState(state)

  for (const groupId of getGroupIdsInOrder(nextState)) {
    const group = getGroupNode(nextState, groupId)
    if (!group) continue

    const nextTabs = group.tabs.filter((tabId) => {
      const reference = getReferenceForTabId(nextState, tabId)
      return reference ? predicate(reference, tabId) : false
    })

    nextState.nodes[group.id] = {
      ...group,
      tabs: nextTabs,
      activeTabId: nextTabs.includes(group.activeTabId ?? "") ? group.activeTabId : nextTabs[0] ?? null,
    }
  }

  return normalizeLayoutState(nextState)
}

export function moveTabToGroup(
  state: WorkbenchLayoutState,
  sourceGroupId: WorkbenchGroupId,
  tabId: WorkbenchTabId,
  targetGroupId: WorkbenchGroupId,
) {
  const sourceGroup = getGroupNode(state, sourceGroupId)
  const targetGroup = getGroupNode(state, targetGroupId)
  if (!sourceGroup || !targetGroup) return state
  if (!sourceGroup.tabs.includes(tabId)) return state

  if (sourceGroupId === targetGroupId) {
    return setGroupActiveTab(state, targetGroupId, tabId)
  }

  const nextState = cloneLayoutState(state)
  const nextSourceGroup = getGroupNode(nextState, sourceGroupId)
  const nextTargetGroup = getGroupNode(nextState, targetGroupId)
  if (!nextSourceGroup || !nextTargetGroup) return state

  nextState.nodes[sourceGroupId] = {
    ...nextSourceGroup,
    tabs: nextSourceGroup.tabs.filter((item) => item !== tabId),
    activeTabId:
      nextSourceGroup.activeTabId === tabId
        ? nextSourceGroup.tabs.find((item) => item !== tabId) ?? null
        : nextSourceGroup.activeTabId,
  }
  nextState.nodes[targetGroupId] = {
    ...nextTargetGroup,
    tabs: nextTargetGroup.tabs.includes(tabId) ? nextTargetGroup.tabs : [...nextTargetGroup.tabs, tabId],
    activeTabId: tabId,
  }
  nextState.focusedGroupId = targetGroupId
  return normalizeLayoutState(nextState)
}

export function dockTabAroundGroup(
  state: WorkbenchLayoutState,
  sourceGroupId: WorkbenchGroupId,
  tabId: WorkbenchTabId,
  targetGroupId: WorkbenchGroupId,
  direction: WorkbenchDockDirection,
) {
  const sourceGroup = getGroupNode(state, sourceGroupId)
  const targetGroup = getGroupNode(state, targetGroupId)
  if (!sourceGroup || !targetGroup || !sourceGroup.tabs.includes(tabId)) return state
  if (sourceGroupId === targetGroupId && sourceGroup.tabs.length === 1) {
    return focusGroup(state, targetGroupId)
  }

  const nextState = cloneLayoutState(state)
  const workingSourceGroup = getGroupNode(nextState, sourceGroupId)
  if (!workingSourceGroup || !workingSourceGroup.tabs.includes(tabId)) return state

  nextState.nodes[sourceGroupId] = {
    ...workingSourceGroup,
    tabs: workingSourceGroup.tabs.filter((item) => item !== tabId),
    activeTabId:
      workingSourceGroup.activeTabId === tabId
        ? workingSourceGroup.tabs.find((item) => item !== tabId) ?? null
        : workingSourceGroup.activeTabId,
  }

  const nextGroup = createGroupNode([tabId], tabId)
  nextState.nodes[nextGroup.id] = nextGroup

  const resolvedTargetGroup = getGroupNode(nextState, targetGroupId)
  if (!resolvedTargetGroup) return normalizeLayoutState(nextState)

  const axis: WorkbenchSplitAxis = direction === "left" || direction === "right" ? "horizontal" : "vertical"
  const insertBefore = direction === "left" || direction === "top"
  const targetParent = findNodeParent(nextState, resolvedTargetGroup.id)

  if (targetParent?.parentId) {
    const parent = getSplitNode(nextState, targetParent.parentId)
    if (!parent) return normalizeLayoutState(nextState)

    if (parent.axis === axis) {
      const insertionIndex = insertBefore ? targetParent.index : targetParent.index + 1
      const nextChildren = [...parent.children]
      const nextSizes = [...parent.sizes]
      const targetSize = nextSizes[targetParent.index] ?? 1 / Math.max(parent.children.length, 1)
      nextChildren.splice(insertionIndex, 0, nextGroup.id)
      nextSizes[targetParent.index] = targetSize / 2
      nextSizes.splice(insertionIndex, 0, targetSize / 2)
      nextState.nodes[parent.id] = {
        ...parent,
        children: nextChildren,
        sizes: normalizeSizes(nextSizes, nextChildren.length),
      }
    } else {
      const splitChildren = insertBefore ? [nextGroup.id, resolvedTargetGroup.id] : [resolvedTargetGroup.id, nextGroup.id]
      const nextSplit = createSplitNode(axis, splitChildren, [1, 1])
      nextState.nodes[nextSplit.id] = nextSplit
      const nextParentChildren = [...parent.children]
      nextParentChildren[targetParent.index] = nextSplit.id
      nextState.nodes[parent.id] = {
        ...parent,
        children: nextParentChildren,
      }
    }
  } else {
    const splitChildren = insertBefore ? [nextGroup.id, resolvedTargetGroup.id] : [resolvedTargetGroup.id, nextGroup.id]
    const nextSplit = createSplitNode(axis, splitChildren, [1, 1])
    nextState.nodes[nextSplit.id] = nextSplit
    nextState.rootId = nextSplit.id
  }

  nextState.focusedGroupId = nextGroup.id
  return normalizeLayoutState(nextState)
}

export function splitGroupWithReference(
  state: WorkbenchLayoutState,
  targetGroupId: WorkbenchGroupId | null,
  reference: WorkbenchTabReference,
  direction: WorkbenchDockDirection,
) {
  if (!targetGroupId) {
    return createWorkbenchLayoutWithTab(reference)
  }

  const nextState = cloneLayoutState(state)
  const { tabId } = ensureReferenceEntities(nextState, reference)
  const sourceGroupId = getGroupIdForTabId(nextState, tabId)

  if (sourceGroupId) {
    return dockTabAroundGroup(nextState, sourceGroupId, tabId, targetGroupId, direction)
  }

  const nextGroup = createGroupNode([tabId], tabId)
  nextState.nodes[nextGroup.id] = nextGroup

  const targetParent = findNodeParent(nextState, targetGroupId)
  const axis: WorkbenchSplitAxis = direction === "left" || direction === "right" ? "horizontal" : "vertical"
  const insertBefore = direction === "left" || direction === "top"

  if (targetParent?.parentId) {
    const parent = getSplitNode(nextState, targetParent.parentId)
    if (!parent) return normalizeLayoutState(nextState)

    if (parent.axis === axis) {
      const insertionIndex = insertBefore ? targetParent.index : targetParent.index + 1
      const nextChildren = [...parent.children]
      const nextSizes = [...parent.sizes]
      const targetSize = nextSizes[targetParent.index] ?? 1 / Math.max(parent.children.length, 1)
      nextChildren.splice(insertionIndex, 0, nextGroup.id)
      nextSizes[targetParent.index] = targetSize / 2
      nextSizes.splice(insertionIndex, 0, targetSize / 2)
      nextState.nodes[parent.id] = {
        ...parent,
        children: nextChildren,
        sizes: normalizeSizes(nextSizes, nextChildren.length),
      }
    } else {
      const splitChildren = insertBefore ? [nextGroup.id, targetGroupId] : [targetGroupId, nextGroup.id]
      const nextSplit = createSplitNode(axis, splitChildren, [1, 1])
      nextState.nodes[nextSplit.id] = nextSplit
      const nextParentChildren = [...parent.children]
      nextParentChildren[targetParent.index] = nextSplit.id
      nextState.nodes[parent.id] = {
        ...parent,
        children: nextParentChildren,
      }
    }
  } else {
    const splitChildren = insertBefore ? [nextGroup.id, targetGroupId] : [targetGroupId, nextGroup.id]
    const nextSplit = createSplitNode(axis, splitChildren, [1, 1])
    nextState.nodes[nextSplit.id] = nextSplit
    nextState.rootId = nextSplit.id
  }

  nextState.focusedGroupId = nextGroup.id
  return normalizeLayoutState(nextState)
}

export function resizeSplitChildren(
  state: WorkbenchLayoutState,
  splitId: WorkbenchSplitId,
  leftIndex: number,
  leftSize: number,
  rightSize: number,
) {
  const split = getSplitNode(state, splitId)
  if (!split) return state
  if (leftIndex < 0 || leftIndex >= split.children.length - 1) return state

  const nextState = cloneLayoutState(state)
  const nextSplit = getSplitNode(nextState, splitId)
  if (!nextSplit) return state

  const nextSizes = [...nextSplit.sizes]
  nextSizes[leftIndex] = leftSize
  nextSizes[leftIndex + 1] = rightSize

  nextState.nodes[splitId] = {
    ...nextSplit,
    sizes: normalizeSizes(nextSizes, nextSplit.children.length),
  }
  return normalizeLayoutState(nextState)
}
