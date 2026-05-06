import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
import { AskUserQuestionTool } from "#tool/ask-user-question.ts"
import { ApplyPatchTool } from "#tool/apply-patch.ts"
import { CancelSubagentTool } from "#tool/cancel-subagent.ts"
import {
  CmdCommandTool,
  GitBashCommandTool,
  PowerShellCommandTool,
  WslBashCommandTool,
} from "#tool/shell-command.ts"
import { EnterPlanModeTool } from "#tool/enter-plan-mode.ts"
import { ExitPlanModeTool } from "#tool/exit-plan-mode.ts"
import { GlobTool } from "#tool/glob.ts"
import { GrepTool } from "#tool/grep.ts"
import { GenerateImageTool } from "#tool/generate-image.ts"
import { ListDirectoryTool } from "#tool/list-directory.ts"
import { LspDefinitionTool, LspHoverTool, LspReferencesTool, LspWorkspaceSymbolsTool } from "#tool/lsp.ts"
import { LoadSkillTool } from "#tool/load-skill.ts"
import { ListMcpResourceTemplatesTool, ListMcpResourcesTool, ReadMcpResourceTool } from "#tool/mcp-resources.ts"
import { ReadBackgroundTaskTool } from "#tool/read-background-task.ts"
import { ReadFileTool } from "#tool/read-file.ts"
import { ReadSubagentTool } from "#tool/read-subagent.ts"
import { ReadSkillResourceTool } from "#tool/read-skill-resource.ts"
import { ReplaceTextTool } from "#tool/replace-text.ts"
import { SpawnSubagentTool } from "#tool/spawn-subagent.ts"
import { StopBackgroundTaskTool } from "#tool/stop-background-task.ts"
import { TaskCreateTool, TaskGetTool, TaskListTool, TaskUpdateTool } from "#tool/task-tools.ts"
import { ViewImageTool } from "#tool/view-image.ts"
import { WaitSubagentTool } from "#tool/wait-subagent.ts"
import { WebFetchTool } from "#tool/web-fetch.ts"
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

export async function builtinTools(): Promise<Tool.ToolInfo[]> {
  return [
    AskUserQuestionTool,
    EnterPlanModeTool,
    ExitPlanModeTool,
    TaskCreateTool,
    TaskGetTool,
    TaskListTool,
    TaskUpdateTool,
    ReadFileTool,
    ReadBackgroundTaskTool,
    ReadSubagentTool,
    WaitSubagentTool,
    LoadSkillTool,
    ReadSkillResourceTool,
    ListMcpResourcesTool,
    ListMcpResourceTemplatesTool,
    ReadMcpResourceTool,
    ReplaceTextTool,
    ApplyPatchTool,
    GlobTool,
    GrepTool,
    ListDirectoryTool,
    GenerateImageTool,
    ViewImageTool,
    WebFetchTool,
    SpawnSubagentTool,
    CancelSubagentTool,
    StopBackgroundTaskTool,
    LspDefinitionTool,
    LspReferencesTool,
    LspHoverTool,
    LspWorkspaceSymbolsTool,
    GitBashCommandTool,
    PowerShellCommandTool,
    CmdCommandTool,
    WslBashCommandTool,
  ]
}

export async function tools(): Promise<Tool.ToolInfo[]> {
  const custom = await state().then((x) => x.custom)
  const mcpTools = await Mcp.tools()
  const result = [
    ...(await builtinTools()),
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
