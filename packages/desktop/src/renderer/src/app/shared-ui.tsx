import { type ReactNode } from "react"
import { getSessionWorkflowBadge } from "./session-workflow"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectedStatusIcon,
  DeleteIcon,
  DisconnectedStatusIcon,
  FileTextIcon,
  FolderIcon,
  LayoutSidebarLeftIcon,
  LayoutSidebarRightIcon,
  LeftSidebarCollapseIcon,
  LeftSidebarExpandIcon,
  MaximizeIcon,
  MinimizeIcon,
  NewItemIcon,
  OpenInEditorIcon,
  MoonIcon,
  MonitorIcon,
  PaletteIcon,
  PaperclipIcon,
  ResetIcon,
  RestoreIcon,
  SunIcon,
  RightSidebarCollapseIcon,
  RightSidebarExpandIcon,
  SettingsIcon,
  SortIcon,
  TerminalIcon
} from "./icons"

export function WindowControlsSpacer({ variant }: { variant: "canvas" | "right-sidebar" }) {
  return <div className={`panel-toolbar-window-controls-spacer is-${variant}`} aria-hidden="true" />
}

export function joinClassNames(...tokens: Array<string | null | undefined | false>) {
  return tokens.filter(Boolean).join(" ")
}

export async function writeTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  textarea.style.pointerEvents = "none"

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const didCopy = document.execCommand("copy")
  document.body.removeChild(textarea)

  if (!didCopy) {
    throw new Error("Clipboard copy command failed.")
  }
}

export function SideChatBadge({ compact = false }: { compact?: boolean }) {
  return <span className={compact ? "side-chat-badge is-compact" : "side-chat-badge"}>Side chat</span>
}

export function SessionWorkflowBadge({
  compact = false,
  workflow,
}: {
  compact?: boolean
  workflow: ReturnType<typeof getSessionWorkflowBadge>
}) {
  if (!workflow) return null

  return (
    <span
      className={compact
        ? `session-workflow-badge is-${workflow.tone} is-compact`
        : `session-workflow-badge is-${workflow.tone}`
      }
      title={workflow.description}
    >
      {compact ? workflow.shortLabel : workflow.label}
    </span>
  )
}

export interface ShellTopMenuProps {
  ariaLabel: string
  as?: "div" | "header" | "nav"
  className?: string
  content: ReactNode
  contentClassName?: string
  controlsSpacerVariant?: "canvas" | "right-sidebar"
  dragRegion?: boolean
  layout?: "split" | "three-column"
  leading?: ReactNode
  leadingClassName?: string
  trailing?: ReactNode
  trailingClassName?: string
}

export function ShellTopMenu({
  ariaLabel,
  as = "div",
  className,
  content,
  contentClassName,
  controlsSpacerVariant,
  dragRegion = false,
  layout = "split",
  leading,
  leadingClassName,
  trailing,
  trailingClassName,
}: ShellTopMenuProps) {
  const Component = as

  return (
    <Component
      className={joinClassNames(
        "shell-top-menu",
        layout === "three-column" ? "is-three-column" : null,
        "panel-toolbar",
        dragRegion ? "window-drag-region" : null,
        className,
      )}
      aria-label={ariaLabel}
    >
      {leading !== undefined ? (
        <div className={joinClassNames("shell-top-menu-leading", leadingClassName)}>
          {leading}
        </div>
      ) : null}
      <div className={joinClassNames("shell-top-menu-content", contentClassName)}>
        {content}
      </div>
      {trailing !== undefined ? (
        <div className={joinClassNames("shell-top-menu-trailing", trailingClassName)}>
          {trailing}
        </div>
      ) : null}
      {controlsSpacerVariant ? <WindowControlsSpacer variant={controlsSpacerVariant} /> : null}
    </Component>
  )
}

export type SidebarSide = "left" | "right"
export type SidebarToggleButtonVariant = "rail" | "sidebar" | "top-menu"

export interface SidebarToggleButtonProps {
  isSidebarCollapsed: boolean
  onToggleSidebar: () => void
  side: SidebarSide
  variant: SidebarToggleButtonVariant
}

function getSidebarToggleLabel(isSidebarCollapsed: boolean, side: SidebarSide) {
  const sideLabel = side === "left" ? "left" : "right"
  return isSidebarCollapsed ? `Expand ${sideLabel} sidebar` : `Collapse ${sideLabel} sidebar`
}

function getSidebarToggleIcon(isSidebarCollapsed: boolean, side: SidebarSide) {
  if (side === "left") {
    return isSidebarCollapsed ? LeftSidebarExpandIcon : LeftSidebarCollapseIcon
  }

  return isSidebarCollapsed ? RightSidebarExpandIcon : RightSidebarCollapseIcon
}

export function SidebarToggleButton({ isSidebarCollapsed, onToggleSidebar, side, variant }: SidebarToggleButtonProps) {
  const label = getSidebarToggleLabel(isSidebarCollapsed, side)
  const Icon = getSidebarToggleIcon(isSidebarCollapsed, side)
  const buttonClassName = [
    "sidebar-toggle-button",
    `is-${variant}`,
    `is-${side}`,
    !isSidebarCollapsed ? "is-active" : "",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <button
      className={buttonClassName}
      aria-label={label}
      aria-pressed={!isSidebarCollapsed}
      title={label}
      type="button"
      onClick={onToggleSidebar}
    >
      <Icon />
    </button>
  )
}

export function TopMenuViewButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={active ? "top-menu-view-button is-active" : "top-menu-view-button"}
      aria-label={label}
      aria-pressed={active}
      title={label}
      type="button"
      onClick={onClick}
    >
      <span className="top-menu-view-button-icon" aria-hidden="true">
        {children}
      </span>
    </button>
  )
}
