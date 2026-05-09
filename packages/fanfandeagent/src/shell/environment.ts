const MACOS_DEFAULT_PATH_SEGMENTS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
]

function appendMissingPathSegments(input: string | undefined, segments: string[], delimiter: string) {
  const existing = input
    ? input.split(delimiter).filter((segment) => segment.length > 0)
    : []
  const seen = new Set(existing)
  const next = [...existing]

  for (const segment of segments) {
    if (seen.has(segment)) continue
    next.push(segment)
    seen.add(segment)
  }

  return next.join(delimiter)
}

export function withMacOSDefaultPath(input: string | undefined) {
  return appendMissingPathSegments(input, MACOS_DEFAULT_PATH_SEGMENTS, ":")
}
