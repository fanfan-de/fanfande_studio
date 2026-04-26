type DesktopBridge = NonNullable<Window["desktop"]>
type ListExternalEditorsForTarget = NonNullable<DesktopBridge["listExternalEditorsForTarget"]>
type OpenInExternalEditor = NonNullable<DesktopBridge["openInExternalEditor"]>

export type ExternalEditorSummary = Awaited<ReturnType<ListExternalEditorsForTarget>>[number]

function unavailableError(action: string) {
  return new Error("External editor " + action + " is unavailable in this desktop shell.")
}

export function hasExternalEditorClient() {
  return Boolean(window.desktop?.listExternalEditorsForTarget && window.desktop?.openInExternalEditor)
}

export async function listExternalEditorsForTarget(input: Parameters<ListExternalEditorsForTarget>[0]) {
  const listExternalEditorsForTarget = window.desktop?.listExternalEditorsForTarget
  if (!listExternalEditorsForTarget) throw unavailableError("discovery")
  return listExternalEditorsForTarget(input)
}

export async function openExternalEditor(input: Parameters<OpenInExternalEditor>[0]) {
  const openInExternalEditor = window.desktop?.openInExternalEditor
  if (!openInExternalEditor) throw unavailableError("launch")
  return openInExternalEditor(input)
}
