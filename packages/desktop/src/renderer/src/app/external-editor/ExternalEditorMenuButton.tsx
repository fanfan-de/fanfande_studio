import { useEffect, useEffectEvent, useRef, useState } from "react"
import { ChevronDownIcon, OpenInEditorIcon } from "../icons"
import { hasExternalEditorClient, listExternalEditorsForTarget, openExternalEditor, type ExternalEditorSummary } from "./client"

type ExternalEditorMenuOption = {
  id: string
  label: string
  iconDataUrl?: string
}

const EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY = "desktop.externalEditor.lastUsed.v1"

function toExternalEditorMenuOption(option: ExternalEditorSummary) {
  return {
    id: option.id,
    label: option.label,
    ...(option.iconDataUrl ? { iconDataUrl: option.iconDataUrl } : {}),
  } satisfies ExternalEditorMenuOption
}

function readStoredExternalEditorID() {
  try {
    return window.localStorage.getItem(EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY)?.trim() || null
  } catch {
    return null
  }
}

function writeStoredExternalEditorID(editorID: string) {
  try {
    window.localStorage.setItem(EXTERNAL_EDITOR_LAST_USED_STORAGE_KEY, editorID)
  } catch {
    // Ignore storage failures and keep the in-memory fallback only.
  }
}

function resolveDefaultExternalEditorOption(
  options: ExternalEditorMenuOption[],
  preferredEditorID: string | null,
) {
  if (preferredEditorID) {
    const preferredOption = options.find((option) => option.id === preferredEditorID)
    if (preferredOption) return preferredOption
  }

  return options[0] ?? null
}

function getExternalEditorFallbackBadge(editorID: string) {
  switch (editorID) {
    case "vscode":
      return "VS"
    case "visualstudio":
      return "VI"
    case "cursor":
      return "CU"
    case "windsurf":
      return "WS"
    case "githubDesktop":
      return "GH"
    case "explorer":
      return "EX"
    case "terminal":
      return "WT"
    case "wsl":
      return "WSL"
    default:
      return "AP"
  }
}

