import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin"
import {
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalEditor,
  type TextNode,
} from "lexical"
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react"
import { ArrowUpIcon, ChevronDownIcon, CloseIcon, PaperclipIcon, StopIcon } from "../icons"
import type {
  ComposerAttachment,
  ComposerDraftState,
  ComposerMcpOption,
  ComposerModelOption,
  ComposerPermissionMode,
  ComposerReasoningEffortOption,
  ComposerSkillOption,
  ComposerTagData,
  OpenAIReasoningEffort,
} from "../types"
import { $createComposerTagNode, ComposerTagNode } from "./ComposerTagNode"
import {
  createComposerDraftStateFromEditorState,
  createComposerDraftStateFromPlainText,
  createComposerFileTagData,
  createComposerMcpTagData,
  createComposerSkillTagData,
  normalizeComposerDraftState,
  readComposerTagIdentity,
  readComposerTagsFromDraftState,
  readTaggedMcpServerIDsFromDraftState,
} from "./draft-state"


interface ComposerProps {
  attachments: ComposerAttachment[]
  attachmentButtonTitle: string
  attachmentDisabledReason: string | null
  attachmentError: string | null
  canSend: boolean
  draftState: ComposerDraftState
  hasPendingPermissionRequests: boolean
  isSending: boolean
  mcpOptions: ComposerMcpOption[]
  modelOptions: ComposerModelOption[]
  onDraftStateChange: (value: ComposerDraftState) => void
  onMcpToggle?: (value: string) => void | Promise<void>
  onModelChange: (value: string | null) => void | Promise<void>
  onPermissionModeToggle?: () => void
  onPickAttachments: () => void | Promise<void>
  onReasoningEffortChange: (value: OpenAIReasoningEffort | null) => void
  onRemoveAttachment: (path: string) => void
  onCancelSend?: () => void | Promise<void>
  onSend: (draftStateOverride?: ComposerDraftState) => void | Promise<void>
  permissionMode?: ComposerPermissionMode
  placeholder?: string
  reasoningEffortOptions: ComposerReasoningEffortOption[]
  selectedMcpServerIDs: string[]
  selectedModel: string | null
  selectedModelLabel: string
  selectedReasoningEffort: OpenAIReasoningEffort | null
  selectedReasoningEffortLabel: string
  selectedSkillIDs: string[]
  showModelSelector?: boolean
  showProjectTagCommands?: boolean
  skillOptions: ComposerSkillOption[]
  unsupportedAttachmentPaths: string[]
  workspaceDirectory: string | null
}

type ComposerMenuKey = "model" | "reasoning" | null
type SlashCommandKey = "attach" | "file" | "mcp" | "model" | "permission" | "reasoning" | "skill"

interface ComposerTriggerMatch {
  end: number
  nodeKey: string
  start: number
}

type ComposerCommandMenuState =
  | {
      anchorRect: DOMRect | null
      kind: "mention"
      match: ComposerTriggerMatch
      query: string
    }
  | {
      anchorRect: DOMRect | null
      kind: "slash-command"
      match: ComposerTriggerMatch
      query: string
    }
  | {
      anchorRect: DOMRect | null
      kind: "slash-selector"
      match: ComposerTriggerMatch
      query: string
      selector: "file" | "mcp" | "skill"
    }

type ComposerCommandMenuItem =
  | {
      description: string
      disabled?: boolean
      group: string
      key: string
      label: string
      type: "command"
      value: SlashCommandKey
    }
  | {
      description: string
      disabled?: boolean
      group: string
      key: string
      label: string
      tagData: ComposerTagData
      type: "tag"
    }

type ComposerKeyAction =
  | {
      preventDefault: boolean
      step: -1 | 1
      type: "move-active"
    }
  | {
      preventDefault: boolean
      type: "close-menu" | "noop" | "select-active" | "send"
    }

const LEXICAL_INITIAL_CONFIG = {
  namespace: "DesktopComposer",
  nodes: [ComposerTagNode],
  onError(error: Error) {
    throw error
  },
}

const SLASH_COMMANDS: Array<{
  description: string
  label: string
  value: SlashCommandKey
}> = [
  {
    value: "file",
    label: "/file",
    description: "Search project files and insert an inline file tag.",
  },
  {
    value: "skill",
    label: "/skill",
    description: "Insert a project skill tag for this message only.",
  },
  {
    value: "mcp",
    label: "/mcp",
    description: "Enable a project MCP server and insert its inline tag.",
  },
  {
    value: "attach",
    label: "/attach",
    description: "Open the attachment picker for images or PDFs.",
  },
  {
    value: "model",
    label: "/model",
    description: "Open the model picker.",
  },
  {
    value: "reasoning",
    label: "/reasoning",
    description: "Open the reasoning-effort picker.",
  },
  {
    value: "permission",
    label: "/permission",
    description: "Toggle the current composer permission mode.",
  },
]


