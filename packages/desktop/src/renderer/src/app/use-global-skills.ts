import { useEffect, useMemo, useRef, useState } from "react"
import type { GlobalSkillTreeNode } from "./types"

interface UseGlobalSkillsOptions {
  onSkillsUpdated?: () => void | Promise<void>
}

function findFirstSkillFile(nodes: GlobalSkillTreeNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.name === "SKILL.md") {
      return node.path
    }
  }

  for (const node of nodes) {
    if (node.kind === "directory") {
      const nested = findFirstSkillFile(node.children ?? [])
      if (nested) return nested
    }
  }

  for (const node of nodes) {
    if (node.kind === "file") {
      return node.path
    }
  }

  return null
}

function findDirectoryAncestors(
  nodes: GlobalSkillTreeNode[],
  targetPath: string,
  trail: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.kind === "file" && node.path === targetPath) {
      return trail
    }

    if (node.kind === "directory") {
      if (node.path === targetPath) {
        return [...trail, node.path]
      }

      const nested = findDirectoryAncestors(node.children ?? [], targetPath, [...trail, node.path])
      if (nested) return nested
    }
  }

  return null
}

function containsPath(node: GlobalSkillTreeNode, targetPath: string): boolean {
  if (node.path === targetPath) return true
  if (node.kind !== "directory") return false
  return (node.children ?? []).some((child) => containsPath(child, targetPath))
}

function findSelectedSkillDirectory(nodes: GlobalSkillTreeNode[], targetPath: string | null) {
  if (!targetPath) return null

  for (const node of nodes) {
    if (node.kind === "directory" && containsPath(node, targetPath)) {
      return node
    }
  }

  return null
}

function hasNodePath(nodes: GlobalSkillTreeNode[], targetPath: string) {
  return nodes.some((node) => containsPath(node, targetPath))
}

function uniquePaths(input: string[]) {
  return [...new Set(input.filter(Boolean))]
}

function isPathWithinDirectory(path: string, directory: string) {
  return path === directory || path.startsWith(`${directory}\\`) || path.startsWith(`${directory}/`)
}

function replaceDirectoryPrefix(path: string, from: string, to: string) {
  if (path === from) return to
  if (isPathWithinDirectory(path, from)) {
    return `${to}${path.slice(from.length)}`
  }

  return path
}

