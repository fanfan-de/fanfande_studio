export const GIT_STATE_CHANGED_EVENT = "desktop:git-state-changed"

export interface GitStateChangedDetail {
  directory: string
}

function normalizePath(value: string | null) {
  return value?.trim().replace(/\//g, "\\").toLowerCase() ?? null
}

export function isMatchingGitStateChangedDetail(
  detail: GitStateChangedDetail,
  directory: string | null,
) {
  return normalizePath(detail.directory) === normalizePath(directory)
}

export function notifyGitStateChanged(detail: GitStateChangedDetail) {
  window.dispatchEvent(new CustomEvent<GitStateChangedDetail>(GIT_STATE_CHANGED_EVENT, { detail }))
}

export function subscribeToGitStateChanged(listener: (detail: GitStateChangedDetail) => void) {
  const handleEvent = (event: Event) => {
    if (!(event instanceof CustomEvent)) return
    const detail = (event as CustomEvent<GitStateChangedDetail>).detail
    if (!detail) return
    listener(detail)
  }

  window.addEventListener(GIT_STATE_CHANGED_EVENT, handleEvent)

  return () => {
    window.removeEventListener(GIT_STATE_CHANGED_EVENT, handleEvent)
  }
}
