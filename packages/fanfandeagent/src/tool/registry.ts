import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
import { ApplyPatchTool } from "#tool/apply-patch.ts"
import { ExecCommandTool } from "#tool/exec-command.ts"
import { ListDirectoryTool } from "#tool/list-directory.ts"
import { ReadFileTool } from "#tool/read-file.ts"
import { ReplaceTextTool } from "#tool/replace-text.ts"
import { SearchFilesTool } from "#tool/search-files.ts"
import { WriteFileTool } from "#tool/write-file.ts"

export const state = Instance.state(async () => {
  return {
    custom: [] as Tool.ToolInfo[],
  }
})

export async function tools(): Promise<Tool.ToolInfo[]> {
  const custom = await state().then((x) => x.custom)
  return [
    ReadFileTool,
    WriteFileTool,
    ReplaceTextTool,
    ApplyPatchTool,
    ListDirectoryTool,
    SearchFilesTool,
    ExecCommandTool,
    ...custom,
  ]
}

export async function get(id: string): Promise<Tool.ToolInfo | undefined> {
  return (await tools()).find((tool) => tool.id === id)
}

export async function names(): Promise<string[]> {
  return (await tools()).map((tool) => tool.id)
}