function suggestNextSkillName(nodes: GlobalSkillTreeNode[]) {
  const existing = new Set(
    nodes
      .filter((node) => node.kind === "directory")
      .map((node) => node.name.toLowerCase()),
  )

  if (!existing.has("new-skill")) return "new-skill"

  let index = 2
  while (existing.has(`new-skill-${index}`)) {
    index += 1
  }

  return `new-skill-${index}`
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function validateSkillNameInput(input: string) {
  const trimmed = input.trim()
  if (!trimmed) {
    return "Skill name is required."
  }

  if (trimmed === "." || trimmed === ".." || /[\\/]/.test(trimmed)) {
    return "Skill name cannot include slashes or relative path segments."
  }

  return null
}

function hasDuplicateTopLevelSkillName(nodes: GlobalSkillTreeNode[], input: string) {
  const normalized = input.trim().toLowerCase()
  return nodes.some((node) => node.kind === "directory" && node.name.trim().toLowerCase() === normalized)
}

export function useGlobalSkills({ onSkillsUpdated }: UseGlobalSkillsOptions = {}) {
  const [globalSkillsRoot, setGlobalSkillsRoot] = useState("")
  const [globalSkillsTree, setGlobalSkillsTree] = useState<GlobalSkillTreeNode[]>([])
  const [expandedSkillPaths, setExpandedSkillPaths] = useState<string[]>([])
  const [creatingGlobalSkillName, setCreatingGlobalSkillName] = useState("")
  const [isCreateGlobalSkillDraftVisible, setIsCreateGlobalSkillDraftVisible] = useState(false)
  const [renamingGlobalSkillDraftDirectory, setRenamingGlobalSkillDraftDirectory] = useState<string | null>(null)
  const [renamingGlobalSkillName, setRenamingGlobalSkillName] = useState("")
  const [renamingGlobalSkillDirectory, setRenamingGlobalSkillDirectory] = useState<string | null>(null)
  const [selectedGlobalSkillFilePath, setSelectedGlobalSkillFilePath] = useState<string | null>(null)
  const [selectedGlobalSkillFileContent, setSelectedGlobalSkillFileContent] = useState("")
  const [savedGlobalSkillFileContent, setSavedGlobalSkillFileContent] = useState("")
  const [isLoadingGlobalSkillsTree, setIsLoadingGlobalSkillsTree] = useState(false)
  const [isLoadingGlobalSkillFile, setIsLoadingGlobalSkillFile] = useState(false)
  const [isSavingGlobalSkillFile, setIsSavingGlobalSkillFile] = useState(false)
  const [isCreatingGlobalSkill, setIsCreatingGlobalSkill] = useState(false)
  const [deletingGlobalSkillDirectory, setDeletingGlobalSkillDirectory] = useState<string | null>(null)
  const [globalSkillsMessage, setGlobalSkillsMessage] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)

  const treeRequestRef = useRef(0)
  const fileRequestRef = useRef(0)
  const isDirtyGlobalSkillFile = selectedGlobalSkillFilePath !== null && selectedGlobalSkillFileContent !== savedGlobalSkillFileContent
  const selectedGlobalSkillDirectory = useMemo(
    () => findSelectedSkillDirectory(globalSkillsTree, selectedGlobalSkillFilePath),
    [globalSkillsTree, selectedGlobalSkillFilePath],
  )

  async function notifySkillsUpdated() {
    try {
      await onSkillsUpdated?.()
    } catch (error) {
      console.error("[desktop] global skills sync failed:", error)
    }
  }

  function confirmDiscardChanges(action: string) {
    if (!isDirtyGlobalSkillFile) return true
    if (typeof window.confirm !== "function") return true
    return window.confirm(`Discard unsaved changes and ${action}?`)
  }

  function applyExpandedPaths(targetPath: string | null, rootPath: string, nextTree: GlobalSkillTreeNode[]) {
    const ancestorPaths = targetPath ? findDirectoryAncestors(nextTree, targetPath) ?? [] : []
    setExpandedSkillPaths((current) => uniquePaths([...current, rootPath, ...ancestorPaths]))
  }

  async function loadGlobalSkillFile(path: string, options?: { rootPath?: string; tree?: GlobalSkillTreeNode[] }) {
    const readGlobalSkillFile = window.desktop?.readGlobalSkillFile
    if (!readGlobalSkillFile) return

    const requestID = ++fileRequestRef.current
    setIsLoadingGlobalSkillFile(true)
    setGlobalSkillsMessage(null)

    try {
      const document = await readGlobalSkillFile({ path })
      if (fileRequestRef.current !== requestID) return

      setSelectedGlobalSkillFilePath(document.path)
      setSelectedGlobalSkillFileContent(document.content)
      setSavedGlobalSkillFileContent(document.content)
      applyExpandedPaths(document.path, options?.rootPath ?? globalSkillsRoot, options?.tree ?? globalSkillsTree)
    } catch (error) {
      if (fileRequestRef.current !== requestID) return
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      if (fileRequestRef.current === requestID) {
        setIsLoadingGlobalSkillFile(false)
      }
    }
  }

  async function refreshGlobalSkillsTree(preferredFilePath?: string | null) {
    const getGlobalSkillsTree = window.desktop?.getGlobalSkillsTree
    if (!getGlobalSkillsTree) {
      setGlobalSkillsRoot("")
      setGlobalSkillsTree([])
      return
    }

    const requestID = ++treeRequestRef.current
    setIsLoadingGlobalSkillsTree(true)

    try {
      const payload = await getGlobalSkillsTree()
      if (treeRequestRef.current !== requestID) return

      setGlobalSkillsRoot(payload.root)
      setGlobalSkillsTree(payload.items)

      const nextFilePath =
        (preferredFilePath && hasNodePath(payload.items, preferredFilePath) ? preferredFilePath : null) ??
        (selectedGlobalSkillFilePath && hasNodePath(payload.items, selectedGlobalSkillFilePath) ? selectedGlobalSkillFilePath : null) ??
        findFirstSkillFile(payload.items)

      setExpandedSkillPaths((current) =>
        uniquePaths([
          ...current.filter((item) => item === payload.root || hasNodePath(payload.items, item)),
          payload.root,
          ...(nextFilePath ? findDirectoryAncestors(payload.items, nextFilePath) ?? [] : []),
        ]),
      )

      if (!nextFilePath) {
        setSelectedGlobalSkillFilePath(null)
        setSelectedGlobalSkillFileContent("")
        setSavedGlobalSkillFileContent("")
        return
      }

      if (nextFilePath === selectedGlobalSkillFilePath) {
        return
      }

      await loadGlobalSkillFile(nextFilePath, {
        rootPath: payload.root,
        tree: payload.items,
      })
    } catch (error) {
      if (treeRequestRef.current !== requestID) return
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      if (treeRequestRef.current === requestID) {
        setIsLoadingGlobalSkillsTree(false)
      }
    }
  }

  useEffect(() => {
    void refreshGlobalSkillsTree()
  }, [])

  async function handleGlobalSkillFileSelect(path: string) {
    if (path === selectedGlobalSkillFilePath) return
    if (!confirmDiscardChanges("switch files")) return

    applyExpandedPaths(path, globalSkillsRoot, globalSkillsTree)
    await loadGlobalSkillFile(path)
  }

  function handleGlobalSkillDraftChange(value: string) {
    setSelectedGlobalSkillFileContent(value)
  }

  function handleGlobalSkillDirectoryToggle(path: string) {
    setExpandedSkillPaths((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    )
  }

  function handleCreateGlobalSkillDraftStart() {
    if (isCreatingGlobalSkill || isCreateGlobalSkillDraftVisible || renamingGlobalSkillDraftDirectory || renamingGlobalSkillDirectory) return

    setGlobalSkillsMessage(null)
    setCreatingGlobalSkillName(suggestNextSkillName(globalSkillsTree))
    setIsCreateGlobalSkillDraftVisible(true)
  }

  function handleCreateGlobalSkillDraftChange(value: string) {
    setGlobalSkillsMessage(null)
    setCreatingGlobalSkillName(value)
  }

  function handleCreateGlobalSkillDraftCancel() {
    if (isCreatingGlobalSkill) return

    setGlobalSkillsMessage(null)
    setCreatingGlobalSkillName("")
    setIsCreateGlobalSkillDraftVisible(false)
  }

  function handleRenameGlobalSkillDraftStart(directoryPath: string) {
    if (isCreatingGlobalSkill || isCreateGlobalSkillDraftVisible || renamingGlobalSkillDirectory) return

    const targetDirectory = findSelectedSkillDirectory(globalSkillsTree, directoryPath)
    if (!targetDirectory || targetDirectory.path !== directoryPath) return

    setGlobalSkillsMessage(null)
    setRenamingGlobalSkillDraftDirectory(targetDirectory.path)
    setRenamingGlobalSkillName(targetDirectory.name)
  }

  function handleRenameGlobalSkillDraftChange(value: string) {
    setGlobalSkillsMessage(null)
    setRenamingGlobalSkillName(value)
  }

  function handleRenameGlobalSkillDraftCancel() {
    if (renamingGlobalSkillDirectory) return

    setGlobalSkillsMessage(null)
    setRenamingGlobalSkillDraftDirectory(null)
    setRenamingGlobalSkillName("")
  }

  async function handleCreateGlobalSkill() {
    const createGlobalSkill = window.desktop?.createGlobalSkill
    if (!createGlobalSkill || isCreatingGlobalSkill || !isCreateGlobalSkillDraftVisible) return

    const validationError = validateSkillNameInput(creatingGlobalSkillName)
    if (validationError) {
      setGlobalSkillsMessage({
        tone: "error",
        text: validationError,
      })
      return
    }

    const name = creatingGlobalSkillName.trim()
    if (hasDuplicateTopLevelSkillName(globalSkillsTree, name)) {
      setGlobalSkillsMessage({
        tone: "error",
        text: `Skill '${name}' already exists.`,
      })
      return
    }

    if (!confirmDiscardChanges("create a new skill")) return

    setIsCreatingGlobalSkill(true)
    setGlobalSkillsMessage(null)

    try {
      const created = await createGlobalSkill({ name })
      await refreshGlobalSkillsTree(created.file.path)
      setCreatingGlobalSkillName("")
      setIsCreateGlobalSkillDraftVisible(false)
      setGlobalSkillsMessage({
        tone: "success",
        text: `Created ${name}.`,
      })
      await notifySkillsUpdated()
    } catch (error) {
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      setIsCreatingGlobalSkill(false)
    }
  }

  async function handleRenameGlobalSkill() {
    const renameGlobalSkill = window.desktop?.renameGlobalSkill
    const targetDirectory =
      (renamingGlobalSkillDraftDirectory
        ? findSelectedSkillDirectory(globalSkillsTree, renamingGlobalSkillDraftDirectory)
        : null) ?? null

    if (!renameGlobalSkill || !targetDirectory || renamingGlobalSkillDirectory) return

    const validationError = validateSkillNameInput(renamingGlobalSkillName)
    if (validationError) {
      setGlobalSkillsMessage({
        tone: "error",
        text: validationError,
      })
      return
    }

    const name = renamingGlobalSkillName.trim()
    if (name === targetDirectory.name) {
      handleRenameGlobalSkillDraftCancel()
      return
    }

    if (hasDuplicateTopLevelSkillName(globalSkillsTree, name)) {
      setGlobalSkillsMessage({
        tone: "error",
        text: `Skill '${name}' already exists.`,
      })
      return
    }

    if (selectedGlobalSkillFilePath && isDirtyGlobalSkillFile && isPathWithinDirectory(selectedGlobalSkillFilePath, targetDirectory.path)) {
      if (!confirmDiscardChanges("rename this skill")) {
        return
      }
    }

    setRenamingGlobalSkillDirectory(targetDirectory.path)
    setGlobalSkillsMessage(null)

    try {
      const renamed = await renameGlobalSkill({
        directory: targetDirectory.path,
        name,
      })
      const preferredFilePath =
        selectedGlobalSkillFilePath && isPathWithinDirectory(selectedGlobalSkillFilePath, targetDirectory.path)
          ? replaceDirectoryPrefix(selectedGlobalSkillFilePath, targetDirectory.path, renamed.directory)
          : renamed.filePath
      await refreshGlobalSkillsTree(preferredFilePath)
      setRenamingGlobalSkillDraftDirectory(null)
      setRenamingGlobalSkillName("")
      setGlobalSkillsMessage({
        tone: "success",
        text: `Renamed ${targetDirectory.name} to ${name}.`,
      })
      await notifySkillsUpdated()
    } catch (error) {
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      setRenamingGlobalSkillDirectory(null)
    }
  }

  async function handleSaveGlobalSkillFile() {
    const updateGlobalSkillFile = window.desktop?.updateGlobalSkillFile
    if (!updateGlobalSkillFile || !selectedGlobalSkillFilePath || !isDirtyGlobalSkillFile || isSavingGlobalSkillFile) return

    setIsSavingGlobalSkillFile(true)
    setGlobalSkillsMessage(null)

    try {
      const document = await updateGlobalSkillFile({
        path: selectedGlobalSkillFilePath,
        content: selectedGlobalSkillFileContent,
      })
      setSelectedGlobalSkillFileContent(document.content)
      setSavedGlobalSkillFileContent(document.content)
      setGlobalSkillsMessage({
        tone: "success",
        text: `Saved ${document.path.split(/[\\/]/).filter(Boolean).pop() ?? "file"}.`,
      })
      await notifySkillsUpdated()
    } catch (error) {
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      setIsSavingGlobalSkillFile(false)
    }
  }

  async function handleDeleteGlobalSkill(directoryPath?: string) {
    const deleteGlobalSkill = window.desktop?.deleteGlobalSkill
    const targetDirectory =
      (directoryPath ? findSelectedSkillDirectory(globalSkillsTree, directoryPath) : null) ?? selectedGlobalSkillDirectory
    if (!deleteGlobalSkill || !targetDirectory || deletingGlobalSkillDirectory) return

    const skillName = targetDirectory.name
    if (typeof window.confirm === "function" && !window.confirm(`Delete global skill '${skillName}'?`)) {
      return
    }

    setDeletingGlobalSkillDirectory(targetDirectory.path)
    setGlobalSkillsMessage(null)

    try {
      await deleteGlobalSkill({
        directory: targetDirectory.path,
      })
      await refreshGlobalSkillsTree()
      setGlobalSkillsMessage({
        tone: "success",
        text: `Deleted ${skillName}.`,
      })
      await notifySkillsUpdated()
    } catch (error) {
      setGlobalSkillsMessage({
        tone: "error",
        text: formatError(error),
      })
    } finally {
      setDeletingGlobalSkillDirectory(null)
    }
  }

  return {
    creatingGlobalSkillName,
    deletingGlobalSkillDirectory,
    expandedSkillPaths,
    globalSkillsMessage,
    globalSkillsRoot,
    globalSkillsTree,
    handleCreateGlobalSkill,
    handleCreateGlobalSkillDraftCancel,
    handleCreateGlobalSkillDraftChange,
    handleCreateGlobalSkillDraftStart,
    handleDeleteGlobalSkill,
    handleGlobalSkillDirectoryToggle,
    handleGlobalSkillDraftChange,
    handleGlobalSkillFileSelect,
    handleRenameGlobalSkill,
    handleRenameGlobalSkillDraftCancel,
    handleRenameGlobalSkillDraftChange,
    handleRenameGlobalSkillDraftStart,
    handleSaveGlobalSkillFile,
    isCreateGlobalSkillDraftVisible,
    isCreatingGlobalSkill,
    isDirtyGlobalSkillFile,
    isLoadingGlobalSkillFile,
    isLoadingGlobalSkillsTree,
    isSavingGlobalSkillFile,
    renamingGlobalSkillDirectory,
    renamingGlobalSkillDraftDirectory,
    renamingGlobalSkillName,
    refreshGlobalSkillsTree,
    selectedGlobalSkillDirectory,
    selectedGlobalSkillFileContent,
    selectedGlobalSkillFilePath,
  }
}
