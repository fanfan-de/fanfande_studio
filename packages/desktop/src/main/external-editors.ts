import { spawn, spawnSync, type SpawnOptions } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export type ExternalEditorID =
  | "vscode"
  | "visualstudio"
  | "cursor"
  | "windsurf"
  | "githubDesktop"
  | "explorer"
  | "terminal"
  | "wsl"

export interface ExternalEditorSummary {
  id: ExternalEditorID
  label: string
  executablePath: string
  iconPath?: string
}

export interface ExternalEditorLaunchSpec {
  command: string
  args: string[]
  shell: boolean
  waitForExit: boolean
  windowsHide: boolean
  windowsVerbatimArguments: boolean
}

interface ExternalEditorDescriptor {
  id: ExternalEditorID
  label: string
  commandNames: string[]
  windowsPathTemplates: string[]
  iconPathTemplates?: string[]
}

interface ExternalEditorDependencies {
  env?: NodeJS.ProcessEnv
  existsSync?: (targetPath: string) => boolean
  openPath?: (targetPath: string) => Promise<string>
  platform?: NodeJS.Platform
  readdirSync?: typeof fs.readdirSync
  resolveCommand?: (commandName: string) => string | undefined
  spawnProcess?: typeof spawn
  spawnSyncProcess?: typeof spawnSync
  statSync?: typeof fs.statSync
}

const VISUAL_STUDIO_YEARS = ["2022", "2019", "2017"] as const
const VISUAL_STUDIO_EDITIONS = ["Community", "Professional", "Enterprise", "Preview"] as const
const VISUAL_STUDIO_PATH_TEMPLATES = VISUAL_STUDIO_YEARS.flatMap((year) => {
  const baseTemplate = year === "2022" ? "%ProgramFiles%" : "%ProgramFiles(x86)%"
  return VISUAL_STUDIO_EDITIONS.map(
    (edition) => `${baseTemplate}\\Microsoft Visual Studio\\${year}\\${edition}\\Common7\\IDE\\devenv.exe`,
  )
})

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
    iconPathTemplates: [
      "%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles%\\Microsoft VS Code\\Code.exe",
      "%ProgramFiles(x86)%\\Microsoft VS Code\\Code.exe",
    ],
  },
  {
    id: "visualstudio",
    label: "Visual Studio",
    commandNames: ["devenv"],
    windowsPathTemplates: VISUAL_STUDIO_PATH_TEMPLATES,
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
    id: "githubDesktop",
    label: "GitHub Desktop",
    commandNames: ["github"],
    windowsPathTemplates: [],
    iconPathTemplates: ["%LOCALAPPDATA%\\GitHubDesktop\\GitHubDesktop.exe"],
  },
  {
    id: "explorer",
    label: "File Explorer",
    commandNames: ["explorer.exe", "explorer"],
    windowsPathTemplates: ["%SystemRoot%\\explorer.exe"],
  },
  {
    id: "terminal",
    label: "Terminal",
    commandNames: ["wt.exe", "wt"],
    windowsPathTemplates: ["%LOCALAPPDATA%\\Microsoft\\WindowsApps\\wt.exe"],
  },
  {
    id: "wsl",
    label: "WSL",
    commandNames: ["wsl.exe", "wsl"],
    windowsPathTemplates: ["%SystemRoot%\\System32\\wsl.exe"],
  },
]

const WINDOWS_EDITOR_COMMAND_EXTENSIONS = [".cmd", ".exe", ".bat", ".com"] as const
const VISUAL_STUDIO_SOLUTION_EXTENSIONS = new Set([".sln", ".slnx"])
const VISUAL_STUDIO_PROJECT_EXTENSIONS = new Set([".csproj", ".fsproj", ".vbproj", ".vcxproj"])
const VISUAL_STUDIO_SKIP_DIRECTORIES = new Set([".git", ".next", "bin", "build", "dist", "node_modules", "obj", "out"])

function expandWindowsPathTemplate(template: string, env: NodeJS.ProcessEnv) {
  return template.replace(/%([^%]+)%/g, (_match, variableName: string) => env[variableName] ?? "")
}

