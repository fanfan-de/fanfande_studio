import { type ReactNode } from "react"
import { CodeModeIcon, CoworkModeIcon, SideChatIcon } from "../icons"
import { ShellTopMenu } from "../shared-ui"
import type { WorkspaceMode } from "../types"

interface WorkspaceModeMeta {
  description: string
  label: string
  sidebarTitle: string
  title: string
  Icon: typeof SideChatIcon
}

const WORKSPACE_MODE_META: Record<WorkspaceMode, WorkspaceModeMeta> = {
  chat: {
    description: "Dedicated chat projects will appear here.",
    label: "Chat",
    sidebarTitle: "Chat projects",
    title: "Chat workspace",
    Icon: SideChatIcon,
  },
  cowork: {
    description: "Shared cowork projects will appear here.",
    label: "Cowork",
    sidebarTitle: "Cowork projects",
    title: "Cowork workspace",
    Icon: CoworkModeIcon,
  },
  code: {
    description: "Code mode is the current project workspace.",
    label: "Code",
    sidebarTitle: "Code projects",
    title: "Code workspace",
    Icon: CodeModeIcon,
  },
}

export function getWorkspaceModeMeta(mode: WorkspaceMode) {
  return WORKSPACE_MODE_META[mode]
}

export function WorkspaceModeSidebarPlaceholder({ mode }: { mode: Exclude<WorkspaceMode, "code"> }) {
  const meta = getWorkspaceModeMeta(mode)
  const Icon = meta.Icon

  return (
    <section className="sidebar-view workspace-mode-sidebar-placeholder" aria-label={`${meta.label} sidebar placeholder`}>
      <div className="workspace-mode-placeholder-mark" aria-hidden="true">
        <Icon />
      </div>
      <div className="workspace-mode-placeholder-copy">
        <span className="label">{meta.label}</span>
        <h3>{meta.sidebarTitle}</h3>
        <p>{meta.description}</p>
      </div>
    </section>
  )
}

export function WorkspaceModeCanvasPlaceholder({
  mode,
  windowControls,
}: {
  mode: Exclude<WorkspaceMode, "code">
  windowControls?: ReactNode
}) {
  const meta = getWorkspaceModeMeta(mode)
  const Icon = meta.Icon

  return (
    <section className="workspace-mode-canvas" aria-label={`${meta.label} workspace placeholder`}>
      <ShellTopMenu
        ariaLabel={`${meta.label} workspace top menu`}
        as="header"
        className="workspace-mode-top-menu"
        contentClassName="workspace-mode-top-menu-content"
        content={(
          <div className="workspace-mode-top-menu-label">
            <Icon />
            <span>{meta.title}</span>
          </div>
        )}
        dragRegion
        trailing={windowControls ?? null}
        trailingClassName="workspace-mode-top-menu-actions"
      />
      <div className="workspace-mode-placeholder-stage">
        <div className="workspace-mode-placeholder-panel">
          <div className="workspace-mode-placeholder-mark is-large" aria-hidden="true">
            <Icon />
          </div>
          <div className="workspace-mode-placeholder-copy is-large">
            <span className="label">{meta.label}</span>
            <h2>{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function WorkspaceModeRightPlaceholder({
  mode,
  windowControls,
}: {
  mode: Exclude<WorkspaceMode, "code">
  windowControls?: ReactNode
}) {
  const meta = getWorkspaceModeMeta(mode)
  const Icon = meta.Icon

  return (
    <aside id="app-sidebar-right" className="sidebar is-right workspace-mode-right-placeholder" aria-label={`${meta.label} mode sidebar`}>
      <ShellTopMenu
        as="header"
        ariaLabel={`${meta.label} mode sidebar top menu`}
        className="right-sidebar-top-menu workspace-mode-right-top-menu"
        contentClassName="workspace-mode-right-top-menu-content"
        content={(
          <div className="workspace-mode-top-menu-label">
            <Icon />
            <span>{meta.label}</span>
          </div>
        )}
        trailing={windowControls ?? null}
        trailingClassName="right-sidebar-top-menu-window-controls"
      />
      <div className="workspace-mode-right-body">
        <div className="workspace-mode-placeholder-copy">
          <span className="label">Context</span>
          <h3>{meta.sidebarTitle}</h3>
          <p>{meta.description}</p>
        </div>
      </div>
    </aside>
  )
}
