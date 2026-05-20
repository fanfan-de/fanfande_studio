import { stat } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import z from "zod"
import { Instance } from "#project/instance.ts"
import { LspClient } from "#lsp/client.ts"
import {
  languageForFile,
  languageForWorkspacePath,
  supportedLanguageExtensions,
  type LanguageServerSpec,
} from "#lsp/languages.ts"
import type {
  Hover,
  HoverContents,
  Location,
  LocationLink,
  Range,
  SymbolInformation,
  WorkspaceSymbol,
} from "#lsp/types.ts"
import { readTextFile, readTextFileRange, resolveToolPath, toDisplayPath } from "#tool/shared.ts"
import * as Filesystem from "#util/filesystem.ts"

const MAX_SNIPPET_LINE = 1

export const LocationMatch = z.object({
  path: z.string(),
  displayPath: z.string(),
  start: z.object({
    line: z.number().int().positive(),
    character: z.number().int().positive(),
  }),
  end: z.object({
    line: z.number().int().positive(),
    character: z.number().int().positive(),
  }),
  preview: z.string().optional(),
})
export type LocationMatch = z.infer<typeof LocationMatch>

export const LocationQueryResult = z.object({
  path: z.string(),
  displayPath: z.string(),
  line: z.number().int().positive(),
  character: z.number().int().positive(),
  truncated: z.boolean(),
  items: z.array(LocationMatch),
})
export type LocationQueryResult = z.infer<typeof LocationQueryResult>

export const HoverQueryResult = z.object({
  path: z.string(),
  displayPath: z.string(),
  line: z.number().int().positive(),
  character: z.number().int().positive(),
  contents: z.string(),
  range: z.object({
    start: z.object({
      line: z.number().int().positive(),
      character: z.number().int().positive(),
    }),
    end: z.object({
      line: z.number().int().positive(),
      character: z.number().int().positive(),
    }),
  }).optional(),
})
export type HoverQueryResult = z.infer<typeof HoverQueryResult>

export const WorkspaceSymbolMatch = z.object({
  name: z.string(),
  kind: z.number().int(),
  kindLabel: z.string(),
  containerName: z.string().optional(),
  path: z.string().optional(),
  displayPath: z.string().optional(),
  start: z.object({
    line: z.number().int().positive(),
    character: z.number().int().positive(),
  }).optional(),
  end: z.object({
    line: z.number().int().positive(),
    character: z.number().int().positive(),
  }).optional(),
})
export type WorkspaceSymbolMatch = z.infer<typeof WorkspaceSymbolMatch>

export const WorkspaceSymbolQueryResult = z.object({
  query: z.string(),
  filterPath: z.string().optional(),
  filterDisplayPath: z.string().optional(),
  truncated: z.boolean(),
  items: z.array(WorkspaceSymbolMatch),
})
export type WorkspaceSymbolQueryResult = z.infer<typeof WorkspaceSymbolQueryResult>

type PreparedDocument = {
  client: LspClient
  displayPath: string
  resolvedPath: string
  spec: LanguageServerSpec
  uri: string
}

function supportedExtensionsLabel() {
  return supportedLanguageExtensions().join(", ")
}

function toLspPosition(line: number, character: number) {
  return {
    line: Math.max(0, line - 1),
    character: Math.max(0, character - 1),
  }
}

function toOneBasedRange(range: Range) {
  return {
    start: {
      line: range.start.line + 1,
      character: range.start.character + 1,
    },
    end: {
      line: range.end.line + 1,
      character: range.end.character + 1,
    },
  }
}

function isLocationLink(value: unknown): value is LocationLink {
  return Boolean(value) && typeof value === "object" && typeof (value as { targetUri?: unknown }).targetUri === "string"
}