function defaultResolveCommand(
  commandName: string,
  {
    platform = process.platform,
    spawnSyncProcess = spawnSync,
  }: Pick<ExternalEditorDependencies, "platform" | "spawnSyncProcess"> = {},
) {
  if (platform !== "win32") return undefined

  const result = spawnSyncProcess("where.exe", [commandName], {
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

function resolveTemplatePath(
  templates: readonly string[],
  {
    env = process.env,
    existsSync = fs.existsSync,
  }: Pick<ExternalEditorDependencies, "env" | "existsSync"> = {},
) {
  for (const template of templates) {
    const candidate = path.normalize(expandWindowsPathTemplate(template, env))
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return undefined
}

function resolveVisualStudioExecutable({
  env = process.env,
  existsSync = fs.existsSync,
  platform = process.platform,
  resolveCommand = (commandName: string) => defaultResolveCommand(commandName, { platform, spawnSyncProcess }),
  spawnSyncProcess = spawnSync,
}: ExternalEditorDependencies = {}) {
  if (platform !== "win32") return undefined

  const resolvedCommand = resolveCommand("devenv")?.trim()
  if (resolvedCommand) {
    const launchableCommand = resolveLaunchableWindowsCommand(resolvedCommand, existsSync)
    if (launchableCommand) return launchableCommand
  }

  const programFilesX86 = env["ProgramFiles(x86)"]?.trim() || "C:\\Program Files (x86)"
  const vswherePath = path.join(programFilesX86, "Microsoft Visual Studio", "Installer", "vswhere.exe")
  if (existsSync(vswherePath)) {
    const result = spawnSyncProcess(
      vswherePath,
      ["-latest", "-products", "*", "-find", "Common7\\IDE\\devenv.exe"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    )
    if (result.status === 0) {
      const match = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)
      if (match && existsSync(match)) {
        return path.normalize(match)
      }
    }
  }

  return resolveTemplatePath(VISUAL_STUDIO_PATH_TEMPLATES, {
    env,
    existsSync,
  })
}

function resolveDescriptorExecutable(
  descriptor: ExternalEditorDescriptor,
  {
    env = process.env,
    existsSync = fs.existsSync,
    platform = process.platform,
    resolveCommand = (commandName: string) => defaultResolveCommand(commandName, { platform, spawnSyncProcess }),
    spawnSyncProcess = spawnSync,
  }: ExternalEditorDependencies = {},
) {
  if (platform !== "win32") return undefined

  if (descriptor.id === "visualstudio") {
    return resolveVisualStudioExecutable({
      env,
      existsSync,
      platform,
      resolveCommand,
      spawnSyncProcess,
    })
  }

  for (const commandName of descriptor.commandNames) {
    const resolvedCommand = resolveCommand(commandName)?.trim()
    if (!resolvedCommand) continue

    const launchableCommand = resolveLaunchableWindowsCommand(resolvedCommand, existsSync)
    if (launchableCommand) return launchableCommand
  }

  return resolveTemplatePath(descriptor.windowsPathTemplates, {
    env,
    existsSync,
  })
}

function resolveDescriptorIconPath(
  descriptor: ExternalEditorDescriptor,
  executablePath: string,
  dependencies?: Pick<ExternalEditorDependencies, "env" | "existsSync">,
) {
  const iconPath = resolveTemplatePath(descriptor.iconPathTemplates ?? [], dependencies)
  if (!iconPath || iconPath === executablePath) {
    return undefined
  }

  return iconPath
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

function buildLaunchSpecForWindowsStart(
  executablePath: string,
  args: string[],
  {
    env = process.env,
    windowsHide = true,
  }: {
    env?: NodeJS.ProcessEnv
    windowsHide?: boolean
  } = {},
): ExternalEditorLaunchSpec {
  const quotedCommand = `"${executablePath}"`
  const quotedArgs = args.map((arg) => `"${arg}"`).join(" ")
  const startCommand = quotedArgs ? `"start "" ${quotedCommand} ${quotedArgs}"` : `"start "" ${quotedCommand}"`

  return {
    command: resolveWindowsCommandShell(env),
    args: ["/d", "/s", "/c", startCommand],
    shell: false,
    waitForExit: true,
    windowsHide,
    windowsVerbatimArguments: true,
  }
}

function buildLaunchSpecForExecutable(
  executablePath: string,
  args: string[],
  {
    env = process.env,
    waitForExit,
    windowsHide = true,
  }: {
    env?: NodeJS.ProcessEnv
    waitForExit?: boolean
    windowsHide?: boolean
  } = {},
): ExternalEditorLaunchSpec {
  if (isShellWrappedExecutable(executablePath)) {
    return {
      command: resolveWindowsCommandShell(env),
      args: ["/d", "/s", "/c", quoteWindowsCmdInvocation(executablePath, args)],
      shell: false,
      waitForExit: waitForExit ?? true,
      windowsHide,
      windowsVerbatimArguments: true,
    }
  }

  return {
    command: executablePath,
    args,
    shell: false,
    waitForExit: waitForExit ?? false,
    windowsHide,
    windowsVerbatimArguments: false,
  }
}

function readDirectoryEntries(
  directoryPath: string,
  readdirSync: typeof fs.readdirSync = fs.readdirSync,
): fs.Dirent[] {
  try {
    return readdirSync(directoryPath, { withFileTypes: true }) as fs.Dirent[]
  } catch {
    return []
  }
}

function findVisualStudioOpenTarget(
  directoryPath: string,
  {
    readdirSync = fs.readdirSync,
  }: Pick<ExternalEditorDependencies, "readdirSync"> = {},
  remainingDepth = 3,
): string | undefined {
  const entries = readDirectoryEntries(directoryPath, readdirSync).sort((left, right) => left.name.localeCompare(right.name))
  let firstProjectPath: string | undefined

  for (const entry of entries) {
    if (!entry.isFile()) continue

    const extension = path.extname(entry.name).toLowerCase()
    const candidatePath = path.join(directoryPath, entry.name)
    if (VISUAL_STUDIO_SOLUTION_EXTENSIONS.has(extension)) {
      return candidatePath
    }

    if (!firstProjectPath && VISUAL_STUDIO_PROJECT_EXTENSIONS.has(extension)) {
      firstProjectPath = candidatePath
    }
  }

  if (remainingDepth <= 0) {
    return firstProjectPath
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || VISUAL_STUDIO_SKIP_DIRECTORIES.has(entry.name.toLowerCase())) {
      continue
    }

    const nestedTarget = findVisualStudioOpenTarget(path.join(directoryPath, entry.name), { readdirSync }, remainingDepth - 1)
    if (!nestedTarget) continue

    if (VISUAL_STUDIO_SOLUTION_EXTENSIONS.has(path.extname(nestedTarget).toLowerCase())) {
      return nestedTarget
    }

    if (!firstProjectPath) {
      firstProjectPath = nestedTarget
    }
  }

  return firstProjectPath
}

function isGitRepositoryTarget(
  targetPath: string,
  {
    existsSync = fs.existsSync,
  }: Pick<ExternalEditorDependencies, "existsSync"> = {},
) {
  return existsSync(path.join(targetPath, ".git"))
}

function isEditorSupportedForTarget(
  editorID: ExternalEditorID,
  targetPath: string,
  dependencies?: Pick<ExternalEditorDependencies, "existsSync" | "readdirSync">,
) {
  switch (editorID) {
    case "githubDesktop":
      return isGitRepositoryTarget(targetPath, dependencies)
    case "visualstudio":
      return Boolean(findVisualStudioOpenTarget(targetPath, dependencies))
    default:
      return true
  }
}

export function buildExternalEditorLaunchSpec(
  editor: ExternalEditorSummary,
  targetPath: string,
  {
    env = process.env,
    readdirSync = fs.readdirSync,
  }: Pick<ExternalEditorDependencies, "env" | "readdirSync"> = {},
): ExternalEditorLaunchSpec {
  switch (editor.id) {
    case "terminal":
      return buildLaunchSpecForWindowsStart(editor.executablePath, ["-d", targetPath], { env })
    case "wsl":
      return buildLaunchSpecForExecutable(editor.executablePath, ["--cd", targetPath], {
        env,
        windowsHide: false,
      })
    case "visualstudio": {
      const openTargetPath = findVisualStudioOpenTarget(targetPath, { readdirSync }) ?? targetPath
      return buildLaunchSpecForExecutable(editor.executablePath, [openTargetPath], { env })
    }
    default:
      return buildLaunchSpecForExecutable(editor.executablePath, [targetPath], { env })
  }
}

export function listAvailableExternalEditors(dependencies?: ExternalEditorDependencies): ExternalEditorSummary[] {
  return EXTERNAL_EDITOR_DESCRIPTORS.flatMap((descriptor) => {
    const executablePath = resolveDescriptorExecutable(descriptor, dependencies)
    if (!executablePath) return []

    const iconPath = resolveDescriptorIconPath(descriptor, executablePath, dependencies)
    return [
      {
        id: descriptor.id,
        label: descriptor.label,
        executablePath,
        ...(iconPath ? { iconPath } : {}),
      } satisfies ExternalEditorSummary,
    ]
  })
}

export function filterAvailableExternalEditorsForTarget(
  editors: ExternalEditorSummary[],
  targetPath: string,
  dependencies?: Pick<ExternalEditorDependencies, "existsSync" | "readdirSync">,
): ExternalEditorSummary[] {
  return editors.filter((editor) => isEditorSupportedForTarget(editor.id, targetPath, dependencies))
}

export function listAvailableExternalEditorsForTarget(
  targetPath: string,
  dependencies?: ExternalEditorDependencies,
): ExternalEditorSummary[] {
  return filterAvailableExternalEditorsForTarget(listAvailableExternalEditors(dependencies), targetPath, dependencies)
}

export function openInExternalEditor(
  input: {
    editorID?: string
    targetPath: string
  },
  {
    openPath,
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

  const editors = listAvailableExternalEditorsForTarget(targetPath, {
    ...dependencies,
    platform,
  })
  const editor = input.editorID ? editors.find((item) => item.id === input.editorID) : editors[0]

  if (!editor) {
    throw new Error(input.editorID ? `Editor '${input.editorID}' is not available.` : "No supported external editors were found.")
  }

  if (editor.id === "explorer" && openPath) {
    return openPath(targetPath).then((result) => {
      if (result) {
        throw new Error(`Failed to launch ${editor.label}: ${result}`)
      }

      return {
        ok: true,
        editor,
        targetPath,
      }
    })
  }

  const launch = buildExternalEditorLaunchSpec(editor, targetPath, {
    env: dependencies.env,
    readdirSync: dependencies.readdirSync,
  })
  const child = spawnProcess(launch.command, launch.args, {
    detached: true,
    shell: launch.shell,
    stdio: "ignore",
    windowsHide: launch.windowsHide,
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
