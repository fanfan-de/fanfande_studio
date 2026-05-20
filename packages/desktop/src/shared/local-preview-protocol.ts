export const LOCAL_PREVIEW_PROTOCOL = "anybox-preview"

export function toLocalPreviewProtocolUrl(token: string, relativePath: string) {
  const normalizedPath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "")
  const encodedPath = normalizedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")

  return `${LOCAL_PREVIEW_PROTOCOL}://preview/${encodeURIComponent(token)}${encodedPath ? `/${encodedPath}` : ""}`
}
