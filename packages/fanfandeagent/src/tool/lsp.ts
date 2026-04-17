import z from "zod"
import * as Lsp from "#lsp/manager.ts"
import * as Tool from "#tool/tool.ts"
import { resolveToolPath, toDisplayPath } from "#tool/shared.ts"

const PositionParameters = z.object({
  path: z.string().min(1).describe("Absolute or project-relative file path."),
  line: z.number().int().positive().describe("1-based line number."),
  character: z.number().int().positive().describe("1-based character number."),
})

function serializeForModel(result: Tool.ToolOutput) {
  if (result.data && typeof result.data === "object") {
    return {
      type: "json" as const,
      value: result.data as any,
    }
  }

  return {
    type: "text" as const,
    value: result.text,
  }
}

function formatLocationResult(title: string, result: Lsp.LocationQueryResult) {
  const lines = [
    `Query: ${result.displayPath}:${result.line}:${result.character}`,
    `Matches: ${result.items.length}`,
    result.truncated ? "Note: output was truncated. Narrow the query or increase maxResults." : undefined,
  ]

  for (const [index, item] of result.items.entries()) {
    lines.push("")
    lines.push(`${index + 1}. ${item.displayPath}:${item.start.line}:${item.start.character}-${item.end.line}:${item.end.character}`)
    if (item.preview) {
      lines.push(`   ${item.preview}`)
    }
  }

  if (result.items.length === 0) {
    lines.push("")
    lines.push(`No ${title.toLowerCase()} results were found.`)
  }

  return lines.filter(Boolean).join("\n")
}

function formatHoverResult(result: Lsp.HoverQueryResult) {
  return [
    `Query: ${result.displayPath}:${result.line}:${result.character}`,
    result.range
      ? `Range: ${result.range.start.line}:${result.range.start.character}-${result.range.end.line}:${result.range.end.character}`
      : undefined,
    "",
    result.contents || "No hover information was returned.",
  ].filter(Boolean).join("\n")
}

function formatWorkspaceSymbols(result: Lsp.WorkspaceSymbolQueryResult) {
  const lines = [
    `Query: ${result.query}`,
    result.filterDisplayPath ? `Filter: ${result.filterDisplayPath}` : undefined,
    `Matches: ${result.items.length}`,
    result.truncated ? "Note: output was truncated. Narrow the query or increase maxResults." : undefined,
  ]

  for (const [index, item] of result.items.entries()) {
    lines.push("")
    lines.push(
      `${index + 1}. ${item.kindLabel} ${item.name}${
        item.containerName ? ` (${item.containerName})` : ""
      }`,
    )
    if (item.displayPath && item.start) {
      lines.push(`   ${item.displayPath}:${item.start.line}:${item.start.character}`)
    } else if (item.displayPath) {
      lines.push(`   ${item.displayPath}`)
    }
  }

  if (result.items.length === 0) {
    lines.push("")
    lines.push("No workspace symbols were found.")
  }

  return lines.filter(Boolean).join("\n")
}

export const LspDefinitionTool = Tool.define(
  "lsp_definition",
  async () => ({
    title: "LSP Definition",
    description: "Resolve the definition location for the symbol at a file position.",
    parameters: PositionParameters.extend({
      maxResults: z.number().int().positive().max(50).optional().describe("Maximum number of definition matches to return."),
    }),
    describeApproval: (parameters, ctx) => {
      const resolved = resolveToolPath(parameters.path)

      return {
        title: `LSP definition ${toDisplayPath(resolved)}`,
        summary: `Resolve the definition at ${toDisplayPath(resolved)}:${parameters.line}:${parameters.character}.`,
        details: {
          paths: [toDisplayPath(resolved)],
          workdir: ctx.cwd,
        },
      }
    },
    execute: async (parameters, ctx) => {
      const result = await Lsp.definition({
        ...parameters,
        abort: ctx.abort,
      })

      return {
        title: "LSP Definition",
        text: formatLocationResult("Definition", result),
        data: result,
      }
    },
    toModelOutput: serializeForModel,
  }),
  {
    title: "LSP Definition",
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)

export const LspReferencesTool = Tool.define(
  "lsp_references",
  async () => ({
    title: "LSP References",
    description: "Find references for the symbol at a file position.",
    parameters: PositionParameters.extend({
      includeDeclaration: z.boolean().optional().describe("Include the declaration in the reference list."),
      maxResults: z.number().int().positive().max(100).optional().describe("Maximum number of reference matches to return."),
    }),
    describeApproval: (parameters, ctx) => {
      const resolved = resolveToolPath(parameters.path)

      return {
        title: `LSP references ${toDisplayPath(resolved)}`,
        summary: `Find symbol references at ${toDisplayPath(resolved)}:${parameters.line}:${parameters.character}.`,
        details: {
          paths: [toDisplayPath(resolved)],
          workdir: ctx.cwd,
        },
      }
    },
    execute: async (parameters, ctx) => {
      const result = await Lsp.references({
        ...parameters,
        abort: ctx.abort,
      })

      return {
        title: "LSP References",
        text: formatLocationResult("References", result),
        data: result,
      }
    },
    toModelOutput: serializeForModel,
  }),
  {
    title: "LSP References",
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)

export const LspHoverTool = Tool.define(
  "lsp_hover",
  async () => ({
    title: "LSP Hover",
    description: "Read hover information for the symbol at a file position.",
    parameters: PositionParameters,
    describeApproval: (parameters, ctx) => {
      const resolved = resolveToolPath(parameters.path)

      return {
        title: `LSP hover ${toDisplayPath(resolved)}`,
        summary: `Read hover information at ${toDisplayPath(resolved)}:${parameters.line}:${parameters.character}.`,
        details: {
          paths: [toDisplayPath(resolved)],
          workdir: ctx.cwd,
        },
      }
    },
    execute: async (parameters, ctx) => {
      const result = await Lsp.hover({
        ...parameters,
        abort: ctx.abort,
      })

      return {
        title: "LSP Hover",
        text: formatHoverResult(result),
        data: result,
      }
    },
    toModelOutput: serializeForModel,
  }),
  {
    title: "LSP Hover",
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)

export const LspWorkspaceSymbolsTool = Tool.define(
  "lsp_workspace_symbols",
  async () => ({
    title: "LSP Workspace Symbols",
    description: "Search workspace symbols through the active language server.",
    parameters: z.object({
      query: z.string().min(1).describe("Workspace symbol search query."),
      path: z.string().optional().describe("Optional file or directory path used to filter results."),
      maxResults: z.number().int().positive().max(100).optional().describe("Maximum number of workspace symbols to return."),
    }),
    describeApproval: (parameters, ctx) => {
      const resolved = parameters.path ? resolveToolPath(parameters.path) : undefined

      return {
        title: "LSP workspace symbols",
        summary: resolved
          ? `Search workspace symbols for "${parameters.query}" under ${toDisplayPath(resolved)}.`
          : `Search workspace symbols for "${parameters.query}".`,
        details: {
          paths: resolved ? [toDisplayPath(resolved)] : undefined,
          workdir: ctx.cwd,
        },
      }
    },
    execute: async (parameters, ctx) => {
      const result = await Lsp.workspaceSymbols({
        ...parameters,
        abort: ctx.abort,
      })

      return {
        title: "LSP Workspace Symbols",
        text: formatWorkspaceSymbols(result),
        data: result,
      }
    },
    toModelOutput: serializeForModel,
  }),
  {
    title: "LSP Workspace Symbols",
    capabilities: {
      kind: "search",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
