import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
import { ApplyPatchTool } from "#tool/apply-patch.ts"
import { ExecCommandTool } from "#tool/exec-command.ts"
import { ListDirectoryTool } from "#tool/list-directory.ts"
import { ReadFileTool } from "#tool/read-file.ts"
import { ReplaceTextTool } from "#tool/replace-text.ts"
import { SearchFilesTool } from "#tool/search-files.ts"
import { WriteFileTool } from "#tool/write-file.ts"
import * as Mcp from "#mcp/manager.ts"

function exposedNames(tool: Tool.ToolInfo): string[] {
  return [tool.id, ...(tool.aliases ?? [])]
}

function assertUniqueToolNames(tools: Tool.ToolInfo[]) {
  const seen = new Map<string, string>()

  for (const tool of tools) {
    for (const name of exposedNames(tool)) {
      const existing = seen.get(name)
      if (existing) {
        throw new Error(`Duplicate tool name "${name}" is declared by both "${existing}" and "${tool.id}".`)
      }

      seen.set(name, tool.id)
    }
  }
}

export const state = Instance.state(async () => {
  return {
    custom: [] as Tool.ToolInfo[],
  }
})

export async function tools(): Promise<Tool.ToolInfo[]> {
  const custom = await state().then((x) => x.custom)
  const mcpTools = await Mcp.tools()
  const result = [
    ReadFileTool,
    WriteFileTool,
    ReplaceTextTool,
    ApplyPatchTool,
    ListDirectoryTool,
    SearchFilesTool,
    ExecCommandTool,
    ...mcpTools,
    ...custom,
  ]

  assertUniqueToolNames(result)
  return result
}

export async function get(id: string): Promise<Tool.ToolInfo | undefined> {
  return (await tools()).find((tool) => Tool.toolMatchesName(tool, id))
}

export async function names(): Promise<string[]> {
  return (await tools()).flatMap(exposedNames)
}
