import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isParagraphNode,
  $isTextNode,
  createEditor,
  type EditorState,
  type LexicalEditor,
} from "lexical"
import type {
  ComposerCommentReference,
  ComposerDraftState,
  ComposerMcpOption,
  ComposerSkillOption,
  ComposerTagData,
  UserTurnReference,
} from "../types"
import { $createComposerTagNode, $isComposerTagNode, ComposerTagNode } from "./ComposerTagNode"

export interface CompiledComposerSubmission {
  commentReferences: ComposerCommentReference[]
  displayText: string
  selectedSkillIDs: string[]
  taggedFilePaths: string[]
  taggedMcpServerIDs: string[]
  userReferences: UserTurnReference[]
  transportText: string
}

function createComposerDraftEditor() {
  return createEditor({
    namespace: "DesktopComposerDraftState",
    nodes: [ComposerTagNode],
    onError(error) {
      throw error
    },
  })
}

function runComposerEditorUpdate<T>(
  draftState: ComposerDraftState,
  callback: (editor: LexicalEditor) => T,
) {
  const editor = createComposerDraftEditor()
  const normalizedDraftState = normalizeComposerDraftState(draftState)
  const parsedEditorState = editor.parseEditorState(normalizedDraftState.lexicalJSON)
  editor.setEditorState(parsedEditorState)

  let result: T
  editor.update(() => {
    result = callback(editor)
  }, { discrete: true })

  return {
    draftState: createComposerDraftStateFromEditorState(editor.getEditorState()),
    result: result!,
  }
}

function readComposerEditorState<T>(draftState: ComposerDraftState, callback: () => T) {
  const editor = createComposerDraftEditor()
  const normalizedDraftState = normalizeComposerDraftState(draftState)
  const parsedEditorState = editor.parseEditorState(normalizedDraftState.lexicalJSON)
  editor.setEditorState(parsedEditorState)

  let result: T
  editor.getEditorState().read(() => {
    result = callback()
  })
  return result!
}

function createEmptyLexicalJSON() {
  const editor = createComposerDraftEditor()
  editor.update(() => {
    $getRoot().append($createParagraphNode())
  }, { discrete: true })
  return JSON.stringify(editor.getEditorState().toJSON())
}

function ensureParagraphAtRootEnd() {
  const root = $getRoot()
  const lastChild = root.getLastChild()
  if (lastChild && $isParagraphNode(lastChild)) {
    return lastChild
  }

  const paragraph = $createParagraphNode()
  root.append(paragraph)
  return paragraph
}

function removeComposerTagNode(node: ComposerTagNode) {
  const previousSibling = node.getPreviousSibling()
  const nextSibling = node.getNextSibling()
  const previousText = $isTextNode(previousSibling) ? previousSibling.getTextContent() : null
  const nextText = $isTextNode(nextSibling) ? nextSibling.getTextContent() : null

  if ($isTextNode(previousSibling) && previousText === " " && $isTextNode(nextSibling) && nextText === " ") {
    previousSibling.remove()
    nextSibling.remove()
    node.remove()
    return
  }

  if ($isTextNode(nextSibling)) {
    if (nextText === " ") {
      nextSibling.remove()
      if ($isTextNode(previousSibling) && previousText && previousText.endsWith(" ")) {
        previousSibling.setTextContent(previousText.slice(0, -1))
      }
    } else if (nextText && nextText.startsWith(" ")) {
      nextSibling.setTextContent(nextText.slice(1))
    }
  } else if ($isTextNode(previousSibling)) {
    if (previousText && previousText.endsWith(" ")) {
      previousSibling.setTextContent(previousText.slice(0, -1))
    }
  }

  node.remove()
}

function collectComposerTagNodes() {
  const tags: ComposerTagNode[] = []

  for (const paragraph of $getRoot().getChildren()) {
    if (!$isParagraphNode(paragraph)) continue

    for (const child of paragraph.getChildren()) {
      if ($isComposerTagNode(child)) {
        tags.push(child)
      }
    }
  }

  return tags
}

function collectComposerTagData() {
  return collectComposerTagNodes().map((node) => node.getTagData())
}

function isPreviewCommentTag(
  tag: ComposerTagData,
): tag is Extract<ComposerTagData, { kind: "comment"; source: "preview" }> {
  return tag.kind === "comment" && (tag as { source?: string }).source === "preview"
}

function isPreviewCommentReference(
  reference: ComposerCommentReference,
): reference is Extract<ComposerCommentReference, { source: "preview" }> {
  return reference.source === "preview"
}