function isComposerSubmitKeyEvent(event: KeyboardEvent<HTMLElement>, isComposing: boolean) {
  if (event.key !== "Enter") return false
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false

  const nativeEvent = event.nativeEvent
  return !(isComposing || nativeEvent.isComposing || nativeEvent.keyCode === 229)
}

function getComposerSendButtonDescription({
  attachmentError,
  canSend,
  hasPendingPermissionRequests,
  isSending,
}: {
  attachmentError: string | null
  canSend: boolean
  hasPendingPermissionRequests: boolean
  isSending: boolean
}) {
  if (attachmentError) {
    return `${attachmentError} Press Shift+Enter for a newline.`
  }

  if (!canSend) {
    return "Choose a session or workspace before sending. Press Shift+Enter for a newline."
  }

  if (hasPendingPermissionRequests) {
    return "Enter is unavailable while approval requests are pending. Press Shift+Enter for a newline."
  }

  if (isSending) {
    return "Stop the current assistant turn. Press Shift+Enter for a newline."
  }

  return "Press Enter to send. Press Shift+Enter for a newline."
}

function getComposerSelectionRect() {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!range.collapsed || typeof range.getBoundingClientRect !== "function") return null
  return range.getBoundingClientRect()
}

function toSet(values: string[]) {
  return new Set(values)
}

function difference(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => !right.has(value))
}

function matchesQuery(value: string, query: string) {
  return value.toLowerCase().includes(query.trim().toLowerCase())
}

export function formatComposerAbsoluteFilePath(filePath: string) {
  return filePath.trim()
}

export function buildMenuStyle(anchorRect: DOMRect | null, containerRect: DOMRect | null): CSSProperties | undefined {
  if (!anchorRect || !containerRect) return undefined

  return {
    left: `${String(Math.max(0, anchorRect.left - containerRect.left))}px`,
    bottom: `${String(Math.max(0, containerRect.bottom - anchorRect.top + 10))}px`,
  }
}

export function shouldApplyExternalComposerDraftState(
  editor: Pick<LexicalEditor, "getEditorState">,
  lexicalJSON: string,
) {
  try {
    return JSON.stringify(editor.getEditorState().toJSON()) !== lexicalJSON
  } catch {
    return true
  }
}

function isComposerCommandMenuTextAnchor(anchorNode: unknown): anchorNode is Pick<TextNode, "getTextContent" | "isToken"> {
  return Boolean(
    anchorNode &&
      typeof anchorNode === "object" &&
      "getTextContent" in anchorNode &&
      typeof (anchorNode as { getTextContent?: unknown }).getTextContent === "function" &&
      "isToken" in anchorNode &&
      typeof (anchorNode as { isToken?: unknown }).isToken === "function",
  )
}

export function readComposerBeforeTextForCommandMenu(anchorNode: unknown, anchorOffset: number) {
  if (!isComposerCommandMenuTextAnchor(anchorNode) || anchorNode.isToken()) {
    return null
  }

  return anchorNode.getTextContent().slice(0, anchorOffset)
}

export function getComposerKeyAction({
  commandMenuItemCount,
  hasCommandMenu,
  isSubmitKeyEvent,
  key,
}: {
  commandMenuItemCount: number
  hasCommandMenu: boolean
  isSubmitKeyEvent: boolean
  key: string
}): ComposerKeyAction {
  if (hasCommandMenu) {
    if (key === "ArrowDown") {
      return commandMenuItemCount > 0
        ? { type: "move-active", step: 1, preventDefault: true }
        : { type: "noop", preventDefault: false }
    }

    if (key === "ArrowUp") {
      return commandMenuItemCount > 0
        ? { type: "move-active", step: -1, preventDefault: true }
        : { type: "noop", preventDefault: false }
    }

    if (key === "Escape") {
      return { type: "close-menu", preventDefault: true }
    }

    if (isSubmitKeyEvent) {
      return commandMenuItemCount > 0
        ? { type: "select-active", preventDefault: true }
        : { type: "noop", preventDefault: true }
    }

    return { type: "noop", preventDefault: false }
  }

  if (isSubmitKeyEvent) {
    return { type: "send", preventDefault: true }
  }

  return { type: "noop", preventDefault: false }
}

export function handleComposerCommandMenuMouseDown(
  event: Pick<ReactMouseEvent<HTMLButtonElement>, "button" | "preventDefault" | "stopPropagation">,
  onSelect: () => void,
) {
  if (event.button !== 0) {
    return false
  }

  event.preventDefault()
  event.stopPropagation()
  onSelect()
  return true
}