function asLocationArray(value: unknown) {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

function hoverContentToText(contents: HoverContents): string {
  if (typeof contents === "string") {
    return contents
  }

  if (Array.isArray(contents)) {
    return contents.map((item) => hoverContentToText(item)).filter(Boolean).join("\n\n")
  }

  if ("kind" in contents && typeof contents.value === "string") {
    return contents.value
  }

  if ("language" in contents && typeof contents.value === "string") {
    return `\`\`\`${contents.language}\n${contents.value}\n\`\`\``
  }

  return ""
}

function symbolKindLabel(kind: number) {
  const labels: Record<number, string> = {
    1: "File",
    2: "Module",
    3: "Namespace",
    4: "Package",
    5: "Class",
    6: "Method",
    7: "Property",
    8: "Field",
    9: "Constructor",
    10: "Enum",
    11: "Interface",
    12: "Function",
    13: "Variable",
    14: "Constant",
    15: "String",
    16: "Number",
    17: "Boolean",
    18: "Array",
    19: "Object",
    20: "Key",
    21: "Null",
    22: "EnumMember",
    23: "Struct",
    24: "Event",
    25: "Operator",
    26: "TypeParameter",
  }

  return labels[kind] ?? `Kind ${kind}`
}

async function previewLine(filepath: string, line: number) {
  try {
    const excerpt = await readTextFileRange(filepath, line, Math.min(line, line + MAX_SNIPPET_LINE - 1))
    return excerpt.rendered || undefined
  } catch {
    return undefined
  }
}

function filePathFromUri(uri: string) {
  if (!uri.startsWith("file://")) return undefined

  try {
    const filepath = Filesystem.normalizePath(fileURLToPath(uri))
    return Instance.containsPath(filepath) ? filepath : undefined
  } catch {
    return undefined
  }
}

export class LspManager {
  private readonly clients = new Map<string, LspClient>()

  async dispose() {
    await Promise.all(Array.from(this.clients.values()).map((client) => client.dispose()))
    this.clients.clear()
  }

  async definition(input: {
    abort?: AbortSignal
    character: number
    line: number
    maxResults?: number
    path: string
  }): Promise<LocationQueryResult> {
    const prepared = await this.prepareDocument(input.path, input.abort)
    const raw = await prepared.client.request<Location | Location[] | LocationLink[] | null>(
      "textDocument/definition",
      {
        textDocument: {
          uri: prepared.uri,
        },
        position: toLspPosition(input.line, input.character),
      },
      input.abort,
    )

    const normalized = await this.normalizeLocations(raw, input.maxResults ?? 10)
    return {
      path: prepared.resolvedPath,
      displayPath: prepared.displayPath,
      line: input.line,
      character: input.character,
      truncated: normalized.truncated,
      items: normalized.items,
    }
  }

  async references(input: {
    abort?: AbortSignal
    character: number
    includeDeclaration?: boolean
    line: number
    maxResults?: number
    path: string
  }): Promise<LocationQueryResult> {
    const prepared = await this.prepareDocument(input.path, input.abort)
    const raw = await prepared.client.request<Location[] | null>(
      "textDocument/references",
      {
        textDocument: {
          uri: prepared.uri,
        },
        position: toLspPosition(input.line, input.character),
        context: {
          includeDeclaration: input.includeDeclaration ?? false,
        },
      },
      input.abort,
    )

    const normalized = await this.normalizeLocations(raw, input.maxResults ?? 20)
    return {
      path: prepared.resolvedPath,
      displayPath: prepared.displayPath,
      line: input.line,
      character: input.character,
      truncated: normalized.truncated,
      items: normalized.items,
    }
  }

  async hover(input: {
    abort?: AbortSignal
    character: number
    line: number
    path: string
  }): Promise<HoverQueryResult> {
    const prepared = await this.prepareDocument(input.path, input.abort)
    const raw = await prepared.client.request<Hover | null>(
      "textDocument/hover",
      {
        textDocument: {
          uri: prepared.uri,
        },
        position: toLspPosition(input.line, input.character),
      },
      input.abort,
    )

    return {
      path: prepared.resolvedPath,
      displayPath: prepared.displayPath,
      line: input.line,
      character: input.character,
      contents: raw ? hoverContentToText(raw.contents).trim() : "",
      range: raw?.range ? toOneBasedRange(raw.range) : undefined,
    }
  }

  async workspaceSymbols(input: {
    abort?: AbortSignal
    maxResults?: number
    path?: string
    query: string
  }): Promise<WorkspaceSymbolQueryResult> {
    const resolvedFilter = input.path ? resolveToolPath(input.path) : undefined
    const filterInfo = resolvedFilter ? await stat(resolvedFilter).catch(() => undefined) : undefined
    const filterIsDirectory = filterInfo?.isDirectory() ?? false
    const client = resolvedFilter && !filterIsDirectory
      ? (await this.prepareDocument(resolvedFilter, input.abort)).client
      : await this.clientForSpec(await languageForWorkspacePath(resolvedFilter))

    const raw = await client.request<Array<SymbolInformation | WorkspaceSymbol> | null>(
      "workspace/symbol",
      {
        query: input.query,
      },
      input.abort,
    )

    const normalized = await this.normalizeWorkspaceSymbols(
      raw,
      resolvedFilter,
      filterIsDirectory,
      input.maxResults ?? 20,
    )

    return {
      query: input.query,
      filterPath: resolvedFilter,
      filterDisplayPath: resolvedFilter ? toDisplayPath(resolvedFilter) : undefined,
      truncated: normalized.truncated,
      items: normalized.items,
    }
  }

  private async prepareDocument(filepath: string, abort?: AbortSignal): Promise<PreparedDocument> {
    const resolvedPath = resolveToolPath(filepath)
    const spec = languageForFile(resolvedPath)
    if (!spec) {
      throw new Error(
        `No LSP server is available for '${toDisplayPath(resolvedPath)}'. Supported extensions: ${supportedExtensionsLabel()}.`,
      )
    }

    const languageId = spec.languageIdForPath(resolvedPath)
    if (!languageId) {
      throw new Error(
        `No LSP language id is available for '${toDisplayPath(resolvedPath)}'. Supported extensions: ${supportedExtensionsLabel()}.`,
      )
    }

    const client = await this.clientForSpec(spec)
    const text = await readTextFile(resolvedPath)
    const synced = await client.syncDocument({
      abort,
      languageId,
      path: resolvedPath,
      text,
    })

    return {
      client,
      displayPath: toDisplayPath(resolvedPath),
      resolvedPath,
      spec,
      uri: synced.uri,
    }
  }

  private async clientForSpec(spec: LanguageServerSpec) {
    let client = this.clients.get(spec.id)
    if (client) return client

    client = new LspClient({
      command: await spec.resolveCommand(),
      root: Instance.worktree,
      spec,
    })
    this.clients.set(spec.id, client)
    return client
  }

  private async normalizeLocations(raw: unknown, maxResults: number) {
    const allCandidates = asLocationArray(raw)
    const items: LocationMatch[] = []
    const seen = new Set<string>()

    for (const candidate of allCandidates) {
      const normalized = await this.normalizeLocation(candidate)
      if (!normalized) continue

      const key = [
        normalized.path,
        normalized.start.line,
        normalized.start.character,
        normalized.end.line,
        normalized.end.character,
      ].join(":")

      if (seen.has(key)) continue
      seen.add(key)
      items.push(normalized)

      if (items.length >= maxResults) {
        return {
          truncated: allCandidates.length > items.length,
          items,
        }
      }
    }

    return {
      truncated: false,
      items,
    }
  }

  private async normalizeLocation(candidate: unknown): Promise<LocationMatch | undefined> {
    let uri: string | undefined
    let range: Range | undefined

    if (isLocationLink(candidate)) {
      uri = candidate.targetUri
      range = candidate.targetSelectionRange ?? candidate.targetRange
    } else if (candidate && typeof candidate === "object") {
      const location = candidate as Location
      if (typeof location.uri === "string" && location.range) {
        uri = location.uri
        range = location.range
      }
    }

    if (!uri || !range) return undefined

    const filepath = filePathFromUri(uri)
    if (!filepath) return undefined

    return {
      path: filepath,
      displayPath: toDisplayPath(filepath),
      start: {
        line: range.start.line + 1,
        character: range.start.character + 1,
      },
      end: {
        line: range.end.line + 1,
        character: range.end.character + 1,
      },
      preview: await previewLine(filepath, range.start.line + 1),
    }
  }

  private async normalizeWorkspaceSymbols(
    raw: Array<SymbolInformation | WorkspaceSymbol> | null,
    filterPath: string | undefined,
    filterIsDirectory: boolean,
    maxResults: number,
  ) {
    const items: WorkspaceSymbolMatch[] = []

    for (const symbol of raw ?? []) {
      const normalized = this.normalizeWorkspaceSymbol(symbol)
      if (!normalized) continue

      if (filterPath && normalized.path) {
        if (filterIsDirectory) {
          if (!Filesystem.contains(filterPath, normalized.path)) {
            continue
          }
        } else if (Filesystem.normalizePath(normalized.path) !== Filesystem.normalizePath(filterPath)) {
          continue
        }
      }

      items.push(normalized)
      if (items.length >= maxResults) {
        return {
          truncated: (raw?.length ?? 0) > items.length,
          items,
        }
      }
    }

    return {
      truncated: false,
      items,
    }
  }

  private normalizeWorkspaceSymbol(symbol: SymbolInformation | WorkspaceSymbol): WorkspaceSymbolMatch | undefined {
    const location = "location" in symbol ? symbol.location : undefined
    const uri = location && typeof location === "object" && "uri" in location
      ? location.uri
      : undefined
    const range = location && typeof location === "object" && "range" in location
      ? (location.range as Range)
      : undefined
    const filepath = uri ? filePathFromUri(uri) : undefined

    return {
      name: symbol.name,
      kind: symbol.kind,
      kindLabel: symbolKindLabel(symbol.kind),
      containerName: symbol.containerName,
      path: filepath,
      displayPath: filepath ? toDisplayPath(filepath) : undefined,
      start: range
        ? {
            line: range.start.line + 1,
            character: range.start.character + 1,
          }
        : undefined,
      end: range
        ? {
            line: range.end.line + 1,
            character: range.end.character + 1,
          }
        : undefined,
    }
  }
}

const managerState = Instance.state(
  () => new LspManager(),
  async (manager) => {
    await manager.dispose()
  },
)

export async function definition(input: {
  abort?: AbortSignal
  character: number
  line: number
  maxResults?: number
  path: string
}) {
  return await managerState().definition(input)
}

export async function references(input: {
  abort?: AbortSignal
  character: number
  includeDeclaration?: boolean
  line: number
  maxResults?: number
  path: string
}) {
  return await managerState().references(input)
}

export async function hover(input: {
  abort?: AbortSignal
  character: number
  line: number
  path: string
}) {
  return await managerState().hover(input)
}

export async function workspaceSymbols(input: {
  abort?: AbortSignal
  maxResults?: number
  path?: string
  query: string
}) {
  return await managerState().workspaceSymbols(input)
}