function buildComposerCommentReferences(tags: ComposerTagData[]): ComposerCommentReference[] {
  const references: ComposerCommentReference[] = []

  for (const tag of tags) {
    if (tag.kind !== "comment") continue

    if (isPreviewCommentTag(tag)) {
      references.push({
        id: tag.id,
        label: tag.label,
        title: tag.title,
        prompt: tag.prompt,
        source: "preview",
        comment: tag.comment,
        pageUrl: tag.pageUrl,
      })
      continue
    }

    references.push({
      id: tag.id,
      filePath: tag.filePath,
      startLineNumber: tag.startLineNumber,
      endLineNumber: tag.endLineNumber,
      label: tag.label,
      title: tag.title,
      prompt: tag.prompt,
      source: "file",
    })
  }

  return references
}

function buildComposerUserReferences(tags: ComposerTagData[]) {
  const references: UserTurnReference[] = []
  const seen = new Set<string>()

  for (const tag of tags) {
    if (tag.kind === "file") {
      const identity = `file:${tag.filePath}`
      if (seen.has(identity)) continue
      seen.add(identity)
      references.push({
        id: identity,
        label: tag.label,
        kind: "file",
        title: tag.filePath,
      })
      continue
    }

    if (tag.kind === "comment") {
      const identity = `comment:${tag.id}`
      if (seen.has(identity)) continue
      seen.add(identity)
      references.push({
        id: tag.id,
        label: tag.label,
        kind: "comment",
        title: tag.title,
      })
    }
  }

  return references
}