function createTextReplacement(editor: LexicalEditor, match: ComposerTriggerMatch, replacementText: string) {
  editor.update(() => {
    const node = $getNodeByKey(match.nodeKey)
    if (!$isTextNode(node)) return

    const text = node.getTextContent()
    const beforeText = text.slice(0, match.start)
    const afterText = text.slice(match.end)
    const nextTextNode = $createTextNode(`${beforeText}${replacementText}${afterText}`)
    node.replace(nextTextNode)
    const nextOffset = beforeText.length + replacementText.length
    nextTextNode.select(nextOffset, nextOffset)
  })
}

function insertTagAtMatch(editor: LexicalEditor, match: ComposerTriggerMatch, tagData: ComposerTagData) {
  editor.update(() => {
    const node = $getNodeByKey(match.nodeKey)
    if (!$isTextNode(node)) return

    const text = node.getTextContent()
    const beforeText = text.slice(0, match.start)
    const afterText = text.slice(match.end).replace(/^\s+/, "")
    const firstNode = beforeText.length > 0 ? $createTextNode(beforeText) : $createComposerTagNode(tagData)
    node.replace(firstNode)

    let cursor = firstNode
    if (beforeText.length > 0) {
      const tagNode = $createComposerTagNode(tagData)
      cursor.insertAfter(tagNode)
      cursor = tagNode
    }

    const trailingTextNode = $createTextNode(afterText.length > 0 ? ` ${afterText}` : " ")
    cursor.insertAfter(trailingTextNode)
    trailingTextNode.select(1, 1)
  })
}

function findTriggerMatch(inputText: string, pattern: RegExp) {
  const match = pattern.exec(inputText)
  if (!match) return null

  const triggerText = match[0].trimStart()
  return {
    groups: match.slice(1),
    start: inputText.length - triggerText.length,
    text: triggerText,
  }
}

function deriveCommandMenuState() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null

  const anchorNode = selection.anchor.getNode()
  if (!$isTextNode(anchorNode)) return null

  const beforeText = readComposerBeforeTextForCommandMenu(anchorNode, selection.anchor.offset)
  if (beforeText === null) return null

  const selectorMatch = findTriggerMatch(beforeText, /(^|\s)\/(file|skill|mcp)(?:\s+([^\n]*))?$/)
  if (selectorMatch) {
    return {
      anchorRect: getComposerSelectionRect(),
      kind: "slash-selector",
      match: {
        nodeKey: anchorNode.getKey(),
        start: selectorMatch.start,
        end: selection.anchor.offset,
      },
      query: selectorMatch.groups[2] ?? "",
      selector: selectorMatch.groups[1] as "file" | "mcp" | "skill",
    } satisfies ComposerCommandMenuState
  }

  const mentionMatch = findTriggerMatch(beforeText, /(^|\s)@([^\s@/]*)$/)
  if (mentionMatch) {
    return {
      anchorRect: getComposerSelectionRect(),
      kind: "mention",
      match: {
        nodeKey: anchorNode.getKey(),
        start: mentionMatch.start,
        end: selection.anchor.offset,
      },
      query: mentionMatch.groups[1] ?? "",
    } satisfies ComposerCommandMenuState
  }

  const slashCommandMatch = findTriggerMatch(beforeText, /(^|\s)\/([^\s]*)$/)
  if (slashCommandMatch) {
    return {
      anchorRect: getComposerSelectionRect(),
      kind: "slash-command",
      match: {
        nodeKey: anchorNode.getKey(),
        start: slashCommandMatch.start,
        end: selection.anchor.offset,
      },
      query: slashCommandMatch.groups[1] ?? "",
    } satisfies ComposerCommandMenuState
  }

  return null
}

function ComposerEditorSyncPlugin({
  draftState,
  onReady,
}: {
  draftState: ComposerDraftState
  onReady: (editor: LexicalEditor) => void
}) {
  const [editor] = useLexicalComposerContext()
  const lastLexicalJSONRef = useRef(draftState.lexicalJSON)

  useEffect(() => {
    onReady(editor)
  }, [editor, onReady])

  useEffect(() => {
    if (draftState.lexicalJSON === lastLexicalJSONRef.current) return

    if (!shouldApplyExternalComposerDraftState(editor, draftState.lexicalJSON)) {
      lastLexicalJSONRef.current = draftState.lexicalJSON
      return
    }

    const nextEditorState = editor.parseEditorState(draftState.lexicalJSON)
    editor.setEditorState(nextEditorState)
    lastLexicalJSONRef.current = draftState.lexicalJSON
  }, [draftState.lexicalJSON, editor])

  return null
}

