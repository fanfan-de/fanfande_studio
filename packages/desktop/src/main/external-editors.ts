import { spawn, spawnSync, type SpawnOptions } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export type ExternalEditorID = "vscode" | "cursor" | "windsurf" | "explorer"

export interface ExternalEditorSummary {
  id: ExternalEditorID
  label: string
  executablePath: string
}

export interface ExternalEditorLaunchSpec {
  command: string
  args: string[]
  shell: boolean
  waitForExit: boolean
  windowsVerbatimArguments: boolean
}

interface ExternalEditorDescriptor {
  id: ExternalEditorID
  label: string
  commandNames: string[]
  windowsPathTemplates: string[]
}

interface ExternalEditorDependencies {
  env?: NodeJS.ProcessEnv
  existsSync?: (targetPath: string) => boolean
  platform?: NodeJS.Platform
  resolveCommand?: (commandName: string) => string | undefined
  spawnProcess?: typeof spawn
  statSync?: typeof fs.statSync
}

const EXTERNAL_EDITOR_DESCRIPTORS: ExternalEditorDescriptor[] = [
  {
    id: "vscode",
    label: "VS Code",
    commandNames: ["code"],
    windowsPathTemplates: [
      "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles%\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles(x86)%\\Microsoft VS Code\\Code.exe",
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    commandNames: ["cursor"],
    windowsPathTemplates: [
      "%LOCALAPPDATA%\\Programs\\Cursor\\Cursor.exe",
      "%ProgramFiles%\\Cursor\\Cursor.exe",
      "%ProgramFiles(x86)%\\Cursor\\Cursor.exe",
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf",
    commandNames: ["windsurf"],
    windowsPathTemplates: [
      "%LOCALAPPDATA%\\Programs\\Windsurf\\Windsurf.exe",
      "%ProgramFiles%\\Windsurf\\Windsurf.exe",
      "%ProgramFiles(x86)%\\Windsurf\\Windsurf.exe",
    ],
  },
  {
    id: "explorer",
    label: "File Explorer",
    commandNames: ["explorer.exe", "explorer"],
    windowsPathTemplates: ["%SystemRoot%\\explorer.exe"],
  },
]

const WINDOWS_EDITOR_COMMAND_EXTENSIONS = [".cmd", ".exe", ".bat", ".com"] as const

function expandWindowsPathTemplate(template: string, env: NodeJS.ProcessEnv) {
  return template.replace(/%([^%]+)%/g, (_match, variableName: string) => env[variableName] ?? "")
}

function defaultResolveCommand(commandName: string) {
  if (process.platform !== "win32") return undefined

  const result = spawnSync("where.exe", [commandName], {
    encoding: "utf8",
    windowsHide: true,
  })

  if (result.status !== 0) return undefined

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
}

function resolveLaunchableWindowsCommand(commandPath: string, existsSync: (targetPath: string) => boolean) {
  const candidate = path.normalize(commandPath.trim())
  if (!candidate) return undefined

  const extension = path.extname(candidate).toLowerCase()
  if (extension) {
    return candidate
  }

  for (const commandExtension of WINDOWS_EDITOR_COMMAND_EXTENSIONS) {
    const expandedCandidate = `${candidate}${commandExtension}`
    if (existsSync(expandedCandidate)) {
      return expandedCandidate
    }
  }

  return undefined
}

function resolveDescriptorExecutable(
  descriptor: ExternalEditorDescriptor,
  {
    env = process.env,
    existsSync = fs.existsSync,
    platform = process.platform,
    resolveCommand = defaultResolveCommand,
  }: ExternalEditorDependencies = {},
) {
  if (platform !== "win32") return undefined

  for (const commandName of descriptor.commandNames) {
    const resolvedCommand = resolveCommand(commandName)?.trim()
    if (!resolvedCommand) continue

    const launchableCommand = resolveLaunchableWindowsCommand(resolvedCommand, existsSync)
    if (launchableCommand) return launchableCommand
  }

  for (const template of descriptor.windowsPathTemplates) {
    const candidate = path.normalize(expandWindowsPathTemplate(template, env))
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function isShellWrappedExecutable(executablePath: string) {
  const extension = path.extname(executablePath).toLowerCase()
  return extension === ".cmd" || extension === ".bat"
}

function resolveWindowsCommandShell(env: NodeJS.ProcessEnv) {
  const comSpec = env.ComSpec?.trim()
  if (comSpec) return comSpec

  const systemRoot = env.SystemRoot?.trim() || "C:\\Windows"
  return path.join(systemRoot, "System32", "cmd.exe")
}

function quoteWindowsCmdInvocation(command: string, args: string[]) {
  const quotedCommand = `"${command}"`
  const quotedArgs = args.map((arg) => `"${arg}"`).join(" ")
  return quotedArgs ? `"${quotedCommand} ${quotedArgs}` : `"${quotedCommand}`
}

export function buildExternalEditorLaunchSpec(
  editor: ExternalEditorSummary,
  targetPath: string,
  { env = process.env }: Pick<ExternalEditorDependencies, "env"> = {},
): ExternalEditorLaunchSpec {
  if (isShellWrappedExecutable(editor.executablePath)) {
    return {
      command: resolveWindowsCommandShell(env),
      args: ["/d", "/s", "/c", quoteWindowsCmdInvocation(editor.executablePath, [targetPath])],
      shell: false,
      waitForExit: true,
      windowsVerbatimArguments: true,
    }
  }

  return {
    command: editor.executablePath,
    args: [targetPath],
    shell: false,
    waitForExit: false,
    windowsVerbatimArguments: false,
  }
}

export function listAvailableExternalEditors(dependencies?: ExternalEditorDependencies): ExternalEditorSummary[] {
  return EXTERNAL_EDITOR_DESCRIPTORS.flatMap((descriptor) => {
    const executablePath = resolveDescriptorExecutable(descriptor, dependencies)
    return executablePath
      ? [
          {
            id: descriptor.id,
            label: descriptor.label,
            executablePath,
          } satisfies ExternalEditorSummary,
        ]
      : []
  })
}

export function openInExternalEditor(
  input: {
    editorID?: string
    targetPath: string
  },
  {
    platform = process.platform,
    spawnProcess = spawn,
    statSync = fs.statSync,
    ...dependencies
  }: ExternalEditorDependencies = {},
): Promise<{
  ok: true
  editor: ExternalEditorSummary
  targetPath: string
}> {
  if (platform !== "win32") {
    throw new Error("Opening external editors is currently supported on Windows only.")
  }

  const targetPath = input.targetPath.trim()
  if (!targetPath) {
    throw new Error("A workspace directory is required.")
  }

  let stats: fs.Stats
  try {
    stats = statSync(targetPath)
  } catch {
    throw new Error(`Workspace directory not found: ${targetPath}`)
  }

  if (!stats.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${targetPath}`)
  }

  const editors = listAvailableExternalEditors({
    ...dependencies,
    platform,
  })
  const editor = input.editorID ? editors.find((item) => item.id === input.editorID) : editors[0]

  if (!editor) {
    throw new Error(input.editorID ? `Editor '${input.editorID}' is not available.` : "No supported external editors were found.")
  }

  const launch = buildExternalEditorLaunchSpec(editor, targetPath, {
    env: dependencies.env,
  })
  const child = spawnProcess(launch.command, launch.args, {
    detached: true,
    shell: launch.shell,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: launch.windowsVerbatimArguments,
  } satisfies SpawnOptions)

  return new Promise((resolve, reject) => {
    let settled = false

    const cleanup = () => {
      child.removeListener?.("error", handleError)
      child.removeListener?.("close", handleClose)
      child.removeListener?.("spawn", handleSpawn)
    }

    const handleError = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(`Failed to launch ${editor.label}: ${error.message}`))
    }

    const handleClose = (code: number | null) => {
      if (!launch.waitForExit || settled) return
      settled = true
      cleanup()
      if (code === 0) {
        resolve({
          ok: true,
          editor,
          targetPath,
        })
        return
      }

      reject(new Error(`Failed to launch ${editor.label}. Process exited with code ${code ?? "unknown"}.`))
    }

    const handleSpawn = () => {
      child.unref()
      if (launch.waitForExit || settled) return
      settled = true
      cleanup()
      resolve({
        ok: true,
        editor,
        targetPath,
      })
    }

    child.once("error", handleError)
    child.once("close", handleClose)
    child.once("spawn", handleSpawn)
  })
}