export function ExternalEditorMenuButton({ directory }: { directory: string | null }) {
  const hasExternalEditorIntegration = hasExternalEditorClient()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [editorOptions, setEditorOptions] = useState<ExternalEditorMenuOption[]>([])
  const [isLoadingOptions, setIsLoadingOptions] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingEditorID, setPendingEditorID] = useState<string | null>(null)
  const [preferredEditorID, setPreferredEditorID] = useState<string | null>(() => readStoredExternalEditorID())
  const iconRefreshTimerRef = useRef<number | null>(null)
  const optionsLoadRequestRef = useRef(0)

  useEffect(() => {
    if (!isMenuOpen) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setIsMenuOpen(false)
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isMenuOpen])

  const loadEditorOptions = useEffectEvent(async ({
    targetPath,
    resetOptions = false,
    allowIconRefresh = true,
  }: {
    targetPath: string
    resetOptions?: boolean
    allowIconRefresh?: boolean
  }) => {
    if (!hasExternalEditorIntegration) return [] as ExternalEditorMenuOption[]
    const requestID = optionsLoadRequestRef.current + 1
    optionsLoadRequestRef.current = requestID

    if (iconRefreshTimerRef.current !== null) {
      window.clearTimeout(iconRefreshTimerRef.current)
      iconRefreshTimerRef.current = null
    }

    if (resetOptions) {
      setEditorOptions([])
    }

    setIsLoadingOptions(true)
    setLoadError(null)

    try {
      const options = (await listExternalEditorsForTarget({ targetPath })).map(toExternalEditorMenuOption)
      if (requestID !== optionsLoadRequestRef.current) {
        return [] as ExternalEditorMenuOption[]
      }

      setEditorOptions(options)

      if (allowIconRefresh && options.some((option) => !option.iconDataUrl)) {
        iconRefreshTimerRef.current = window.setTimeout(() => {
          void loadEditorOptions({
            targetPath,
            allowIconRefresh: false,
          })
        }, 160)
      }

      return options
    } catch (error) {
      if (requestID !== optionsLoadRequestRef.current) {
        return [] as ExternalEditorMenuOption[]
      }

      setEditorOptions([])
      setLoadError(error instanceof Error ? error.message : String(error))
      return [] as ExternalEditorMenuOption[]
    } finally {
      if (requestID === optionsLoadRequestRef.current) {
        setIsLoadingOptions(false)
      }
    }
  })

  useEffect(() => {
    if (!directory || !hasExternalEditorIntegration) return

    void loadEditorOptions({
      targetPath: directory,
      resetOptions: true,
    })

    return () => {
      optionsLoadRequestRef.current += 1
      if (iconRefreshTimerRef.current !== null) {
        window.clearTimeout(iconRefreshTimerRef.current)
        iconRefreshTimerRef.current = null
      }
    }
  }, [directory, hasExternalEditorIntegration])

  if (!directory || !hasExternalEditorIntegration) {
    return null
  }

  const targetPath = directory
  const defaultEditorOption = resolveDefaultExternalEditorOption(editorOptions, preferredEditorID)
  function rememberPreferredEditor(editorID: string) {
    setPreferredEditorID(editorID)
    writeStoredExternalEditorID(editorID)
  }

  async function handleOptionClick(editorID: string) {
    setPendingEditorID(editorID)
    setLoadError(null)

    try {
      await openExternalEditor({
        targetPath,
        editorID,
      })
      rememberPreferredEditor(editorID)
      setIsMenuOpen(false)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setPendingEditorID(null)
    }
  }

  async function handlePrimaryButtonClick() {
    let editorID = defaultEditorOption?.id ?? null
    if (!editorID) {
      const loadedOptions = await loadEditorOptions({ targetPath })
      editorID = resolveDefaultExternalEditorOption(loadedOptions, preferredEditorID)?.id ?? null
    }

    if (!editorID) return

    await handleOptionClick(editorID)
  }

  return (
    <div ref={triggerRef} className="canvas-top-menu-selector-anchor external-editor-split-button-anchor">
      <div className="external-editor-split-button" role="group" aria-label="Open current project">
        <button
          type="button"
          className="canvas-top-menu-button canvas-top-menu-editor-launch-button"
          aria-label={defaultEditorOption ? `Open current project in ${defaultEditorOption.label}` : "Open current project"}
          title={defaultEditorOption ? `Open current project in ${defaultEditorOption.label}` : "Open current project"}
          disabled={pendingEditorID !== null}
          onClick={() => void handlePrimaryButtonClick()}
        >
          <span className="external-editor-toolbar-icon" aria-hidden="true">
            {defaultEditorOption?.iconDataUrl ? (
              <img className="external-editor-toolbar-icon-image" src={defaultEditorOption.iconDataUrl} alt="" />
            ) : defaultEditorOption ? (
              <span className="external-editor-toolbar-icon-fallback" data-editor-kind={defaultEditorOption.id}>
                {getExternalEditorFallbackBadge(defaultEditorOption.id)}
              </span>
            ) : (
              <OpenInEditorIcon />
            )}
          </span>
        </button>
        <button
          type="button"
          className={isMenuOpen ? "canvas-top-menu-button canvas-top-menu-editor-menu-button is-active" : "canvas-top-menu-button canvas-top-menu-editor-menu-button"}
          aria-controls="canvas-top-menu-editor-menu"
          aria-expanded={isMenuOpen}
          aria-haspopup="dialog"
          aria-label="Choose editor for current project"
          title="Choose editor for current project"
          disabled={pendingEditorID !== null}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <ChevronDownIcon />
        </button>
      </div>

      {isMenuOpen ? (
        <div
          ref={menuRef}
          id="canvas-top-menu-editor-menu"
          className="canvas-top-menu-selector-panel external-editor-menu-panel"
          role="dialog"
          aria-label="Open current project"
        >
          {isLoadingOptions ? <p className="composer-menu-empty">Loading available apps...</p> : null}
          {!isLoadingOptions && loadError ? <p className="composer-menu-empty">{loadError}</p> : null}
          {!isLoadingOptions && !loadError && editorOptions.length === 0 ? (
            <p className="composer-menu-empty">No supported apps are available for this project.</p>
          ) : null}
          {!isLoadingOptions && !loadError
            ? editorOptions.map((option) => (
                <button
                  key={option.id}
                  className="composer-menu-option external-editor-menu-option"
                  disabled={pendingEditorID !== null}
                  onClick={() => void handleOptionClick(option.id)}
                  type="button"
                >
                  <span className="external-editor-menu-option-main">
                    <span className="external-editor-menu-option-icon" aria-hidden="true">
                      {option.iconDataUrl ? (
                        <img
                          className="external-editor-menu-option-icon-image"
                          src={option.iconDataUrl}
                          alt=""
                        />
                      ) : (
                        <span
                          className="external-editor-menu-option-icon-fallback"
                          data-editor-kind={option.id}
                        >
                          {getExternalEditorFallbackBadge(option.id)}
                        </span>
                      )}
                    </span>
                    <span className="composer-menu-option-copy">
                      <strong>{option.label}</strong>
                    </span>
                  </span>
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  )
}
