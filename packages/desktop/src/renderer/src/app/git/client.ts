type DesktopBridge = NonNullable<Window["desktop"]>
type GitGetCapabilities = NonNullable<DesktopBridge["gitGetCapabilities"]>
type GitCommit = NonNullable<DesktopBridge["gitCommit"]>
type GitPush = NonNullable<DesktopBridge["gitPush"]>
type GitCreateBranch = NonNullable<DesktopBridge["gitCreateBranch"]>
type GitCreatePullRequest = NonNullable<DesktopBridge["gitCreatePullRequest"]>

export type GitCapabilitiesState = Awaited<ReturnType<GitGetCapabilities>>

function unavailableError(action: string) {
  return new Error("Git " + action + " is unavailable in this desktop shell.")
}

export function hasGitQuickMenuClient() {
  return Boolean(window.desktop?.gitGetCapabilities)
}

export async function getGitCapabilities(input: Parameters<GitGetCapabilities>[0]) {
  const gitGetCapabilities = window.desktop?.gitGetCapabilities
  if (!gitGetCapabilities) throw unavailableError("status")
  return gitGetCapabilities(input)
}

export async function commitGit(input: Parameters<GitCommit>[0]) {
  const gitCommit = window.desktop?.gitCommit
  if (!gitCommit) throw unavailableError("commit")
  return gitCommit(input)
}

export async function pushGit(input: Parameters<GitPush>[0]) {
  const gitPush = window.desktop?.gitPush
  if (!gitPush) throw unavailableError("push")
  return gitPush(input)
}

export async function createGitBranch(input: Parameters<GitCreateBranch>[0]) {
  const gitCreateBranch = window.desktop?.gitCreateBranch
  if (!gitCreateBranch) throw unavailableError("branch creation")
  return gitCreateBranch(input)
}

export async function createGitPullRequest(input: Parameters<GitCreatePullRequest>[0]) {
  const gitCreatePullRequest = window.desktop?.gitCreatePullRequest
  if (!gitCreatePullRequest) throw unavailableError("pull request creation")
  return gitCreatePullRequest(input)
}