function getComposerTagIdentity(tag: ComposerTagData) {
  switch (tag.kind) {
    case "comment":
      return `comment:${tag.id}`
    case "file":
      return `file:${tag.filePath}`
    case "mcp":
      return `mcp:${tag.serverID}`
    case "skill":
      return `skill:${tag.skillID}`
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function stripComposerTagTokens(text: string, tags: ComposerTagData[]) {
  let nextText = text
  const tokens = [...new Set(tags.map((tag) => `@${tag.label}`).filter((token) => token.trim().length > 1))]
    .sort((left, right) => right.length - left.length)

  for (const token of tokens) {
    nextText = nextText.replace(new RegExp(`(^|\\s)${escapeRegExp(token)}(?=\\s|$)`, "g"), "$1")
  }

  return nextText
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function readPreviewCommentValue(value: string | null | undefined) {
  const trimmedValue = value?.trim()
  return trimmedValue ? trimmedValue : "Unavailable"
}

function formatPreviewCommentPosition(comment: ComposerCommentReference & { source: "preview" }) {
  const explicitPosition = comment.comment.nodePosition?.trim()
  if (explicitPosition) return explicitPosition
  return `${Math.round(comment.comment.x)}%, ${Math.round(comment.comment.y)}%`
}

function buildPreviewCommentContext(
  previewCommentReferences: Array<ComposerCommentReference & { source: "preview" }>,
  requestText: string,
) {
  if (previewCommentReferences.length === 0) return ""

  const lines = ["# Diff comments:", ""]
  for (const [index, reference] of previewCommentReferences.entries()) {
    const comment = reference.comment
    const pageUrl = readPreviewCommentValue(comment.pageUrl ?? comment.url ?? reference.pageUrl)
    const anchor = comment.anchor

    lines.push(
      `## Comment ${index + 1}`,
      `Node position: ${formatPreviewCommentPosition(reference)}`,
      `Page URL: ${pageUrl}`,
      `Frame: ${readPreviewCommentValue(comment.frame)}`,
      `Target: ${readPreviewCommentValue(anchor?.label ?? anchor?.tagName)}`,
      `Target selector: ${readPreviewCommentValue(anchor?.selector)}`,
      `Target path: ${readPreviewCommentValue(anchor?.path)}`,
      `Saved marker screenshot: ${readPreviewCommentValue(comment.screenshotPath)}`,
      "Comment:",
      comment.text.trim(),
      "",
    )
  }

  const currentUrl = readPreviewCommentValue(
    previewCommentReferences.at(-1)?.comment.pageUrl ??
      previewCommentReferences.at(-1)?.comment.url ??
      previewCommentReferences.at(-1)?.pageUrl,
  )

  lines.push(
    "# In app browser:",
    "- The user has the in-app browser open.",
    `- Current URL: ${currentUrl}`,
    "",
    "## User request:",
    requestText,
  )

  return lines.join("\n").trim()
}

function createParagraphFromText(text: string) {
  const paragraph = $createParagraphNode()
  if (text.length > 0) {
    paragraph.append($createTextNode(text))
  }
  return paragraph
}

export function createComposerDraftStateFromEditorState(editorState: EditorState): ComposerDraftState {
  return editorState.read(() => ({
    lexicalJSON: JSON.stringify(editorState.toJSON()),
    plainText: $getRoot().getTextContent(),
  }))
}

export function createEmptyComposerDraftState(): ComposerDraftState {
  return {
    lexicalJSON: createEmptyLexicalJSON(),
    plainText: "",
  }
}

export function createComposerDraftStateFromPlainText(text: string): ComposerDraftState {
  const editor = createComposerDraftEditor()

  editor.update(() => {
    const root = $getRoot()
    root.clear()

    const lines = text.split("\n")
    for (const line of lines) {
      root.append(createParagraphFromText(line))
    }

    if (lines.length === 0) {
      root.append($createParagraphNode())
    }
  }, { discrete: true })

  return createComposerDraftStateFromEditorState(editor.getEditorState())
}

export function normalizeComposerDraftState(draftState: ComposerDraftState | null | undefined) {
  if (!draftState?.lexicalJSON) {
    return createEmptyComposerDraftState()
  }

  try {
    const editor = createComposerDraftEditor()
    return createComposerDraftStateFromEditorState(editor.parseEditorState(draftState.lexicalJSON))
  } catch {
    return createEmptyComposerDraftState()
  }
}

export function readComposerTagsFromDraftState(draftState: ComposerDraftState) {
  return readComposerEditorState(draftState, () => collectComposerTagData())
}

export function appendTextToComposerDraftState(draftState: ComposerDraftState, value: string) {
  const trimmedValue = value.trim()
  if (!trimmedValue) return normalizeComposerDraftState(draftState)

  return runComposerEditorUpdate(draftState, () => {
    const root = $getRoot()
    const hasMeaningfulContent = root.getTextContent().trim().length > 0

    if (!hasMeaningfulContent) {
      root.clear()
      root.append(createParagraphFromText(trimmedValue))
      return
    }

    const lastChild = root.getLastChild()
    if (!lastChild || !$isParagraphNode(lastChild) || lastChild.getChildrenSize() > 0) {
      root.append($createParagraphNode())
    }

    root.append(createParagraphFromText(trimmedValue))
  }).draftState
}

export function appendComposerTagToDraftState(draftState: ComposerDraftState, tagData: ComposerTagData) {
  const nextIdentity = getComposerTagIdentity(tagData)
  if (readComposerTagsFromDraftState(draftState).some((tag) => getComposerTagIdentity(tag) === nextIdentity)) {
    return normalizeComposerDraftState(draftState)
  }

  return runComposerEditorUpdate(draftState, () => {
    const paragraph = ensureParagraphAtRootEnd()
    const lastChild = paragraph.getLastChild()

    if ($isTextNode(lastChild)) {
      const lastText = lastChild.getTextContent()
      if (!lastText.endsWith(" ")) {
        paragraph.append($createTextNode(" "))
      }
    } else if (lastChild) {
      paragraph.append($createTextNode(" "))
    }

    paragraph.append($createComposerTagNode(tagData))
    paragraph.append($createTextNode(" "))
  }).draftState
}

export function removeComposerTagFromDraftState(
  draftState: ComposerDraftState,
  predicate: ((tag: ComposerTagData) => boolean) | string,
) {
  return runComposerEditorUpdate(draftState, () => {
    const matcher =
      typeof predicate === "string"
        ? (tag: ComposerTagData) => getComposerTagIdentity(tag) === predicate || tag.id === predicate
        : predicate

    for (const node of collectComposerTagNodes()) {
      if (matcher(node.getTagData())) {
        removeComposerTagNode(node)
      }
    }

    if ($getRoot().getChildrenSize() === 0) {
      $getRoot().append($createParagraphNode())
    }
  }).draftState
}

export function createComposerFileTagData(filePath: string, label = filePath): ComposerTagData {
  return {
    kind: "file",
    id: `file:${filePath}`,
    label,
    filePath,
  }
}

export function createComposerCommentTagData(reference: ComposerCommentReference): ComposerTagData {
  if (reference.source === "preview") {
    return {
      kind: "comment",
      source: "preview",
      id: reference.id,
      label: reference.label,
      title: reference.title,
      prompt: reference.prompt,
      comment: reference.comment,
      pageUrl: reference.pageUrl,
    }
  }

  return {
    kind: "comment",
    source: "file",
    id: reference.id,
    label: reference.label,
    filePath: reference.filePath,
    startLineNumber: reference.startLineNumber,
    endLineNumber: reference.endLineNumber,
    title: reference.title,
    prompt: reference.prompt,
  }
}

export function createComposerSkillTagData(option: ComposerSkillOption): ComposerTagData {
  return {
    kind: "skill",
    id: `skill:${option.value}`,
    label: option.label,
    skillID: option.value,
    description: option.description,
  }
}

export function createComposerMcpTagData(option: ComposerMcpOption): ComposerTagData {
  return {
    kind: "mcp",
    id: `mcp:${option.value}`,
    label: option.label,
    serverID: option.value,
    description: option.description,
  }
}

export function syncComposerMcpTagsWithSelection(
  draftState: ComposerDraftState,
  selectedServerIDs: string[],
  options: ComposerMcpOption[],
) {
  const selectedIDSet = new Set(selectedServerIDs)
  const optionsByID = new Map(options.map((option) => [option.value, option]))
  let nextDraftState = normalizeComposerDraftState(draftState)

  const existingTags = readComposerTagsFromDraftState(nextDraftState).filter((tag) => tag.kind === "mcp")
  for (const tag of existingTags) {
    if (!selectedIDSet.has(tag.serverID)) {
      nextDraftState = removeComposerTagFromDraftState(nextDraftState, (candidate) =>
        candidate.kind === "mcp" && candidate.serverID === tag.serverID,
      )
    }
  }

  for (const serverID of selectedServerIDs) {
    const option = optionsByID.get(serverID)
    nextDraftState = appendComposerTagToDraftState(
      nextDraftState,
      createComposerMcpTagData(option ?? { value: serverID, label: serverID, description: "Project MCP server" }),
    )
  }

  return nextDraftState
}

export function compileComposerSubmission(input: {
  draftState: ComposerDraftState
  selectedSkillIDs?: string[]
}) {
  const normalizedDraftState = normalizeComposerDraftState(input.draftState)
  const tags = readComposerTagsFromDraftState(normalizedDraftState)
  const commentReferences = buildComposerCommentReferences(tags)
  const previewCommentReferences = commentReferences.filter(isPreviewCommentReference)
  const fileCommentReferences = commentReferences.filter((reference) => !isPreviewCommentReference(reference))
  const userReferences = buildComposerUserReferences(tags)
  const taggedFilePaths = [...new Set(tags.flatMap((tag) => (tag.kind === "file" ? [tag.filePath] : [])))]
  const taggedMcpServerIDs = [...new Set(tags.flatMap((tag) => (tag.kind === "mcp" ? [tag.serverID] : [])))]
  const selectedSkillIDs = [
    ...new Set([
      ...(input.selectedSkillIDs ?? []),
      ...tags.flatMap((tag) => (tag.kind === "skill" ? [tag.skillID] : [])),
    ]),
  ]

  const transportSections = []
  if (taggedFilePaths.length > 0) {
    transportSections.push(`Referenced files:\n${taggedFilePaths.map((filePath) => `- ${filePath}`).join("\n")}`)
  }

  const commentPrompt = fileCommentReferences
    .map((reference) => reference.prompt.trim())
    .filter(Boolean)
    .join("\n\n")
  if (commentPrompt) {
    transportSections.push(commentPrompt)
  }

  const displayText = normalizedDraftState.plainText.trim()
  const requestText = stripComposerTagTokens(displayText, tags)
  const previewCommentPrompt = buildPreviewCommentContext(previewCommentReferences, requestText)
  if (previewCommentPrompt) {
    transportSections.push(previewCommentPrompt)
  }
  const leadingText = previewCommentReferences.length > 0 ? "" : displayText

  return {
    commentReferences,
    displayText,
    selectedSkillIDs,
    taggedFilePaths,
    taggedMcpServerIDs,
    userReferences,
    transportText: [leadingText, ...transportSections].filter(Boolean).join("\n\n"),
  } satisfies CompiledComposerSubmission
}

export function readTaggedMcpServerIDsFromDraftState(draftState: ComposerDraftState) {
  return readComposerTagsFromDraftState(draftState).flatMap((tag) => (tag.kind === "mcp" ? [tag.serverID] : []))
}

export function readComposerTagIdentity(tag: ComposerTagData) {
  return getComposerTagIdentity(tag)
}
