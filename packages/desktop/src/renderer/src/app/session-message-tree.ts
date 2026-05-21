import type { LoadedSessionHistoryMessage } from "./types"

const ROOT_PARENT_ID = "__root__"

export interface SessionMessageTreeNode {
  id: string
  sessionID: string
  role: "user" | "assistant"
  created: number
  parentMessageID: string | null
  preview: string
}

export interface SessionMessageBranchOption {
  childMessageID: string
  index: number
  isActive: boolean
  label: string
  leafMessageID: string
  parentMessageID: string
  preview: string
  total: number
}

export interface SessionMessageTree {
  activeMessageID: string | null
  activePathMessageIDs: string[]
  branchOptionsByParentID: Record<string, SessionMessageBranchOption[]>
  childIDsByParentID: Record<string, string[]>
  nodesByID: Record<string, SessionMessageTreeNode>
  rootMessageIDs: string[]
  sessionID: string
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false
}

function compactPreview(value: string, maxLength = 72) {
  const compacted = value.replace(/\s+/g, " ").trim()
  return compacted.length > maxLength ? `${compacted.slice(0, maxLength - 1)}...` : compacted
}

function readTextPartPreview(part: unknown) {
  const record = readRecord(part)
  if (!record || readString(record.type) !== "text") return ""
  return readString(record.text)
}

function getMessagePreview(message: LoadedSessionHistoryMessage) {
  const displayText = readString(message.info.displayText)
  if (displayText.trim()) return compactPreview(displayText)

  const text = message.parts.map(readTextPartPreview).filter(Boolean).join(" ")
  if (text.trim()) return compactPreview(text)

  if (message.info.role === "user") return "User message"
  return "Assistant response"
}

function hasAssistantResponseText(message: LoadedSessionHistoryMessage) {
  if (readString(message.info.displayText).trim()) return true
  return message.parts.some((part) => readTextPartPreview(part).trim())
}

function shouldIncludeMessageTreeNode(message: LoadedSessionHistoryMessage) {
  if (readBoolean(message.info.internal)) return false
  if (message.info.role === "user") return true
  if (message.info.role !== "assistant") return false
  return hasAssistantResponseText(message)
}

function getParentKey(parentMessageID: string | null) {
  return parentMessageID ?? ROOT_PARENT_ID
}

function sortMessageNodes(left: SessionMessageTreeNode, right: SessionMessageTreeNode) {
  if (left.created !== right.created) return left.created - right.created
  return left.id.localeCompare(right.id)
}

function buildActivePath(nodesByID: Record<string, SessionMessageTreeNode>, activeMessageID: string | null) {
  if (!activeMessageID) return []

  const path: string[] = []
  const seen = new Set<string>()
  let currentID: string | null = activeMessageID

  while (currentID) {
    if (seen.has(currentID)) return []
    seen.add(currentID)

    const node: SessionMessageTreeNode | undefined = nodesByID[currentID]
    if (!node) return []

    path.push(node.id)
    currentID = node.parentMessageID
  }

  return path.reverse()
}

function resolveLatestLeafID(
  childIDsByParentID: Record<string, string[]>,
  nodesByID: Record<string, SessionMessageTreeNode>,
  messageID: string,
) {
  let currentID = messageID
  const seen = new Set<string>()

  while (!seen.has(currentID)) {
    seen.add(currentID)
    const children = childIDsByParentID[currentID] ?? []
    if (children.length === 0) return currentID
    currentID = children[children.length - 1] ?? currentID
    if (!nodesByID[currentID]) return messageID
  }

  return messageID
}

export function buildSessionMessageTree(
  messages: LoadedSessionHistoryMessage[],
  activeMessageID?: string | null,
): SessionMessageTree | null {
  const parentIDByMessageID = new Map<string, string | null>()
  for (const message of messages) {
    if (!message.info.id) continue
    parentIDByMessageID.set(
      message.info.id,
      typeof message.info.parentMessageID === "string" ? message.info.parentMessageID : null,
    )
  }

  const nodes = messages
    .filter(shouldIncludeMessageTreeNode)
    .map((message): SessionMessageTreeNode => ({
      id: message.info.id,
      sessionID: message.info.sessionID,
      role: message.info.role,
      created: readNumber(message.info.created),
      parentMessageID: typeof message.info.parentMessageID === "string" ? message.info.parentMessageID : null,
      preview: getMessagePreview(message),
    }))
    .filter((node) => node.id && node.sessionID)
    .sort(sortMessageNodes)

  const firstNode = nodes[0]
  if (!firstNode) return null

  const nodesByID: Record<string, SessionMessageTreeNode> = {}
  const childIDsByParentID: Record<string, string[]> = {}

  for (const node of nodes) {
    nodesByID[node.id] = node
  }

  for (const node of nodes) {
    let parentMessageID = node.parentMessageID
    const seenParentIDs = new Set<string>()
    while (parentMessageID && !nodesByID[parentMessageID]) {
      if (seenParentIDs.has(parentMessageID)) {
        parentMessageID = null
        break
      }
      seenParentIDs.add(parentMessageID)
      parentMessageID = parentIDByMessageID.get(parentMessageID) ?? null
    }

    node.parentMessageID = parentMessageID
    const parentKey = getParentKey(parentMessageID)
    childIDsByParentID[parentKey] = [...(childIDsByParentID[parentKey] ?? []), node.id]
  }

  for (const [parentID, childIDs] of Object.entries(childIDsByParentID)) {
    childIDsByParentID[parentID] = [...childIDs].sort((leftID, rightID) =>
      sortMessageNodes(nodesByID[leftID]!, nodesByID[rightID]!),
    )
  }

  const rootMessageIDs = childIDsByParentID[ROOT_PARENT_ID] ?? []
  const resolvedActiveMessageID =
    activeMessageID && nodesByID[activeMessageID]
      ? activeMessageID
      : nodes[nodes.length - 1]?.id ?? null
  const activePathMessageIDs = buildActivePath(nodesByID, resolvedActiveMessageID)
  const activePathSet = new Set(activePathMessageIDs)
  const branchOptionsByParentID: Record<string, SessionMessageBranchOption[]> = {}

  for (const [parentID, childIDs] of Object.entries(childIDsByParentID)) {
    if (parentID === ROOT_PARENT_ID || childIDs.length <= 1) continue

    branchOptionsByParentID[parentID] = childIDs.map((childMessageID, index) => {
      const child = nodesByID[childMessageID]!
      const leafMessageID = activePathSet.has(childMessageID) && resolvedActiveMessageID
        ? resolvedActiveMessageID
        : resolveLatestLeafID(childIDsByParentID, nodesByID, childMessageID)

      return {
        childMessageID,
        index,
        isActive: activePathSet.has(childMessageID),
        label: `Branch ${index + 1}`,
        leafMessageID,
        parentMessageID: parentID,
        preview: child.preview,
        total: childIDs.length,
      }
    })
  }

  return {
    activeMessageID: resolvedActiveMessageID,
    activePathMessageIDs,
    branchOptionsByParentID,
    childIDsByParentID,
    nodesByID,
    rootMessageIDs,
    sessionID: firstNode.sessionID,
  }
}

export function getSessionMessageIDForTurn(input: {
  kind: "user" | "assistant"
  id: string
  messageID?: string
}) {
  return input.kind === "assistant" ? input.messageID ?? input.id : input.id
}
