import { z } from "zod"

export const LocalWorkspaceLocationSchema = z.object({
  kind: z.literal("local"),
  path: z.string().min(1),
})

export const SshWorkspaceLocationSchema = z.object({
  kind: z.literal("ssh"),
  uri: z.string().min(1),
  profileID: z.string().min(1),
  remotePath: z.string().min(1),
})

export const WorkspaceLocationSchema = z.discriminatedUnion("kind", [
  LocalWorkspaceLocationSchema,
  SshWorkspaceLocationSchema,
])

export type LocalWorkspaceLocation = z.infer<typeof LocalWorkspaceLocationSchema>
export type SshWorkspaceLocation = z.infer<typeof SshWorkspaceLocationSchema>
export type WorkspaceLocation = z.infer<typeof WorkspaceLocationSchema>

const SSH_WORKSPACE_PROTOCOL = "ssh:"

function encodePathSegment(segment: string) {
  return encodeURIComponent(segment)
}

function decodePathname(pathname: string) {
  const decoded = decodeURIComponent(pathname)
  return normalizeSshRemotePath(decoded)
}

export function normalizeSshRemotePath(input: string) {
  const trimmed = input.trim()
  const absolute = trimmed.startsWith("/") ? trimmed : `/${trimmed}`
  const parts: string[] = []

  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      parts.pop()
      continue
    }
    parts.push(part)
  }

  return `/${parts.join("/")}`
}

export function createSshWorkspaceUri(profileID: string, remotePath: string) {
  const normalizedPath = normalizeSshRemotePath(remotePath)
  const encodedPath = normalizedPath
    .split("/")
    .map((segment, index) => (index === 0 ? "" : encodePathSegment(segment)))
    .join("/")
  return `ssh://${encodeURIComponent(profileID)}${encodedPath}`
}

export function isSshWorkspaceUri(input: string | undefined | null): boolean {
  if (!input) return false
  try {
    return new URL(input).protocol === SSH_WORKSPACE_PROTOCOL
  } catch {
    return false
  }
}

export function parseWorkspaceLocation(input: string): WorkspaceLocation {
  if (!isSshWorkspaceUri(input)) return { kind: "local", path: input }

  const url = new URL(input)
  const profileID = decodeURIComponent(url.hostname)
  if (!profileID) throw new Error("SSH workspace URI is missing a profile id")

  return {
    kind: "ssh",
    uri: createSshWorkspaceUri(profileID, decodePathname(url.pathname || "/")),
    profileID,
    remotePath: decodePathname(url.pathname || "/"),
  }
}

export function getWorkspaceDisplayPath(input: string) {
  const location = parseWorkspaceLocation(input)
  if (location.kind === "local") return location.path
  return `${location.profileID}:${location.remotePath}`
}

export function getWorkspaceBasename(input: string) {
  const location = parseWorkspaceLocation(input)
  const target = location.kind === "ssh" ? location.remotePath : location.path.replaceAll("\\", "/")
  const parts = target.split("/").filter(Boolean)
  return parts.at(-1) ?? target
}

export function joinSshRemotePath(base: string, child: string) {
  if (!child) return normalizeSshRemotePath(base)
  if (child.startsWith("/")) return normalizeSshRemotePath(child)
  return normalizeSshRemotePath(`${base.replace(/\/+$/, "")}/${child}`)
}

export function relativeSshRemotePath(root: string, target: string) {
  const normalizedRoot = normalizeSshRemotePath(root)
  const normalizedTarget = normalizeSshRemotePath(target)
  if (normalizedTarget === normalizedRoot) return "."
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`
  if (!normalizedTarget.startsWith(prefix)) return undefined
  return normalizedTarget.slice(prefix.length)
}

export function containsSshRemotePath(root: string, target: string) {
  return relativeSshRemotePath(root, target) !== undefined
}

export function containsWorkspaceLocation(rootInput: string, targetInput: string) {
  const root = parseWorkspaceLocation(rootInput)
  const target = parseWorkspaceLocation(targetInput)

  if (root.kind !== target.kind) return false
  if (root.kind === "ssh" && target.kind === "ssh") {
    return root.profileID === target.profileID && containsSshRemotePath(root.remotePath, target.remotePath)
  }

  if (root.kind !== "local" || target.kind !== "local") return false
  const rootPath = root.path.replaceAll("\\", "/").replace(/\/+$/, "")
  const targetPath = target.path.replaceAll("\\", "/")
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}/`)
}

export function resolveWorkspaceChildUri(rootInput: string, childPath: string) {
  const location = parseWorkspaceLocation(rootInput)
  if (location.kind === "local") return childPath
  const remotePath = joinSshRemotePath(location.remotePath, childPath)
  if (!containsSshRemotePath(location.remotePath, remotePath)) {
    throw new Error("Path escapes SSH workspace root")
  }
  return createSshWorkspaceUri(location.profileID, remotePath)
}