export function Composer({
  attachments,
  attachmentButtonTitle,
  attachmentDisabledReason,
  attachmentError,
  canSend,
  draftState,
  hasPendingPermissionRequests,
  isSending,
  mcpOptions,
  modelOptions,
  onDraftStateChange,
  onMcpToggle,
  onModelChange,
  onPermissionModeToggle,
  onPickAttachments,
  onReasoningEffortChange,
  onRemoveAttachment,
  onCancelSend,
  onSend,
  permissionMode = "default",
  placeholder = "Describe the UI, implementation task, or review target for the agent.",
  reasoningEffortOptions,
  selectedMcpServerIDs,
  selectedModel,
  selectedModelLabel,
  selectedReasoningEffort,
  selectedReasoningEffortLabel,
  selectedSkillIDs,
  showModelSelector = true,
  showProjectTagCommands = true,
  skillOptions,
  unsupportedAttachmentPaths,
  workspaceDirectory,
}: ComposerProps) {
  const normalizedDraftState = normalizeComposerDraftState(draftState)
  const draftStateRef = useRef(normalizedDraftState)
  const editorRef = useRef<LexicalEditor | null>(null)
  const contentEditableRef = useRef<HTMLDivElement | null>(null)
  const footerRef = useRef<HTMLElement | null>(null)
  const isComposingRef = useRef(false)
  const fileSearchRequestRef = useRef(0)
  const pendingMcpDiffRef = useRef<{
    added: Set<string>
    removed: Set<string>
  } | null>(null)

  const [openMenu, setOpenMenu] = useState<ComposerMenuKey>(null)
  const [modelSearchQuery, setModelSearchQuery] = useState("")
  const [commandMenuState, setCommandMenuState] = useState<ComposerCommandMenuState | null>(null)
  const [commandMenuItems, setCommandMenuItems] = useState<ComposerCommandMenuItem[]>([])
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const commandMenuStateRef = useRef<ComposerCommandMenuState | null>(commandMenuState)
  const commandMenuItemsRef = useRef<ComposerCommandMenuItem[]>(commandMenuItems)
  const activeCommandIndexRef = useRef(activeCommandIndex)

  commandMenuStateRef.current = commandMenuState
  commandMenuItemsRef.current = commandMenuItems
  activeCommandIndexRef.current = activeCommandIndex

  function setCommandMenuStateWithRef(nextState: ComposerCommandMenuState | null) {
    commandMenuStateRef.current = nextState
    setCommandMenuState(nextState)
  }

  function setCommandMenuItemsWithRef(nextItems: ComposerCommandMenuItem[]) {
    commandMenuItemsRef.current = nextItems
    setCommandMenuItems(nextItems)
  }

  function getCurrentTagIdentities() {
    return new Set(readComposerTagsFromDraftState(draftStateRef.current).map(readComposerTagIdentity))
  }

  function buildSlashCommandItems(query: string) {
    return SLASH_COMMANDS
      .filter((command) => command.label.slice(1).includes(query.trim().toLowerCase()))
      .filter((command) => {
        if ((command.value === "skill" || command.value === "mcp" || command.value === "permission") && !showProjectTagCommands) {
          return false
        }

        if (command.value === "model" && !showModelSelector) {
          return false
        }

        if (command.value === "reasoning" && (!showModelSelector || reasoningEffortOptions.length === 0)) {
          return false
        }

        return true
      })
      .map((command) => ({
        type: "command",
        key: `command:${command.value}`,
        group: "Commands",
        label: command.label,
        description: command.description,
        value: command.value,
      } satisfies ComposerCommandMenuItem))
  }

  function buildSkillTagItems(query: string) {
    const currentTagIdentities = getCurrentTagIdentities()
    const selectedSkillIDSet = toSet(selectedSkillIDs)

    return skillOptions
      .filter((option) => matchesQuery(option.label, query) || matchesQuery(option.value, query))
      .map((option) => {
        const tagData = createComposerSkillTagData(option)
        const disabled = currentTagIdentities.has(readComposerTagIdentity(tagData))
        return {
          type: "tag",
          key: `skill:${option.value}`,
          group: "Skills",
          label: option.label,
          description: disabled
            ? "Already tagged in this draft."
            : selectedSkillIDSet.has(option.value)
              ? "Already selected in the project menu; this tag still keeps it in this message."
              : option.description,
          disabled,
          tagData,
        } satisfies ComposerCommandMenuItem
      })
  }

  function buildMcpTagItems(query: string) {
    const currentTagIdentities = getCurrentTagIdentities()
    const selectedMcpServerIDSet = toSet(selectedMcpServerIDs)

    return mcpOptions
      .filter((option) => matchesQuery(option.label, query) || matchesQuery(option.value, query))
      .map((option) => {
        const tagData = createComposerMcpTagData(option)
        const disabled = currentTagIdentities.has(readComposerTagIdentity(tagData))
        return {
          type: "tag",
          key: `mcp:${option.value}`,
          group: "MCP",
          label: option.label,
          description: disabled
            ? "Already tagged in this draft."
            : selectedMcpServerIDSet.has(option.value)
              ? "Already enabled in the project menu."
              : option.description,
          disabled,
          tagData,
        } satisfies ComposerCommandMenuItem
      })
  }

  function buildImmediateCommandMenuItems(state: ComposerCommandMenuState | null) {
    if (!state) return []

    if (state.kind === "slash-command") {
      return buildSlashCommandItems(state.query)
    }

    if (state.kind === "slash-selector") {
      if (state.selector === "skill") {
        return buildSkillTagItems(state.query)
      }

      if (state.selector === "mcp") {
        return buildMcpTagItems(state.query)
      }

      return []
    }

    return []
  }

  function readCommandMenuStateFromEditor() {
    return editorRef.current?.getEditorState().read(() => deriveCommandMenuState()) ?? null
  }

  useEffect(() => {
    draftStateRef.current = normalizedDraftState
  }, [normalizedDraftState])

  useEffect(() => {
    const element = contentEditableRef.current
    const editor = editorRef.current
    if (!element || !editor) return

    const handleSyntheticDraftChange = (event: Event) => {
      const nextValue =
        event instanceof CustomEvent && typeof event.detail?.value === "string"
          ? event.detail.value
          : element.textContent ?? ""
      const nextDraftState = createComposerDraftStateFromPlainText(nextValue)
      const nextEditorState = editor.parseEditorState(nextDraftState.lexicalJSON)

      draftStateRef.current = nextDraftState
      setCommandMenuStateWithRef(null)
      editor.setEditorState(nextEditorState)
      onDraftStateChange(nextDraftState)
    }

    element.addEventListener("desktop-composer-change", handleSyntheticDraftChange)
    return () => {
      element.removeEventListener("desktop-composer-change", handleSyntheticDraftChange)
    }
  }, [onDraftStateChange])

  useEffect(() => {
    if (!openMenu) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (!footerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null)
      }
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [openMenu])

  useEffect(() => {
    if (openMenu === "model" || modelSearchQuery === "") return
    setModelSearchQuery("")
  }, [modelSearchQuery, openMenu])

  useEffect(() => {
    if (!commandMenuState) {
      setCommandMenuItemsWithRef([])
      return
    }

    async function buildFileTagItems(query: string) {
      if (!workspaceDirectory || !query.trim() || !window.desktop?.searchWorkspaceFiles) {
        return [] as ComposerCommandMenuItem[]
      }

      const currentTagIdentities = getCurrentTagIdentities()
      const requestID = ++fileSearchRequestRef.current
      const results = await window.desktop.searchWorkspaceFiles({
        directory: workspaceDirectory,
        query,
      })

      if (fileSearchRequestRef.current !== requestID) {
        return null
      }

      return results.map((result) => {
        const tagData = createComposerFileTagData(result.absolutePath ?? result.path, result.path)
        const filePathDescription = formatComposerAbsoluteFilePath(result.absolutePath ?? result.path)
        return {
          type: "tag",
          key: `file:${result.path}`,
          group: "Files",
          label: result.name,
          description: filePathDescription,
          disabled: currentTagIdentities.has(readComposerTagIdentity(tagData)),
          tagData,
        } satisfies ComposerCommandMenuItem
      })
    }

    if (commandMenuState.kind === "slash-command") {
      setCommandMenuItemsWithRef(buildSlashCommandItems(commandMenuState.query))
      return
    }

    if (commandMenuState.kind === "slash-selector") {
      const query = commandMenuState.query
      if (commandMenuState.selector === "skill") {
        setCommandMenuItemsWithRef(buildSkillTagItems(query))
        return
      }

      if (commandMenuState.selector === "mcp") {
        setCommandMenuItemsWithRef(buildMcpTagItems(query))
        return
      }

      void buildFileTagItems(query).then((items) => {
        if (items) {
          setCommandMenuItemsWithRef(items)
        }
      })
      return
    }

    setCommandMenuItemsWithRef([])
    void buildFileTagItems(commandMenuState.query).then((fileItems) => {
      if (!fileItems) return
      setCommandMenuItemsWithRef(fileItems)
    })
  }, [
    commandMenuState,
    mcpOptions,
    reasoningEffortOptions.length,
    selectedMcpServerIDs,
    selectedSkillIDs,
    showModelSelector,
    showProjectTagCommands,
    skillOptions,
    workspaceDirectory,
  ])

  useEffect(() => {
    if (activeCommandIndex < commandMenuItems.length) return
    activeCommandIndexRef.current = 0
    setActiveCommandIndex(0)
  }, [activeCommandIndex, commandMenuItems.length])

  function handleModelSelect(value: string | null) {
    setOpenMenu(null)
    void onModelChange(value)
  }

  function handleReasoningEffortSelect(value: OpenAIReasoningEffort | null) {
    setOpenMenu(null)
    onReasoningEffortChange(value)
  }

  function handleEditorReady(editor: LexicalEditor) {
    editorRef.current = editor
  }

  function syncMcpDiff(nextDraftState: ComposerDraftState) {
    if (!showProjectTagCommands || !onMcpToggle) return

    const previousMcpIDs = new Set(readTaggedMcpServerIDsFromDraftState(draftStateRef.current))
    const nextMcpIDs = new Set(readTaggedMcpServerIDsFromDraftState(nextDraftState))
    const pendingDiff = pendingMcpDiffRef.current
    pendingMcpDiffRef.current = null

    const added = difference(nextMcpIDs, previousMcpIDs).filter((value) => !pendingDiff?.added.has(value))
    const removed = difference(previousMcpIDs, nextMcpIDs).filter((value) => !pendingDiff?.removed.has(value))

    for (const serverID of [...added, ...removed]) {
      void onMcpToggle(serverID)
    }
  }

  function handleEditorChange(editorState: ReturnType<LexicalEditor["getEditorState"]>) {
    const nextDraftState = createComposerDraftStateFromEditorState(editorState)
    const nextCommandMenuState = editorState.read(() => deriveCommandMenuState())

    setCommandMenuStateWithRef(nextCommandMenuState)
    if (nextDraftState.lexicalJSON === draftStateRef.current.lexicalJSON && nextDraftState.plainText === draftStateRef.current.plainText) {
      return
    }

    syncMcpDiff(nextDraftState)
    draftStateRef.current = nextDraftState
    onDraftStateChange(nextDraftState)
  }

  function replaceCurrentTriggerWithCommand(command: SlashCommandKey) {
    const editor = editorRef.current
    const currentCommandMenuState = commandMenuStateRef.current ?? readCommandMenuStateFromEditor()
    if (!editor || !currentCommandMenuState || currentCommandMenuState.kind !== "slash-command") return

    if (command === "file" || command === "skill" || command === "mcp") {
      createTextReplacement(editor, currentCommandMenuState.match, `/${command} `)
      return
    }

    createTextReplacement(editor, currentCommandMenuState.match, "")
    setCommandMenuStateWithRef(null)

    if (command === "attach") {
      void onPickAttachments()
      return
    }

    if (command === "model") {
      setOpenMenu("model")
      return
    }

    if (command === "reasoning") {
      setOpenMenu("reasoning")
      return
    }

    if (command === "permission") {
      onPermissionModeToggle?.()
    }
  }

  function handleCommandMenuItemSelect(item: ComposerCommandMenuItem) {
    if (item.disabled) return

    const currentCommandMenuState = commandMenuStateRef.current ?? readCommandMenuStateFromEditor()

    if (item.type === "command") {
      replaceCurrentTriggerWithCommand(item.value)
      return
    }

    const editor = editorRef.current
    if (!editor || !currentCommandMenuState) return

    if (item.tagData.kind === "mcp") {
      pendingMcpDiffRef.current = {
        added: new Set([item.tagData.serverID]),
        removed: new Set(),
      }

      if (!selectedMcpServerIDs.includes(item.tagData.serverID)) {
        void onMcpToggle?.(item.tagData.serverID)
      }
    }

    insertTagAtMatch(editor, currentCommandMenuState.match, item.tagData)
    setCommandMenuStateWithRef(null)
  }

  function isEditorEventTarget(target: EventTarget | null) {
    return target instanceof Node && contentEditableRef.current?.contains(target)
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLElement>) {
    const currentCommandMenuState = commandMenuStateRef.current ?? readCommandMenuStateFromEditor()
    const currentCommandMenuItems =
      commandMenuItemsRef.current.length > 0 ? commandMenuItemsRef.current : buildImmediateCommandMenuItems(currentCommandMenuState)
    const action = getComposerKeyAction({
      key: event.key,
      isSubmitKeyEvent: isComposerSubmitKeyEvent(event, isComposingRef.current),
      hasCommandMenu: currentCommandMenuState !== null,
      commandMenuItemCount: currentCommandMenuItems.length,
    })

    if (action.preventDefault) {
      event.preventDefault()
      event.stopPropagation()
    }

    if (action.type === "move-active") {
      setActiveCommandIndex((current) => {
        const nextIndex = (current + action.step + currentCommandMenuItems.length) % currentCommandMenuItems.length
        activeCommandIndexRef.current = nextIndex
        return nextIndex
      })
      return
    }

    if (action.type === "close-menu") {
      setCommandMenuStateWithRef(null)
      return
    }

    if (action.type === "select-active") {
      const activeItem = currentCommandMenuItems[activeCommandIndexRef.current]
      if (activeItem) {
        handleCommandMenuItemSelect(activeItem)
      }
      return
    }

    if (action.type === "send") {
      if (!isEditorEventTarget(event.target)) return
      void onSend(draftStateRef.current)
      return
    }
  }

  const unsupportedAttachmentPathSet = new Set(unsupportedAttachmentPaths)
  const sendButtonLabel = isSending ? "Stop task" : hasPendingPermissionRequests ? "Resolve approval first" : "Send task"
  const sendButtonDescription = getComposerSendButtonDescription({
    attachmentError,
    canSend,
    hasPendingPermissionRequests,
    isSending,
  })
  const sendButtonTitle = `${sendButtonLabel}. ${sendButtonDescription}`
  const sendShortcut = !isSending && canSend && !hasPendingPermissionRequests ? "Enter" : undefined
  const sendButtonDisabled = isSending ? !onCancelSend : !canSend || hasPendingPermissionRequests || attachmentError !== null
  const showReasoningEffortSelector = showModelSelector && reasoningEffortOptions.length > 0
  const selectedReasoningEffortButtonLabel = `Reasoning: ${selectedReasoningEffortLabel}`
  const normalizedModelSearchQuery = modelSearchQuery.trim().toLowerCase()
  const visibleModelOptions =
    normalizedModelSearchQuery.length === 0
      ? modelOptions
      : modelOptions.filter((option) =>
          `${option.label} ${option.value}`.toLowerCase().includes(normalizedModelSearchQuery),
        )
  const modelMenuEmptyLabel =
    modelOptions.length === 0 ? "No visible models are available for this project yet." : "No models match your search."
  const commandMenuEmptyLabel =
    commandMenuState?.kind === "mention" || (commandMenuState?.kind === "slash-selector" && commandMenuState.selector === "file")
      ? "Type a file name to search this project."
      : commandMenuState?.kind === "slash-command"
        ? "No matching commands."
        : "No matching commands or tags."

  return (
    <footer ref={footerRef} className="composer prompt-input-shell" onKeyDownCapture={handleEditorKeyDown}>
      <LexicalComposer
        initialConfig={{
          ...LEXICAL_INITIAL_CONFIG,
          editorState: normalizedDraftState.lexicalJSON,
        }}
      >
        <div className="composer-editor-shell">
          <ComposerEditorSyncPlugin draftState={normalizedDraftState} onReady={handleEditorReady} />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleEditorChange} />
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                aria-description={sendButtonDescription}
                aria-label="Task draft"
                className="composer-editor-input"
                onCompositionEnd={() => {
                  isComposingRef.current = false
                }}
                onCompositionStart={() => {
                  isComposingRef.current = true
                }}
                ref={contentEditableRef}
              />
            }
            ErrorBoundary={LexicalErrorBoundary}
            placeholder={<div className="composer-editor-placeholder">{placeholder}</div>}
          />
        </div>
      </LexicalComposer>

      {commandMenuState ? (
        <div
          className="composer-command-menu"
          data-kind={commandMenuState.kind}
          role="listbox"
          aria-label="Composer commands"
        >
          {commandMenuItems.length > 0 ? (
            commandMenuItems.map((item, index) => (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={index === activeCommandIndex}
                className={index === activeCommandIndex ? "composer-command-option is-active" : "composer-command-option"}
                disabled={item.disabled}
                onMouseDown={(event) => {
                  handleComposerCommandMenuMouseDown(event, () => handleCommandMenuItemSelect(item))
                }}
              >
                <span
                  className={
                    item.type === "tag" && item.tagData.kind === "file"
                      ? "composer-command-option-copy is-file"
                      : "composer-command-option-copy"
                  }
                >
                  <strong>{item.label}</strong>
                  {item.type === "tag" && item.tagData.kind === "file" && item.description ? (
                    <span className="composer-command-option-meta" title={item.description}>
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </button>
            ))
          ) : (
            <div className="composer-command-empty">{commandMenuEmptyLabel}</div>
          )}
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="composer-attachment-strip" aria-label="Selected attachments">
          {attachments.map((attachment) => (
            <div
              key={attachment.path}
              className={
                unsupportedAttachmentPathSet.has(attachment.path)
                  ? "composer-attachment-chip is-invalid"
                  : "composer-attachment-chip"
              }
            >
              <span className="composer-attachment-name" title={attachment.path}>
                {attachment.name}
              </span>
              <button
                aria-label={`Remove ${attachment.name}`}
                className="composer-attachment-remove"
                onClick={() => onRemoveAttachment(attachment.path)}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachmentError ? (
        <p className="composer-attachment-note" role="alert">
          {attachmentError}
        </p>
      ) : null}

      <div className="composer-toolbar">
        <div className="composer-selectors" aria-label="Composer options">
          <button
            aria-label="Add attachments"
            className="composer-selector-button is-icon-only"
            disabled={attachmentDisabledReason !== null}
            onClick={() => void onPickAttachments()}
            title={attachmentButtonTitle}
            type="button"
          >
            <PaperclipIcon />
          </button>

          {showModelSelector ? (
            <div className="composer-menu-anchor">
              <button
                aria-expanded={openMenu === "model"}
                aria-haspopup="listbox"
                aria-label={`Select model: ${selectedModelLabel}`}
                className="composer-selector-button"
                onClick={() => setOpenMenu((current) => (current === "model" ? null : "model"))}
                type="button"
              >
                <span>{selectedModelLabel}</span>
                <ChevronDownIcon />
              </button>

              {openMenu === "model" ? (
                <div className="composer-menu-panel">
                  <div className="composer-menu-search" role="presentation">
                    <input
                      aria-label="Search models"
                      autoFocus
                      className="composer-menu-search-input"
                      onChange={(event) => setModelSearchQuery(event.currentTarget.value)}
                      placeholder="Search models"
                      type="search"
                      value={modelSearchQuery}
                    />
                  </div>
                  <div className="composer-menu-options" role="listbox" aria-label="Model selection">
                    <button
                      aria-selected={selectedModel === null}
                      className={selectedModel === null ? "composer-menu-option is-selected" : "composer-menu-option"}
                      onClick={() => handleModelSelect(null)}
                      role="option"
                      type="button"
                    >
                      <span>Use server default</span>
                    </button>
                    {visibleModelOptions.length > 0 ? (
                      visibleModelOptions.map((option) => (
                        <button
                          key={option.value}
                          aria-selected={selectedModel === option.value}
                          className={selectedModel === option.value ? "composer-menu-option is-selected" : "composer-menu-option"}
                          onClick={() => handleModelSelect(option.value)}
                          role="option"
                          type="button"
                        >
                          <span>{option.label}</span>
                        </button>
                      ))
                    ) : (
                      <p className="composer-menu-empty">{modelMenuEmptyLabel}</p>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {showReasoningEffortSelector ? (
            <div className="composer-menu-anchor">
              <button
                aria-expanded={openMenu === "reasoning"}
                aria-haspopup="listbox"
                aria-label={`Select reasoning effort: ${selectedReasoningEffortLabel}`}
                className="composer-selector-button"
                onClick={() => setOpenMenu((current) => (current === "reasoning" ? null : "reasoning"))}
                type="button"
              >
                <span>{selectedReasoningEffortButtonLabel}</span>
                <ChevronDownIcon />
              </button>

              {openMenu === "reasoning" ? (
                <div className="composer-menu-panel is-scrollbar-hidden" role="listbox" aria-label="Reasoning effort selection">
                  <button
                    aria-selected={selectedReasoningEffort === null}
                    className={selectedReasoningEffort === null ? "composer-menu-option is-selected" : "composer-menu-option"}
                    onClick={() => handleReasoningEffortSelect(null)}
                    role="option"
                    type="button"
                  >
                    <span>Model default</span>
                  </button>
                  {reasoningEffortOptions.map((option) => (
                    <button
                      key={option.value}
                      aria-selected={selectedReasoningEffort === option.value}
                      className={
                        selectedReasoningEffort === option.value
                          ? "composer-menu-option is-selected"
                          : "composer-menu-option"
                      }
                      onClick={() => handleReasoningEffortSelect(option.value)}
                      role="option"
                      type="button"
                    >
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="composer-actions">
          <button
            aria-description={sendButtonDescription}
            aria-keyshortcuts={sendShortcut}
            aria-label={sendButtonLabel}
            className="primary-button is-icon-only"
            disabled={sendButtonDisabled}
            onClick={() => {
              if (isSending) {
                void onCancelSend?.()
                return
              }

              void onSend(draftStateRef.current)
            }}
            title={sendButtonTitle}
            type="button"
          >
            {isSending ? <StopIcon /> : <ArrowUpIcon />}
          </button>
        </div>
      </div>
    </footer>
  )
}
