import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  LOCAL_IMAGE_PROTOCOL,
  readLocalImageProtocolSource,
} from "../shared/local-image-protocol"

export const LOCAL_IMAGE_MAX_BYTES = 25 * 1024 * 1024

const rasterImageMimeTypes = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
])

export type LocalImageProtocolResult =
  | {
      ok: true
      filePath: string
      mimeType: string
      size: number
    }
  | {
      ok: false
      status: number
      error: string
    }

interface LocalImageProtocolOptions {
  maxBytes?: number
}

interface LocalImageProtocolRegistrar {
  registerSchemesAsPrivileged(schemes: Array<{
    scheme: string
    privileges: {
      standard: boolean
      secure: boolean
      supportFetchAPI: boolean
    }
  }>): void
  handle(scheme: string, handler: (request: Request) => Response | Promise<Response>): void
}

function localImageError(status: number, error: string): LocalImageProtocolResult {
  return { ok: false, status, error }
}

function resolveLocalImagePath(source: string) {
  const trimmedSource = source.trim()
  if (!trimmedSource) return null

  if (trimmedSource.toLowerCase().startsWith("file://")) {
    try {
      return path.resolve(fileURLToPath(trimmedSource))
    } catch {
      return null
    }
  }

  if (!path.isAbsolute(trimmedSource)) return null
  return path.resolve(trimmedSource)
}

export function getLocalImageMimeType(filePath: string) {
  return rasterImageMimeTypes.get(path.extname(filePath).toLowerCase()) ?? null
}

export async function resolveLocalImageProtocolRequest(
  requestUrl: string,
  options: LocalImageProtocolOptions = {},
): Promise<LocalImageProtocolResult> {
  const source = readLocalImageProtocolSource(requestUrl)
  if (!source) {
    return localImageError(400, "Missing or invalid local image source.")
  }

  const filePath = resolveLocalImagePath(source)
  if (!filePath) {
    return localImageError(400, "Local image source must be an absolute file path or file URL.")
  }

  const mimeType = getLocalImageMimeType(filePath)
  if (!mimeType) {
    return localImageError(415, "Local image type is not supported.")
  }

  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return localImageError(404, "Local image file was not found.")
  }

  if (!fileStat.isFile()) {
    return localImageError(400, "Local image source must be a file.")
  }

  const maxBytes = options.maxBytes ?? LOCAL_IMAGE_MAX_BYTES
  if (fileStat.size > maxBytes) {
    return localImageError(413, "Local image file is too large.")
  }

  return {
    ok: true,
    filePath,
    mimeType,
    size: fileStat.size,
  }
}

export async function handleLocalImageProtocolRequest(request: Request) {
  const result = await resolveLocalImageProtocolRequest(request.url)
  if (!result.ok) {
    return new Response(result.error, {
      status: result.status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    })
  }

  const image = await readFile(result.filePath)
  return new Response(image, {
    headers: {
      "cache-control": "no-store",
      "content-length": String(result.size),
      "content-type": result.mimeType,
    },
  })
}

export function registerLocalImageProtocolScheme(protocolRegistrar: Pick<LocalImageProtocolRegistrar, "registerSchemesAsPrivileged">) {
  protocolRegistrar.registerSchemesAsPrivileged([
    {
      scheme: LOCAL_IMAGE_PROTOCOL,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
      },
    },
  ])
}

export function registerLocalImageProtocolHandler(protocolRegistrar: Pick<LocalImageProtocolRegistrar, "handle">) {
  protocolRegistrar.handle(LOCAL_IMAGE_PROTOCOL, handleLocalImageProtocolRequest)
}
