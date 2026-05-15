import { app } from "electron"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"

const HOST = "127.0.0.1"

let rendererServer: http.Server | null = null
let rendererBaseUrl: string | null = null

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
}

function resolveRendererDirectory(mainDir: string) {
  const appPath = app.getAppPath()
  const candidates = [
    path.join(mainDir, "../renderer"),
    path.join(appPath, "out/renderer"),
    path.join(process.cwd(), "out/renderer"),
    path.join(process.cwd(), "dist/renderer"),
  ]

  const resolved = candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html")))
  if (resolved) return resolved

  throw new Error(`Renderer output was not found. Checked: ${candidates.join(", ")}`)
}

function resolveRequestPath(rendererDirectory: string, requestUrl: string | undefined) {
  try {
    const parsedUrl = new URL(requestUrl ?? "/", `http://${HOST}`)
    const pathname = decodeURIComponent(parsedUrl.pathname)
    const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "")
    const resolvedPath = path.resolve(rendererDirectory, relativePath)
    const resolvedRoot = path.resolve(rendererDirectory)

    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      return null
    }

    return resolvedPath
  } catch {
    return null
  }
}

function serveRendererFile(rendererDirectory: string, request: http.IncomingMessage, response: http.ServerResponse) {
  const resolvedPath = resolveRequestPath(rendererDirectory, request.url)
  if (!resolvedPath) {
    response.writeHead(403)
    response.end("Forbidden")
    return
  }

  fs.stat(resolvedPath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404)
      response.end("Not found")
      return
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": MIME_TYPES[path.extname(resolvedPath).toLowerCase()] ?? "application/octet-stream",
    })
    fs.createReadStream(resolvedPath).pipe(response)
  })
}

export async function ensureRendererHttpServer(mainDir: string) {
  if (rendererBaseUrl) return rendererBaseUrl

  const rendererDirectory = resolveRendererDirectory(mainDir)
  const server = http.createServer((request, response) => {
    serveRendererFile(rendererDirectory, request, response)
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, HOST, () => {
      server.off("error", reject)
      resolve()
    })
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("Renderer HTTP server did not bind to a TCP port.")
  }

  rendererServer = server
  rendererBaseUrl = `http://${HOST}:${address.port}`
  return rendererBaseUrl
}

export async function stopRendererHttpServer() {
  const server = rendererServer
  rendererServer = null
  rendererBaseUrl = null
  if (!server) return

  await new Promise<void>((resolve) => {
    server.close(() => resolve())
  })
}
