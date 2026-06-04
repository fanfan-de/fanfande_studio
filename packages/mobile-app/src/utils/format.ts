export function formatRelativeTime(value: number | undefined) {
  if (!value) return "Unknown"
  const elapsed = Date.now() - value
  if (elapsed < 60_000) return "Just now"
  if (elapsed < 3_600_000) return `${Math.max(1, Math.floor(elapsed / 60_000))}m ago`
  if (elapsed < 86_400_000) return `${Math.max(1, Math.floor(elapsed / 3_600_000))}h ago`
  return `${Math.max(1, Math.floor(elapsed / 86_400_000))}d ago`
}

export function trimMiddle(value: string, maxLength = 52) {
  if (value.length <= maxLength) return value
  const head = Math.ceil((maxLength - 1) / 2)
  const tail = Math.floor((maxLength - 1) / 2)
  return `${value.slice(0, head)}...${value.slice(value.length - tail)}`
}

export function encodeRouteParam(value: string) {
  return encodeURIComponent(value)
}

export function decodeRouteParam(value: string) {
  let current = value
  for (let index = 0; index < 2; index += 1) {
    const next = decodeURIComponent(current)
    if (next === current) break
    current = next
  }
  return current
}
