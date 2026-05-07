import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PermissionRequestPrompt, PermissionResolveResult } from "../../shared/permission"
import { App } from "./App"
import {
  DEFAULT_RIGHT_SIDEBAR_WIDTH,
  DEFAULT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_RIGHT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  RIGHT_SIDEBAR_MIN_LEFT_EDGE_RATIO,
} from "./app/constants"
import type { LoadedFolderWorkspace, SessionRuntimeDebugSnapshot } from "./app/types"

function readBundledStyles() {
  const stylesRoot = resolve(process.cwd(), "src/renderer/src")
  const entry = readFileSync(resolve(stylesRoot, "styles/index.css"), "utf8")
  const imports = Array.from(entry.matchAll(/@import\s+"(.+?)";/g), (match) => match[1])

  return imports
    .map((relativePath) => readFileSync(resolve(stylesRoot, "styles", relativePath.replace("./", "")), "utf8"))
    .join("\n")
}

const styles = readBundledStyles()

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

function getComposerSendButton() {
  return screen.getByRole("button", { name: /^(Send|Sending|Stop) task$|^Resolve approval first$/ })
}

async function openProviderSettingsSection() {
  fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
  const settingsDialog = await screen.findByRole("dialog", { name: "Settings" })
  fireEvent.click(screen.getByRole("button", { name: "Provider" }))
  return settingsDialog
}

function setComposerDraftValue(input: HTMLElement, value: string) {
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    fireEvent.change(input, {
      target: {
        value,
      },
    })
    return
  }

  act(() => {
    input.dispatchEvent(new CustomEvent("desktop-composer-change", {
      bubbles: true,
      detail: { value },
    }))
  })
}

function expectComposerDraftValue(input: HTMLElement, value: string) {
  if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
    expect(input).toHaveValue(value)
    return
  }

  expect(input.textContent ?? "").toBe(value)
}

type DesktopAgentSession = NonNullable<NonNullable<Window["desktop"]>["agentSession"]>
type DesktopAgentSessionEventListener = Parameters<DesktopAgentSession["onEvent"]>[0]
type DesktopAgentSessionEvent = Parameters<DesktopAgentSessionEventListener>[0]

let agentSessionEventListeners: DesktopAgentSessionEventListener[] = []


function createRequestStreamEvent(input: {
  backendSessionID: string
  clientTurnID: string
  id?: string
  event: string
  data: unknown
}): DesktopAgentSessionEvent {
  return {
    kind: "stream",
    source: "request",
    backendSessionID: input.backendSessionID,
    clientTurnID: input.clientTurnID,
    id: input.id,
    event: input.event,
    data: input.data,
    receivedAt: Date.now(),
  }
}

function createSubscriptionStreamEvent(input: {
  backendSessionID: string
  uiSessionID?: string
  id?: string
  event: string
  data: unknown
}): DesktopAgentSessionEvent {
  return {
    kind: "stream",
    source: "subscription",
    backendSessionID: input.backendSessionID,
    uiSessionID: input.uiSessionID,
    id: input.id,
    event: input.event,
    data: input.data,
    receivedAt: Date.now(),
  }
}

function getCreateSessionProjectSelect() {
  return screen.getByRole("combobox", { name: "Session project" })
}

async function createSiblingPaneFromCreateTab() {
  fireEvent.click(screen.getByRole("button", { name: "Create session" }))
  await screen.findByRole("combobox", { name: "Session project" })

  const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
  const createTab = screen.getByRole("button", { name: "Switch to create session tab" })

  fireEvent.dragStart(createTab)
  fireEvent.dragEnter(within(sourcePane).getByTestId("pane-drop-right"))
  fireEvent.dragOver(within(sourcePane).getByTestId("pane-drop-right"))
  fireEvent.drop(within(sourcePane).getByTestId("pane-drop-right"))
  fireEvent.dragEnd(createTab)

  await waitFor(() => {
    expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
  })

  return Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]
}

async function createStackedPaneFromCreateTab() {
  fireEvent.click(screen.getByRole("button", { name: "Create session" }))
  await screen.findByRole("combobox", { name: "Session project" })

  const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
  const createTab = screen.getByRole("button", { name: "Switch to create session tab" })

  fireEvent.dragStart(createTab)
  fireEvent.dragEnter(within(sourcePane).getByTestId("pane-drop-bottom"))
  fireEvent.dragOver(within(sourcePane).getByTestId("pane-drop-bottom"))
  fireEvent.drop(within(sourcePane).getByTestId("pane-drop-bottom"))
  fireEvent.dragEnd(createTab)

  await waitFor(() => {
    expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
  })

  return Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]
}

type PermissionRequestPromptOverrides = Omit<Partial<PermissionRequestPrompt>, "prompt" | "resolution"> & {
  prompt?: Omit<Partial<PermissionRequestPrompt["prompt"]>, "details"> & {
    details?: Partial<NonNullable<PermissionRequestPrompt["prompt"]["details"]>>
  }
  resolution?: Partial<NonNullable<PermissionRequestPrompt["resolution"]>>
}

function createPermissionRequest(overrides: PermissionRequestPromptOverrides = {}): PermissionRequestPrompt {
  const base: PermissionRequestPrompt = {
    id: "permission-1",
    approvalID: "approval-1",
    sessionID: "session-backend",
    messageID: "message-1",
    toolCallID: "toolcall-1",
    projectID: "project-backend",
    agent: "plan",
    status: "pending",
    createdAt: 1,
    prompt: {
      title: "Read repo config",
      summary: "Read README.md",
      rationale: "The agent needs your approval before it can continue this tool call.",
      risk: "medium",
      detailsAvailable: true,
      details: {
        paths: ["README.md"],
        workdir: "C:\\Projects\\fanfande_studio",
      },
      allowedDecisions: ["deny", "allow"],
      recommendedDecision: "allow",
    },
  }

  const prompt = Object.prototype.hasOwnProperty.call(overrides, "prompt")
    ? {
        title: overrides.prompt?.title ?? base.prompt.title,
        summary: overrides.prompt?.summary ?? base.prompt.summary,
        rationale: overrides.prompt?.rationale ?? base.prompt.rationale,
        risk: overrides.prompt?.risk ?? base.prompt.risk,
        detailsAvailable: overrides.prompt?.detailsAvailable ?? base.prompt.detailsAvailable,
        details: Object.prototype.hasOwnProperty.call(overrides.prompt ?? {}, "details")
          ? overrides.prompt?.details
            ? {
                ...(base.prompt.details ?? {}),
                ...overrides.prompt.details,
              }
            : overrides.prompt?.details
          : base.prompt.details,
        allowedDecisions: overrides.prompt?.allowedDecisions ?? base.prompt.allowedDecisions,
        recommendedDecision: overrides.prompt?.recommendedDecision ?? base.prompt.recommendedDecision,
      }
    : base.prompt

  const resolution = Object.prototype.hasOwnProperty.call(overrides, "resolution")
    ? overrides.resolution
      ? {
          decision: overrides.resolution.decision ?? "allow",
          note: overrides.resolution.note,
          approved: overrides.resolution.approved ?? true,
          resolvedAt: overrides.resolution.resolvedAt ?? 120,
        }
      : overrides.resolution
    : base.resolution

  return {
    ...base,
    ...overrides,
    prompt,
    resolution,
  }
}

function createPermissionResolveResult(overrides: PermissionRequestPromptOverrides = {}): PermissionResolveResult {
  return {
    request: createPermissionRequest({
      ...overrides,
      status: overrides.status ?? "approved",
      resolution: overrides.resolution ?? {
        decision: "allow",
        approved: true,
        resolvedAt: 120,
      },
    }),
  }
}

function createSessionRuntimeDebugSnapshot(): SessionRuntimeDebugSnapshot {
  return {
    generatedAt: 1,
    logging: {},
    session: {
      id: "session-chat-1",
      directory: "C:\\Projects\\Project 2",
      title: "Chat 1",
      created: 1,
      updated: 1,
      missing: false,
    },
    status: {
      type: "busy",
      phase: "executing_tool",
    },
    running: {
      sessionID: "session-chat-1",
      startedAt: 1,
      activeForMs: 4200,
      reason: "streaming",
    },
    activeTurnID: "turn-1",
    latestTurn: {
      turnID: "turn-1",
      startedAt: 1,
      lastEventAt: 4200,
      durationMs: 4200,
      status: "running",
      phase: "executing_tool",
      phaseUpdatedAt: 4000,
      agent: "plan",
      model: "openai/gpt-5.4",
      resume: false,
      llmCalls: [
        {
          id: "llm-1",
          messageID: "msg-1",
          providerID: "openai",
          modelID: "gpt-5.4",
          status: "completed",
          startedAt: 1,
          endedAt: 1200,
          durationMs: 1199,
          messageCount: 3,
          finishReason: "tool-calls",
        },
      ],
      tools: [
        {
          callID: "tool-1",
          tool: "shell",
          title: "Inspect repo",
          status: "running",
          startedAt: 1300,
          durationMs: 2900,
          inputPreview: "Get-ChildItem",
        },
      ],
      error: null,
      errorContext: null,
      message: null,
      recentEvents: [
        {
          eventID: "evt-1",
          type: "llm.call.completed",
          sessionID: "session-chat-1",
          turnID: "turn-1",
          seq: 1,
          timestamp: 1200,
          cursor: "1:1200",
          title: "LLM request completed",
          detail: "openai/gpt-5.4",
          tone: "success",
        },
        {
          eventID: "evt-2",
          type: "tool.call.started",
          sessionID: "session-chat-1",
          turnID: "turn-1",
          seq: 2,
          timestamp: 1300,
          cursor: "2:1300",
          title: "Tool started: shell",
          detail: "Inspect repo",
          tone: "info",
        },
      ],
    },
    turns: [],
    recentEvents: [
      {
        eventID: "evt-1",
        type: "llm.call.completed",
        sessionID: "session-chat-1",
        turnID: "turn-1",
        seq: 1,
        timestamp: 1200,
        cursor: "1:1200",
        title: "LLM request completed",
        detail: "openai/gpt-5.4",
        tone: "success",
      },
      {
        eventID: "evt-2",
        type: "tool.call.started",
        sessionID: "session-chat-1",
        turnID: "turn-1",
        seq: 2,
        timestamp: 1300,
        cursor: "2:1300",
        title: "Tool started: shell",
        detail: "Inspect repo",
        tone: "info",
      },
    ],
    diagnostics: {
      blockedOnApproval: false,
      activeToolCount: 1,
      failedToolCount: 0,
      llmFailureCount: 0,
    },
  }
}

const FRONTEND_WORKSPACE_DIRECTORY = "C:\\Projects\\Atlas\\frontend"
const BACKEND_WORKSPACE_DIRECTORY = "C:\\Projects\\Atlas\\backend"
const WORKSPACE_FILE_PATH = "src/focus-files.tsx"
const WORKSPACE_FILE_CONTENT = [
  "export const focusValue = 1",
  "const nextValue = focusValue + 1",
  "export const summary = nextValue",
].join("\n")

type PromptPresetFixture = {
  id: string
  label: string
  description: string
  source: "bundled" | "custom"
  hasOverride: boolean
  editable: boolean
  sourcePath?: string
}

const PROMPT_PRESET_FIXTURES: PromptPresetFixture[] = [
  {
    id: "system-default",
    label: "System Prompt",
    description: "Base instructions applied to every session turn.",
    source: "bundled" as const,
    hasOverride: false,
    editable: true,
    sourcePath: "src/session/prompt/default.txt",
  },
  {
    id: "plan-mode",
    label: "Plan Mode Prompt",
    description: "Additional instructions appended when the plan agent is active.",
    source: "bundled" as const,
    hasOverride: false,
    editable: true,
    sourcePath: "src/session/prompt/plan.txt",
  },
  {
    id: "side-chat",
    label: "Side Chat Prompt",
    description: "Additional instructions appended when a side chat session is active.",
    source: "bundled" as const,
    hasOverride: false,
    editable: true,
    sourcePath: "src/session/prompt/side-chat.txt",
  },
  {
    id: "provider-gpt",
    label: "GPT Provider Prompt",
    description: "Reserved provider-specific prompt for GPT-family models.",
    source: "bundled" as const,
    hasOverride: false,
    editable: true,
    sourcePath: "src/session/prompt/gpt.txt",
  },
]

const PROMPT_PRESET_SELECTION_FIXTURE = {
  systemPromptPresetID: "system-default",
  planModePromptPresetID: "plan-mode",
  sideChatPromptPresetID: "side-chat",
}

function createPromptPresetSummary(
  presetID: string,
  overrides: Partial<PromptPresetFixture> = {},
) {
  const preset = PROMPT_PRESET_FIXTURES.find((item) => item.id === presetID)
  if (preset) {
    return {
      ...preset,
      ...overrides,
    }
  }

  return {
    id: presetID,
    label: "Untitled preset",
    description: "Custom prompt preset.",
    source: "custom" as const,
    hasOverride: false,
    editable: true,
    sourcePath: undefined,
    ...overrides,
  }
}

function createPromptPresetDocument(
  presetID: string,
  overrides: Partial<PromptPresetFixture> & { content?: string } = {},
) {
  const preset = createPromptPresetSummary(presetID, overrides)

  const defaultContent =
    presetID === "system-default"
      ? "You are Anybox, an interactive tool that helps users with software engineering tasks."
      : presetID === "plan-mode"
        ? "<system-reminder>\n# Plan Mode - System Reminder"
        : presetID === "side-chat"
          ? "This session is a side chat anchored to a single assistant reply from another session."
        : preset.source === "custom"
          ? ""
        : "GPT provider prompt placeholder. This preset is currently inactive."

  return {
    ...preset,
    ...overrides,
    content: overrides.content ?? defaultContent,
  }
}

function createWorkspaceFileReviewWorkspaces(): LoadedFolderWorkspace[] {
  return [
    {
      id: FRONTEND_WORKSPACE_DIRECTORY,
      directory: FRONTEND_WORKSPACE_DIRECTORY,
      name: "frontend",
      created: 1,
      updated: 30,
      project: {
        id: "project-atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-frontend-review",
          projectID: "project-atlas",
          directory: FRONTEND_WORKSPACE_DIRECTORY,
          title: "Frontend review",
          created: 1,
          updated: 30,
        },
      ],
    },
    {
      id: BACKEND_WORKSPACE_DIRECTORY,
      directory: BACKEND_WORKSPACE_DIRECTORY,
      name: "backend",
      created: 2,
      updated: 20,
      project: {
        id: "project-atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-backend-review",
          projectID: "project-atlas",
          directory: BACKEND_WORKSPACE_DIRECTORY,
          title: "Backend review",
          created: 2,
          updated: 20,
        },
      ],
    },
  ]
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear()
    agentSessionEventListeners = []
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
    window.desktop = {
      platform: "win32",
      versions: {
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      } as NodeJS.ProcessVersions,
      getInfo: vi.fn().mockResolvedValue({
        platform: "win32",
        node: "22.0.0",
        chrome: "130.0.0",
        electron: "39.0.0",
      }),
      getWindowState: vi.fn().mockResolvedValue({
        isMaximized: false,
      }),
      getAppearanceConfig: vi.fn().mockResolvedValue({
        path: "C:\\Users\\tester\\AppData\\Roaming\\fanfande-desktop-agent\\appearance-theme.json",
        exists: true,
        document: {
          version: 1,
          brandTheme: "terra",
          colorMode: "system",
          overrides: {},
          resolvedTokens: {},
          updatedAt: 1,
        },
      }),
      saveAppearanceConfig: vi.fn().mockImplementation(async ({ document }: { document: Record<string, unknown> }) => ({
        path: "C:\\Users\\tester\\AppData\\Roaming\\fanfande-desktop-agent\\appearance-theme.json",
        exists: true,
        document: {
          ...document,
          updatedAt: typeof document.updatedAt === "number" ? document.updatedAt : 1,
        },
      })),
      getAgentConfig: vi.fn().mockResolvedValue({
        baseURL: "http://127.0.0.1:4096",
        defaultDirectory: "C:\\Projects\\fanfande_studio",
      }),
      getToolPermissionMode: vi.fn().mockResolvedValue({
        mode: "default",
      }),
      updateToolPermissionMode: vi.fn().mockResolvedValue({
        mode: "full_access",
      }),
      getAgentHealth: vi.fn().mockResolvedValue({
        ok: false,
        baseURL: "http://127.0.0.1:4096",
      }),
      createPtySession: vi.fn().mockResolvedValue({
        id: "pty-1",
        sessionID: "session-chat-1",
        title: "Terminal 1",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 1,
        updatedAt: 1,
        cursor: 0,
      }),
      getPtySession: vi.fn().mockResolvedValue({
        id: "pty-1",
        sessionID: "session-chat-1",
        title: "Terminal 1",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 1,
        updatedAt: 1,
        cursor: 0,
      }),
      updatePtySession: vi.fn().mockResolvedValue(undefined),
      deletePtySession: vi.fn().mockResolvedValue(undefined),
      attachPtySession: vi.fn().mockResolvedValue({
        id: "pty-1",
        sessionID: "session-chat-1",
        title: "Terminal 1",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 1,
        updatedAt: 1,
        cursor: 0,
      }),
      detachPtySession: vi.fn().mockResolvedValue(true),
      writePtyInput: vi.fn().mockResolvedValue(undefined),
      pickProjectDirectory: vi.fn().mockResolvedValue(null),
      pickComposerAttachments: vi.fn().mockResolvedValue([]),
      capturePreviewScreenshot: vi.fn().mockResolvedValue({
        path: "C:\\Users\\codex\\preview-comment-screenshots\\marker.png",
      }),
      detectLocalPreviewServices: vi.fn().mockResolvedValue([]),
      gitGetCapabilities: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        root: "C:\\Projects\\Project 2",
        branch: "main",
        defaultBranch: "main",
        isGitRepo: true,
        canCommit: {
          enabled: true,
        },
        canStageAllCommit: {
          enabled: true,
        },
        canPush: {
          enabled: true,
        },
        canCreatePullRequest: {
          enabled: false,
          reason: "Switch to a feature branch before creating a pull request.",
        },
        canCreateBranch: {
          enabled: true,
        },
      }),
      gitCommit: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        root: "C:\\Projects\\Project 2",
        branch: "main",
        stdout: "",
        stderr: "",
        summary: "已提交到 main",
      }),
      gitPush: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        root: "C:\\Projects\\Project 2",
        branch: "main",
        stdout: "",
        stderr: "",
        summary: "已推送 main",
      }),
      listFolderWorkspaces: undefined as unknown as NonNullable<Window["desktop"]>["listFolderWorkspaces"],
      openFolderWorkspace: vi.fn(),
      createFolderSession: vi.fn(),
      deleteProjectWorkspace: vi.fn(),
      deleteAgentSession: vi.fn(),
      archiveAgentSession: vi.fn().mockResolvedValue({
        sessionID: "session-chat-1",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2",
        archivedAt: 1,
      }),
      listArchivedSessions: vi.fn().mockResolvedValue([]),
      restoreArchivedSession: vi.fn().mockResolvedValue({
        session: {
          id: "session-archived-1",
          projectID: "project-2",
          directory: "C:\\Projects\\Project 2",
          title: "Archived session",
          created: 1,
          updated: 1,
        },
      }),
      deleteArchivedSession: vi.fn().mockResolvedValue({
        sessionID: "session-archived-1",
      }),
      getSessionDiff: vi.fn().mockResolvedValue({
        diffs: [],
      }),
      restoreWorkspaceDiffFile: vi.fn().mockResolvedValue({
        directory: "C:\\Projects\\Project 2",
        file: "src/App.tsx",
      }),
      getSessionRuntimeDebug: vi.fn().mockResolvedValue(createSessionRuntimeDebugSnapshot()),
      getGlobalSkills: vi.fn().mockResolvedValue([]),
      getProjectSkills: vi.fn().mockResolvedValue([]),
      getProjectSkillSelection: vi.fn().mockResolvedValue({
        skillIDs: [],
      }),
      getGlobalSkillsTree: vi.fn().mockResolvedValue({
        root: "C:\\Users\\19128\\.anybox\\skills",
        items: [],
      }),
      readGlobalSkillFile: vi.fn(),
      searchWorkspaceFiles: vi.fn().mockResolvedValue([]),
      readWorkspaceFile: vi.fn().mockResolvedValue({
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
        kind: "text",
        content: WORKSPACE_FILE_CONTENT,
      }),
      updateGlobalSkillFile: vi.fn(),
      createGlobalSkill: vi.fn(),
      previewGlobalSkillGitInstall: vi.fn(),
      installGlobalSkillsFromGit: vi.fn(),
      installGlobalSkillFromLocalFile: vi.fn(),
      renameGlobalSkill: vi.fn(),
      deleteGlobalSkill: vi.fn(),
      createGlobalSkillFolder: vi.fn(),
      renameGlobalSkillFolder: vi.fn(),
      deleteGlobalSkillFolder: vi.fn(),
      moveGlobalSkillDirectory: vi.fn(),
      getGlobalProviderCatalog: vi.fn().mockResolvedValue([]),
      refreshGlobalProviderCatalog: vi.fn().mockResolvedValue([]),
      testGlobalProviderConnection: vi.fn().mockResolvedValue({
        providerID: "deepseek",
        ok: true,
        status: "working",
        checkedAt: 1,
        message: "连接测试成功。",
      }),
      getGlobalModels: vi.fn().mockResolvedValue({
        items: [],
        selection: {},
      }),
      getBuiltinTools: vi.fn().mockResolvedValue({
        items: [],
        selection: { tools: {} },
      }),
      updateBuiltinToolSelection: vi.fn().mockImplementation((selection) => Promise.resolve(selection)),
      getGlobalMcpServers: vi.fn().mockResolvedValue([]),
      getGlobalMcpServerDiagnostic: vi.fn().mockResolvedValue({
        serverID: "mock",
        enabled: true,
        ok: true,
        toolCount: 0,
        toolNames: [],
      }),
      getPromptPresets: vi.fn().mockResolvedValue(PROMPT_PRESET_FIXTURES),
      getPromptPresetSelection: vi.fn().mockResolvedValue(PROMPT_PRESET_SELECTION_FIXTURE),
      readPromptPreset: vi.fn().mockImplementation(({ presetID }: { presetID: string }) =>
        Promise.resolve(createPromptPresetDocument(presetID)),
      ),
      createPromptPreset: vi.fn().mockResolvedValue(
        createPromptPresetDocument("custom-untitled-preset", {
          label: "Untitled preset",
          source: "custom",
        }),
      ),
      previewPromptUrlInstall: vi.fn(),
      installPromptsFromUrl: vi.fn(),
      updatePromptPreset: vi.fn().mockImplementation(
        ({ presetID, label, content }: { presetID: string; label?: string; content: string }) =>
          Promise.resolve(createPromptPresetDocument(presetID, {
            label: label ?? createPromptPresetSummary(presetID).label,
            content,
            hasOverride: presetID.startsWith("custom-") ? false : true,
            source: presetID.startsWith("custom-") ? "custom" : "bundled",
          })),
      ),
      updatePromptPresetSelection: vi.fn().mockImplementation(
        (input: typeof PROMPT_PRESET_SELECTION_FIXTURE) => Promise.resolve(input),
      ),
      resetPromptPreset: vi.fn().mockImplementation(({ presetID }: { presetID: string }) =>
        Promise.resolve(createPromptPresetDocument(presetID, {
          hasOverride: false,
        })),
      ),
      deletePromptPreset: vi.fn().mockResolvedValue(PROMPT_PRESET_SELECTION_FIXTURE),
      getProjectProviderCatalog: vi.fn().mockResolvedValue([]),
      refreshProjectProviderCatalog: vi.fn().mockResolvedValue([]),
      getProjectModels: vi.fn().mockResolvedValue({
        items: [],
        selection: {},
      }),
      getProjectMcpSelection: vi.fn().mockResolvedValue({
        serverIDs: [],
      }),
      updateGlobalProvider: vi.fn().mockResolvedValue({
        provider: {
          id: "deepseek",
          name: "DeepSeek",
          available: true,
          apiKeyConfigured: true,
        },
        selection: {},
      }),
      deleteGlobalProvider: vi.fn().mockResolvedValue({
        providerID: "deepseek",
        selection: {},
      }),
      updateGlobalModelSelection: vi.fn().mockResolvedValue({
        model: "deepseek/deepseek-reasoner",
      }),
      updateGlobalMcpServer: vi.fn().mockResolvedValue({
        id: "filesystem",
        transport: "stdio",
        command: "npx",
        enabled: true,
      }),
      deleteGlobalMcpServer: vi.fn().mockResolvedValue({
        serverID: "filesystem",
        removed: true,
      }),
      updateProjectModelSelection: vi.fn().mockResolvedValue({}),
      updateProjectSkillSelection: vi.fn().mockResolvedValue({
        skillIDs: [],
      }),
      updateProjectMcpSelection: vi.fn().mockResolvedValue({
        serverIDs: [],
      }),
      createAgentSession: vi.fn().mockResolvedValue({
        session: {
          id: "session-backend",
          projectID: "project-backend",
          directory: "C:\\Projects\\fanfande_studio",
          title: "Backend session",
          created: 1,
          updated: 1,
        },
      }),
      createSideChat: vi.fn().mockResolvedValue({
        session: {
          id: "session-side-chat-1",
          projectID: "project-2",
          directory: "C:\\Projects\\Project 2",
          title: "Chat 1 / Side chat",
          kind: "side-chat",
          origin: {
            parentSessionID: "session-chat-1",
            anchorMessageID: "chat-agent-message-1",
            anchorPreview: "Anchored reply snapshot",
          },
          created: 1,
          updated: 1,
        },
      }),
      agentSession: {
        loadHistory: vi.fn().mockResolvedValue([]),
        sendTurn: vi.fn().mockImplementation(async (input: { clientTurnID: string }) => ({
          clientTurnID: input.clientTurnID,
        })),
        resumeTurn: vi.fn().mockImplementation(async (input: { clientTurnID: string }) => ({
          clientTurnID: input.clientTurnID,
        })),
        cancelTurn: vi.fn().mockImplementation(async (input: { backendSessionID: string; clientTurnID: string }) => ({
          ...input,
          localRequestAborted: false,
          backendCancelled: false,
        })),
        answerQuestion: vi.fn().mockImplementation(async (input: {
          backendSessionID: string
          questionID: string
          selectedOptions?: string[]
          freeformText?: string
        }) => ({
          sessionID: input.backendSessionID,
          questionID: input.questionID,
          selectedOptions: input.selectedOptions,
          freeformText: input.freeformText,
          answerText: input.freeformText ?? input.selectedOptions?.join(", ") ?? "",
          answeredAt: Date.now(),
        })),
        subscribe: vi.fn().mockResolvedValue({
          backendSessionID: "session-default",
        }),
        unsubscribe: vi.fn().mockResolvedValue({
          backendSessionID: "session-default",
          removed: true,
        }),
        loadPermissionRequests: vi.fn().mockResolvedValue([]),
        respondPermissionRequest: vi.fn().mockResolvedValue(createPermissionResolveResult()),
        onEvent: vi.fn((listener: DesktopAgentSessionEventListener) => {
          agentSessionEventListeners.push(listener)
          return vi.fn(() => {
            agentSessionEventListeners = agentSessionEventListeners.filter((item) => item !== listener)
          })
        }),
      },
      showMenu: vi.fn().mockResolvedValue(undefined),
      showExternalEditorMenu: vi.fn().mockResolvedValue(undefined),
      listExternalEditorsForTarget: vi.fn().mockResolvedValue([
        {
          id: "vscode",
          label: "VS Code",
          executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
          iconDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8l7kQAAAAASUVORK5CYII=",
        },
        {
          id: "explorer",
          label: "File Explorer",
          executablePath: "C:\\Windows\\explorer.exe",
          iconDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO8l7kQAAAAASUVORK5CYII=",
        },
      ]),
      openInExternalEditor: vi.fn().mockResolvedValue({
        ok: true,
        editor: {
          id: "vscode",
          label: "VS Code",
          executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
        },
        targetPath: "C:\\Projects\\Project 2\\app",
      }),
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "http://localhost:3000/",
      }),
      windowAction: vi.fn().mockResolvedValue(undefined),
      onPtyEvent: vi.fn(() => vi.fn()),
      onWindowStateChange: vi.fn(() => vi.fn()),
    }
    window.desktop.gitCommit = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Project 2",
      root: "C:\\Projects\\Project 2",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Committed to main.",
    })
    window.desktop.gitPush = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Project 2",
      root: "C:\\Projects\\Project 2",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Pushed main.",
    })
    window.desktop.gitCreateBranch = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Project 2",
      root: "C:\\Projects\\Project 2",
      branch: "feature/test",
      stdout: "",
      stderr: "",
      summary: "Created and switched to feature/test.",
    })
    window.desktop.gitListBranches = vi.fn().mockResolvedValue([
      {
        name: "main",
        kind: "local",
        current: true,
      },
      {
        name: "feature/test",
        kind: "local",
        current: false,
      },
    ])
    window.desktop.gitCheckoutBranch = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Project 2",
      root: "C:\\Projects\\Project 2",
      branch: "feature/test",
      stdout: "",
      stderr: "",
      summary: "Switched to feature/test.",
    })
    window.desktop.gitCreatePullRequest = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Project 2",
      root: "C:\\Projects\\Project 2",
      branch: "feature/test",
      stdout: "https://github.com/example/repo/pull/1",
      stderr: "",
      summary: "Created pull request https://github.com/example/repo/pull/1.",
      url: "https://github.com/example/repo/pull/1",
    })
  })

  it("renders the desktop shell with window controls in the right sidebar menu", async () => {
    const { container } = render(<App />)
    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    const topMenu = screen.getByLabelText("Session canvas top menu")
    const leftSidebarTopMenu = screen.getByLabelText("Left sidebar top menu")
    const rightSidebarTopMenu = screen.getByLabelText("Right sidebar top menu")

    const minimizeWindowButton = screen.getByRole("button", { name: "Minimize window" })
    expect(minimizeWindowButton).toBeInTheDocument()
    expect(minimizeWindowButton.closest(".window-controls")).not.toBeNull()
    expect(minimizeWindowButton.closest(".right-sidebar-top-menu")).toBe(rightSidebarTopMenu)
    expect(container.querySelector(".pane-tab-bar.window-drag-region")).not.toBeNull()
    expect(container.querySelector(".session-canvas-top-menu.window-drag-region")).toBeNull()
    expect(leftSidebarTopMenu).toHaveClass("shell-top-menu")
    expect(topMenu).toHaveClass("shell-top-menu")
    expect(rightSidebarTopMenu).toHaveClass("shell-top-menu")
    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar-trailing")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "\u79FB\u9664 app" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create session for app" })).toBeInTheDocument()
    expect(screen.getAllByText("Project 2").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toBeInTheDocument()
    const addSessionTabButton = screen.getByRole("button", { name: "Add session tab" })
    expect(addSessionTabButton).toHaveTextContent("+")
    expect(addSessionTabButton.closest(".pane-tab-bar-tabs")).not.toBeNull()
    expect(addSessionTabButton.closest(".pane-tab-bar-tabs")?.lastElementChild).toBe(addSessionTabButton)
    expect(screen.queryByRole("button", { name: "Split pane" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" }).closest(".pane-tab-bar")).toHaveClass("window-drag-region")
    expect(await screen.findByRole("button", { name: "Git" })).toBeInTheDocument()
    expect(within(leftSidebarTopMenu).getByRole("group", { name: "Workspace mode" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Artifacts" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Changes" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Runtime" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Files" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Console" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Deploy" })).not.toBeInTheDocument()
    expect(inspector).toBeInTheDocument()
    expect(within(topMenu).getByRole("group", { name: "Open current project" })).toBeInTheDocument()
    expect(within(inspector).queryByText("Workspace diff")).not.toBeInTheDocument()
    expect(await within(inspector).findByText("No changes in this session.")).toBeInTheDocument()
    expect(inspector.querySelector(".right-sidebar-view-host")).toHaveClass("is-changes")
    expect(window.desktop?.getSessionRuntimeDebug).not.toHaveBeenCalled()
    expect(within(inspector).queryByText("Active Session")).not.toBeInTheDocument()
    expect(within(inspector).queryByText("Workspace")).not.toBeInTheDocument()
    expect(within(inspector).queryByText("Current execution state")).not.toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelector(".canvas-header")).not.toBeInTheDocument()
      expect(container.querySelector(".signal-row")).not.toBeInTheDocument()
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).closest("footer")).toHaveClass("prompt-input-shell")
    expect(screen.getByRole("button", { name: "Add attachments" })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^Select model:/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Agent mode:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear draft" })).not.toBeInTheDocument()
  })

  it("reverts the global tool permission mode and shows the save error when saving fails", async () => {
    window.desktop!.updateToolPermissionMode = vi.fn().mockRejectedValue(new Error("Could not save mode"))

    render(<App />)

    const trigger = await screen.findByRole("button", { name: "工具权限：默认权限" })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole("button", { name: /完全访问权限/ }))

    await waitFor(() => {
      expect(window.desktop!.updateToolPermissionMode).toHaveBeenCalledWith({
        mode: "full_access",
      })
    })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "工具权限：默认权限" })).toHaveAttribute(
        "title",
        expect.stringContaining("Could not save mode"),
      )
    })
  })

  it("switches Chat and Cowork placeholders without rendering code workspace surfaces", async () => {
    render(<App />)

    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("Session canvas top menu")).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Changes" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Toggle terminal panel" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Chat" }))

    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { name: "Chat workspace" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Chat mode sidebar" })).toBeInTheDocument()
    expect(screen.queryByLabelText("Session canvas top menu")).not.toBeInTheDocument()
    expect(screen.queryByRole("complementary", { name: "Inspector sidebar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Changes" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Toggle terminal panel" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Cowork" }))

    expect(screen.getByRole("button", { name: "Cowork" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { name: "Cowork workspace" })).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Cowork mode sidebar" })).toBeInTheDocument()
    expect(screen.queryByRole("complementary", { name: "Inspector sidebar" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Code" }))

    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByLabelText("Session canvas top menu")).toBeInTheDocument()
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
  })

  it("shows the runtime inspector when the runtime tab is selected", async () => {
    window.localStorage.setItem("desktop.agentDebugTrace", "true")
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "workspace-runtime",
        directory: "C:\\Projects\\Project 2\\app",
        name: "app",
        created: 1,
        updated: 1,
        project: {
          id: "project-2",
          name: "Project 2",
          worktree: "C:\\Projects\\Project 2",
        },
        sessions: [
          {
            id: "session-chat-1",
            projectID: "project-2",
            directory: "C:\\Projects\\Project 2\\app",
            title: "Chat 1",
            created: 1,
            updated: 1,
          },
        ],
      },
    ])
    render(<App />)
    expect(await screen.findByRole("button", { name: "Runtime" })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop?.getSessionRuntimeDebug).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole("button", { name: "Runtime" }))

    expect(await screen.findByText("Agent Runtime")).toBeInTheDocument()
    expect(screen.getByText("Current execution state")).toBeInTheDocument()
    expect(screen.getByText("Busy")).toBeInTheDocument()
    expect(screen.getAllByText("Running Tool").length).toBeGreaterThan(0)
    expect(screen.getByText("Latest tool calls")).toBeInTheDocument()
    expect(screen.getAllByText("Inspect repo").length).toBeGreaterThan(0)
    expect(screen.getByText("Execution timeline")).toBeInTheDocument()
    expect(screen.getByText("LLM request completed")).toBeInTheDocument()
    expect(window.desktop?.getSessionRuntimeDebug).toHaveBeenCalled()
  })

  it("opens side chat inline under the assistant response without replacing the current session tab", async () => {
    render(<App />)

    const threadSideChatButton = await screen.findByRole("button", { name: "Open side chat" })
    const currentSessionTab = screen.getByRole("button", { name: "Switch to session Chat 1" })

    expect(currentSessionTab).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(threadSideChatButton)

    await waitFor(() => {
      expect(window.desktop?.createSideChat).toHaveBeenCalledWith({
        parentSessionID: "session-chat-1",
        anchorMessageID: "chat-agent-message-1",
      })
    })

    const nestedSideChat = await screen.findByRole("region", { name: "Nested side chat" })

    expect(currentSessionTab).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to session Chat 1 / Side chat" })).not.toBeInTheDocument()
    expect(within(nestedSideChat).getByText("Side chat")).toBeInTheDocument()
    expect(within(nestedSideChat).queryByText("Anchored reply snapshot")).not.toBeInTheDocument()
    expect(within(nestedSideChat).queryByText("Scoped")).not.toBeInTheDocument()
    expect(
      within(nestedSideChat).queryByText("Focused on this reply only. Messages here stay outside the main thread context."),
    ).not.toBeInTheDocument()
    expect(within(nestedSideChat).getByRole("button", { name: "Hide side chat" })).toBeInTheDocument()
    expect(within(nestedSideChat).getByText("Ask a follow-up about this reply.")).toBeInTheDocument()
    expect(screen.getAllByRole("textbox", { name: "Task draft" }).length).toBeGreaterThan(1)
  })

  it("keeps the response action row persistent after hiding an existing side chat", async () => {
    render(<App />)

    const threadSideChatButton = await screen.findByRole("button", { name: "Open side chat" })
    const assistantTurn = threadSideChatButton.closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    fireEvent.click(threadSideChatButton)

    const nestedSideChat = await screen.findByRole("region", { name: "Nested side chat" })
    fireEvent.click(within(nestedSideChat).getByRole("button", { name: "Hide side chat" }))

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Nested side chat" })).not.toBeInTheDocument()
    })

    const responseActionRow = (assistantTurn as HTMLElement).querySelector(".assistant-response-side-chat") as HTMLElement | null

    expect(responseActionRow).not.toBeNull()
    expect(responseActionRow).toHaveClass("is-persistent")
    expect(within(responseActionRow as HTMLElement).getByRole("button", { name: "Open side chat (1)" })).toHaveAttribute(
      "title",
      "1 side chat thread",
    )
  })

  it("copies the response content from the response action row", async () => {
    render(<App />)

    const responseText =
      "I am collapsing the information-heavy workspace cards into a project tree so the rail behaves like navigation, not like a second content surface."
    const assistantTurn = (await screen.findByText(responseText)).closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    fireEvent.click(within(assistantTurn as HTMLElement).getByRole("button", { name: "Copy assistant response" }))

    await waitFor(() => {
      expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(responseText)
    })

    expect(within(assistantTurn as HTMLElement).getByRole("button", { name: "Copied assistant response" })).toBeInTheDocument()
  })

  it("renders full assistant sections inside inline side chat", async () => {
    window.desktop!.agentSession!.loadHistory = vi.fn().mockImplementation(async ({ backendSessionID: sessionID }: { backendSessionID: string }) => {
      if (sessionID !== "session-side-chat-1") return []

      return [
        {
          info: {
            id: "msg-user-side-1",
            sessionID,
            role: "user",
            created: 200,
          },
          parts: [{ id: "part-user-side-1", type: "text", text: "Follow up on the failing config step" }],
        },
        {
          info: {
            id: "msg-assistant-side-1",
            sessionID,
            role: "assistant",
            created: 201,
            completed: 202,
          },
          parts: [
            { id: "side-reasoning-1", type: "reasoning", text: "Inspecting the failing config step." },
            {
              id: "side-tool-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "completed",
                output: "config loaded",
              },
            },
            {
              id: "side-patch-1",
              type: "patch",
              summary: {
                files: 1,
                additions: 2,
                deletions: 0,
              },
              changes: [
                {
                  file: "src/config.ts",
                  additions: 2,
                  deletions: 0,
                },
              ],
            },
            { id: "side-text-1", type: "text", text: "I found the root cause in the config parser." },
          ],
        },
      ]
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Open side chat" }))

    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenCalledWith({
        backendSessionID: "session-side-chat-1",
      })
    })

    const nestedSideChat = await screen.findByRole("region", { name: "Nested side chat" })
    expect(await within(nestedSideChat).findByText("I found the root cause in the config parser.")).toBeInTheDocument()

    expect(within(nestedSideChat).queryByText("Scoped")).not.toBeInTheDocument()
    expect(
      within(nestedSideChat).queryByText("Focused on this reply only. Messages here stay outside the main thread context."),
    ).not.toBeInTheDocument()
    expect(within(nestedSideChat).getByRole("button", { name: "Hide side chat" })).toBeInTheDocument()
    expect(within(nestedSideChat).getByRole("region", { name: "Reasoning" })).toBeInTheDocument()
    expect(within(nestedSideChat).getByRole("button", { name: /read-file/i })).toBeInTheDocument()
    expect(within(nestedSideChat).getByRole("region", { name: "File Changes" })).toBeInTheDocument()
  })

  it("clears the inline side chat draft after sending a prompt", async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Open side chat" }))

    const nestedSideChat = await screen.findByRole("region", { name: "Nested side chat" })
    const sideChatDraft = within(nestedSideChat).getByRole("textbox", { name: "Task draft" })

    setComposerDraftValue(sideChatDraft, "Drill into the parser failure from this reply")
    fireEvent.click(within(nestedSideChat).getByRole("button", { name: "Send task" }))

    await waitFor(() => {
      expect(within(nestedSideChat).getAllByText("Drill into the parser failure from this reply").length).toBeGreaterThan(0)
      expectComposerDraftValue(within(nestedSideChat).getByRole("textbox", { name: "Task draft" }), "")
    })
  })

  it("opens a local preview and inserts saved comments as composer tags", async () => {
    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    fireEvent.click(within(inspector).getByRole("button", { name: "Preview" }))

    const previewUrlInput = within(inspector).getByRole("textbox", { name: "Preview URL" })
    fireEvent.change(previewUrlInput, {
      target: { value: "localhost:3000" },
    })
    fireEvent.submit(previewUrlInput.closest("form")!)

    expect(await within(inspector).findByTitle("Preview of http://localhost:3000/")).toBeInTheDocument()

    fireEvent.click(within(inspector).getByRole("button", { name: "Comment" }))

    const overlay = within(inspector).getByTestId("preview-comment-overlay")
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 300,
        height: 300,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    const iframe = within(inspector).getByTitle("Preview of http://localhost:3000/") as HTMLIFrameElement
    Object.defineProperty(iframe, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 300,
        height: 300,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    const hoverElement = document.createElement("p")
    hoverElement.textContent = "Hero copy"
    Object.defineProperty(hoverElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 54,
        height: 24,
        left: 20,
        right: 220,
        top: 30,
        width: 200,
        x: 20,
        y: 30,
        toJSON: () => ({}),
      }),
    })
    const frameDocument = {
      elementFromPoint: vi.fn(() => hoverElement),
    }
    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: frameDocument,
    })
    fireEvent.mouseMove(overlay, { clientX: 40, clientY: 48 })

    expect(within(inspector).getByText("p")).toBeInTheDocument()
    expect(within(inspector).getByText("200x24")).toBeInTheDocument()
    const hoverTooltip = inspector.querySelector(".preview-hover-tooltip") as HTMLElement | null
    expect(hoverTooltip?.style.getPropertyValue("--preview-hover-tooltip-left")).toBe("52px")
    expect(hoverTooltip?.style.getPropertyValue("--preview-hover-tooltip-top")).toBe("60px")

    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get: () => {
        throw new DOMException("Blocked cross-origin frame access", "SecurityError")
      },
    })
    fireEvent.mouseMove(overlay, { clientX: 100, clientY: 90 })
    expect(within(inspector).getByText("point")).toBeInTheDocument()
    expect(within(inspector).getByText("25%, 30%")).toBeInTheDocument()

    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      value: frameDocument,
    })

    fireEvent.click(overlay, { clientX: 200, clientY: 150 })

    fireEvent.change(within(inspector).getByRole("textbox", { name: "Preview comment" }), {
      target: { value: "Tighten hero spacing" },
    })
    fireEvent.click(within(inspector).getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Task draft" }).textContent).toContain("@preview:localhost:3000#1")
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).textContent).not.toContain("Tighten hero spacing")
    expect(window.desktop!.capturePreviewScreenshot).toHaveBeenCalledWith({
      bounds: {
        height: 300,
        width: 400,
        x: 0,
        y: 0,
      },
      url: "http://localhost:3000/",
    })
    expect(within(inspector).queryByRole("button", { name: "Use in chat" })).not.toBeInTheDocument()
    expect(within(inspector).queryByText("Review notes")).not.toBeInTheDocument()

    fireEvent.click(within(inspector).getByRole("button", { name: "Open External" }))
    await waitFor(() => {
      expect(window.desktop!.openExternalUrl).toHaveBeenCalledWith({
        url: "http://localhost:3000/",
      })
    })
  })

  it("keeps saving preview comment tags when screenshot capture fails", async () => {
    window.desktop!.capturePreviewScreenshot = vi.fn().mockRejectedValueOnce(new Error("capture failed"))

    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    fireEvent.click(within(inspector).getByRole("button", { name: "Preview" }))

    const previewUrlInput = within(inspector).getByRole("textbox", { name: "Preview URL" })
    fireEvent.change(previewUrlInput, {
      target: { value: "localhost:3000" },
    })
    fireEvent.submit(previewUrlInput.closest("form")!)

    expect(await within(inspector).findByTitle("Preview of http://localhost:3000/")).toBeInTheDocument()
    fireEvent.click(within(inspector).getByRole("button", { name: "Comment" }))

    const overlay = within(inspector).getByTestId("preview-comment-overlay")
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 300,
        height: 300,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    fireEvent.click(overlay, { clientX: 120, clientY: 150 })
    fireEvent.change(within(inspector).getByRole("textbox", { name: "Preview comment" }), {
      target: { value: "Screenshot capture should not block save" },
    })
    fireEvent.click(within(inspector).getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Task draft" }).textContent).toContain("@preview:localhost:3000#1")
    })
    expect(screen.getByRole("textbox", { name: "Task draft" }).textContent).not.toContain(
      "Screenshot capture should not block save",
    )
  })

  it("keeps preview comment fallback active over Electron webviews", async () => {
    const userAgentSpy = vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 Electron/39.0.0",
    )
    window.desktop!.previewGuestPreloadPath = "file:///C:/Projects/fanfande_studio/packages/desktop/out/preload/preview-webview.mjs"

    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    fireEvent.click(within(inspector).getByRole("button", { name: "Preview" }))

    const previewUrlInput = within(inspector).getByRole("textbox", { name: "Preview URL" })
    fireEvent.change(previewUrlInput, {
      target: { value: "localhost:3000" },
    })
    fireEvent.submit(previewUrlInput.closest("form")!)

    await waitFor(() => {
      expect(document.querySelector("webview.preview-frame")).toBeInTheDocument()
    })
    fireEvent.click(within(inspector).getByRole("button", { name: "Comment" }))

    const overlay = within(inspector).getByTestId("preview-comment-overlay")
    Object.defineProperty(overlay, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 300,
        height: 300,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })

    fireEvent.mouseMove(overlay, { clientX: 100, clientY: 90 })
    expect(within(inspector).getByText("point")).toBeInTheDocument()
    expect(within(inspector).getByText("25%, 30%")).toBeInTheDocument()

    fireEvent.click(overlay, { clientX: 120, clientY: 120 })
    expect(within(inspector).getByRole("textbox", { name: "Preview comment" })).toBeInTheDocument()

    userAgentSpy.mockRestore()
  })

  it("searches files in the focused workspace and loads text content in the files inspector", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue(createWorkspaceFileReviewWorkspaces())
    window.desktop!.searchWorkspaceFiles = vi.fn().mockResolvedValue([
      {
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
      },
    ])
    window.desktop!.readWorkspaceFile = vi.fn().mockResolvedValue({
      path: WORKSPACE_FILE_PATH,
      name: "focus-files.tsx",
      extension: "tsx",
      kind: "text",
      content: WORKSPACE_FILE_CONTENT,
    })

    render(<App />)

    expect(await screen.findByRole("button", { name: "Files" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Files" }))
    fireEvent.change(screen.getByLabelText("Search workspace files"), {
      target: { value: "focus" },
    })

    await waitFor(() => {
      expect(window.desktop!.searchWorkspaceFiles).toHaveBeenCalledWith({
        directory: FRONTEND_WORKSPACE_DIRECTORY,
        query: "focus",
      })
    })

    fireEvent.click(await screen.findByRole("button", { name: /focus-files\.tsx/i }))

    await waitFor(() => {
      expect(window.desktop!.readWorkspaceFile).toHaveBeenCalledWith({
        directory: FRONTEND_WORKSPACE_DIRECTORY,
        path: WORKSPACE_FILE_PATH,
      })
    })
    expect(await screen.findByText("export const focusValue = 1")).toBeInTheDocument()
    expect(screen.getByText("const nextValue = focusValue + 1")).toBeInTheDocument()
  })

  it("shows line comments on hover, confirms a comment, and discards a canceled draft", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue(createWorkspaceFileReviewWorkspaces())
    window.desktop!.searchWorkspaceFiles = vi.fn().mockResolvedValue([
      {
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
      },
    ])
    window.desktop!.readWorkspaceFile = vi.fn().mockResolvedValue({
      path: WORKSPACE_FILE_PATH,
      name: "focus-files.tsx",
      extension: "tsx",
      kind: "text",
      content: WORKSPACE_FILE_CONTENT,
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Files" }))
    fireEvent.change(screen.getByLabelText("Search workspace files"), {
      target: { value: "focus" },
    })
    fireEvent.click(await screen.findByRole("button", { name: /focus-files\.tsx/i }))
    expect(await screen.findByText("const nextValue = focusValue + 1")).toBeInTheDocument()

    const secondLine = screen.getByTestId("workspace-file-line-2")
    expect(screen.queryByRole("button", { name: "Add comment on line 2" })).not.toBeInTheDocument()

    fireEvent.mouseEnter(secondLine)
    fireEvent.click(screen.getByRole("button", { name: "Add comment on line 2" }))
    fireEvent.change(screen.getByRole("textbox", { name: "File comment on line 2" }), {
      target: { value: "Check the increment logic." },
    })
    expect(screen.queryByRole("button", { name: "Annotate" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "确认" }))

    expect(screen.getByText("Check the increment logic.")).toBeInTheDocument()

    const thirdLine = screen.getByTestId("workspace-file-line-3")
    fireEvent.mouseEnter(thirdLine)
    fireEvent.click(screen.getByRole("button", { name: "Add comment on line 3" }))
    fireEvent.change(screen.getByRole("textbox", { name: "File comment on line 3" }), {
      target: { value: "Drop this note." },
    })
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    expect(screen.queryByText("Drop this note.")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "File comment on line 3" })).not.toBeInTheDocument()
  })

  it("confirms a multi-line file comment into a composer reference chip and sends its compiled context", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue(createWorkspaceFileReviewWorkspaces())
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.searchWorkspaceFiles = vi.fn().mockResolvedValue([
      {
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
      },
    ])
    window.desktop!.readWorkspaceFile = vi.fn().mockResolvedValue({
      path: WORKSPACE_FILE_PATH,
      name: "focus-files.tsx",
      extension: "tsx",
      kind: "text",
      content: WORKSPACE_FILE_CONTENT,
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Files" }))
    fireEvent.change(screen.getByLabelText("Search workspace files"), {
      target: { value: "focus" },
    })
    fireEvent.click(await screen.findByRole("button", { name: /focus-files\.tsx/i }))
    expect(await screen.findByText("const nextValue = focusValue + 1")).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId("workspace-file-line-gutter-2"), { button: 0 })
    fireEvent.mouseOver(screen.getByTestId("workspace-file-line-gutter-3"))
    fireEvent.mouseUp(screen.getByTestId("workspace-file-line-gutter-3"))

    const commentBox = await screen.findByRole("textbox", { name: "File comment on lines 2-3" })
    fireEvent.change(commentBox, {
      target: { value: "Check how these values flow through the summary." },
    })
    fireEvent.click(screen.getByRole("button", { name: "确认" }))

    await screen.findByText(/focus-files\.tsx:L2-L3/)
    expect(screen.getByRole("textbox", { name: "Task draft" }).textContent).toContain("@focus-files.tsx:L2-L3")
    expect(screen.getByText("Check how these values flow through the summary.")).toBeInTheDocument()

    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalled()
    })

    const sendAgentMessage = window.desktop!.agentSession!.sendTurn
    expect(sendAgentMessage).toBeDefined()
    if (!sendAgentMessage) throw new Error("Expected sendAgentMessage mock")

    const sendInput = vi.mocked(sendAgentMessage).mock.calls.at(-1)?.[0]
    expect(sendInput).toBeDefined()
    if (!sendInput) throw new Error("Expected sendAgentMessage payload")

    expect(sendInput.text).toContain("File feedback for src/focus-files.tsx (Lines 2-3)")
    expect(sendInput.text).toContain("2 | const nextValue = focusValue + 1")
    expect(sendInput.text).toContain("3 | export const summary = nextValue")
    expect(sendInput.text).toContain("Check how these values flow through the summary.")

    await waitFor(() => {
      expect(screen.queryByLabelText("Selected comment references")).not.toBeInTheDocument()
    })

    const threadReferenceChip = screen
      .getAllByText(/focus-files\.tsx:L2-L3/)
      .find((element) => element.classList.contains("composer-inline-tag"))
    expect(threadReferenceChip).toHaveClass("composer-inline-tag", "thread-inline-reference", "is-comment")
    expect(screen.getByText("Check how these values flow through the summary.")).toBeInTheDocument()
    expect(screen.queryByText("File feedback for src/focus-files.tsx (Lines 2-3)")).not.toBeInTheDocument()
  })

  it("keeps user reference chips after streamed history refresh replaces the conversation", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let activeStreamID = ""
    let historyPhase: "initial" | "after-send" = "initial"

    const compiledReferencePrompt = [
      "File feedback for src/focus-files.tsx (Lines 2-3)",
      "",
      "```tsx",
      "2 | const nextValue = focusValue + 1",
      "3 | export const summary = nextValue",
      "```",
      "",
      "Comment:",
      "Check how these values flow through the summary.",
    ].join("\n")

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue(createWorkspaceFileReviewWorkspaces())
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.searchWorkspaceFiles = vi.fn().mockResolvedValue([
      {
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
      },
    ])
    window.desktop!.readWorkspaceFile = vi.fn().mockResolvedValue({
      path: WORKSPACE_FILE_PATH,
      name: "focus-files.tsx",
      extension: "tsx",
      kind: "text",
      content: WORKSPACE_FILE_CONTENT,
    })
    window.desktop!.agentSession!.loadHistory = vi.fn().mockImplementation(async ({ backendSessionID: sessionID }: { backendSessionID: string }) => {
      if (sessionID !== "session-frontend-review" || historyPhase !== "after-send") return []

      return [
        {
          info: {
            id: "msg-user-history",
            sessionID,
            role: "user",
            created: 10,
          },
          parts: [{ id: "part-user-history", type: "text", text: compiledReferencePrompt }],
        },
        {
          info: {
            id: "msg-assistant-history",
            sessionID,
            role: "assistant",
            created: 11,
            completed: 12,
          },
          parts: [{ id: "part-assistant-history", type: "text", text: "History refresh complete." }],
        },
      ]
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(async (input: { clientTurnID: string }) => {
      activeStreamID = input.clientTurnID
      return {
        clientTurnID: input.clientTurnID,
      }
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Files" }))
    fireEvent.change(screen.getByLabelText("Search workspace files"), {
      target: { value: "focus" },
    })
    fireEvent.click(await screen.findByRole("button", { name: /focus-files\.tsx/i }))
    expect(await screen.findByText("const nextValue = focusValue + 1")).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByTestId("workspace-file-line-gutter-2"), { button: 0 })
    fireEvent.mouseOver(screen.getByTestId("workspace-file-line-gutter-3"))
    fireEvent.mouseUp(screen.getByTestId("workspace-file-line-gutter-3"))

    const commentBox = await screen.findByRole("textbox", { name: "File comment on lines 2-3" })
    fireEvent.change(commentBox, {
      target: { value: "Check how these values flow through the summary." },
    })
    fireEvent.click(screen.getByRole("button", { name: "确认" }))

    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(screen.queryByLabelText("Selected comment references")).not.toBeInTheDocument()
    })

    const initialReferenceChip = await screen.findByText("@focus-files.tsx:L2-L3")
    expect(initialReferenceChip).toHaveClass("composer-inline-tag", "thread-inline-reference", "is-comment")

    await act(async () => {
      historyPhase = "after-send"
      streamListener?.(createRequestStreamEvent({
        backendSessionID: "session-frontend-review",
        clientTurnID: activeStreamID,
        event: "done",
        data: {
          sessionID: "session-frontend-review",
          parts: [{ id: "part-assistant-history", type: "text", text: "History refresh complete." }],
        },
      }))
      await Promise.resolve()
    })

    const getSessionHistory = window.desktop!.agentSession!.loadHistory as ReturnType<typeof vi.fn>

    await waitFor(() => {
      expect(
        vi.mocked(getSessionHistory).mock.calls.some(
          ([input]) => input?.backendSessionID === "session-frontend-review",
        ),
      ).toBe(true)
    })

    const referenceChipAfterRefresh = await screen.findByText("@focus-files.tsx:L2-L3")
    expect(referenceChipAfterRefresh).toHaveClass("composer-inline-tag", "thread-inline-reference", "is-comment")
    expect(screen.getByText("Check how these values flow through the summary.")).toBeInTheDocument()
    expect(screen.getByText("History refresh complete.")).toBeInTheDocument()
    expect(screen.queryByText("File feedback for src/focus-files.tsx (Lines 2-3)")).not.toBeInTheDocument()
  })

  it("resets file review state when the focused workspace changes", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue(createWorkspaceFileReviewWorkspaces())
    window.desktop!.searchWorkspaceFiles = vi.fn().mockResolvedValue([
      {
        path: WORKSPACE_FILE_PATH,
        name: "focus-files.tsx",
        extension: "tsx",
      },
    ])
    window.desktop!.readWorkspaceFile = vi.fn().mockResolvedValue({
      path: WORKSPACE_FILE_PATH,
      name: "focus-files.tsx",
      extension: "tsx",
      kind: "text",
      content: WORKSPACE_FILE_CONTENT,
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Files" }))
    fireEvent.change(screen.getByLabelText("Search workspace files"), {
      target: { value: "focus" },
    })
    fireEvent.click(await screen.findByRole("button", { name: /focus-files\.tsx/i }))
    expect(await screen.findByText("export const focusValue = 1")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "backend" }))

    await waitFor(() => {
      expect(screen.queryByText("export const focusValue = 1")).not.toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: /focus-files\.tsx/i })).not.toBeInTheDocument()
    expect(screen.getByLabelText("Search workspace files")).toHaveValue("")
  })

  it("renders session workflow badges in the sidebar, tabs, and active session header", async () => {
    const workspace: LoadedFolderWorkspace = {
      id: "workspace-plan",
      directory: "C:\\Projects\\Planner\\app",
      name: "app",
      created: 1,
      updated: 30,
      project: {
        id: "project-plan",
        name: "Planner",
        worktree: "C:\\Projects\\Planner",
      },
      sessions: [
        {
          id: "session-plan-pending",
          projectID: "project-plan",
          directory: "C:\\Projects\\Planner\\app",
          title: "Plan review",
          created: 5,
          updated: 30,
          workflow: {
            mode: "planning",
            plan: {
              status: "pending-approval",
              updatedAt: 30,
            },
          },
        },
        {
          id: "session-plan-draft",
          projectID: "project-plan",
          directory: "C:\\Projects\\Planner\\app",
          title: "Research",
          created: 4,
          updated: 20,
          workflow: {
            mode: "planning",
            plan: {
              status: "draft",
              updatedAt: 20,
            },
          },
        },
        {
          id: "session-plan-approved",
          projectID: "project-plan",
          directory: "C:\\Projects\\Planner\\app",
          title: "Execute",
          created: 3,
          updated: 10,
          workflow: {
            mode: "execution",
            plan: {
              status: "approved",
              updatedAt: 10,
              approvedAt: 9,
            },
          },
        },
      ],
    }

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([workspace])

    render(<App />)

    const topMenu = await screen.findByLabelText("Session canvas top menu")
    expect(within(topMenu).getByText("Plan Pending Approval")).toBeInTheDocument()
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Planning").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Approved plan").length).toBeGreaterThan(0)
  })

  it("opens the external editor selector from the session canvas top menu", async () => {
    render(<App />)
    const topMenu = screen.getByLabelText("Session canvas top menu")

    await waitFor(() => {
      expect(window.desktop!.listExternalEditorsForTarget).toHaveBeenCalledWith({
        targetPath: "C:\\Projects\\Project 2\\app",
      })
    })

    fireEvent.click(within(topMenu).getByRole("button", { name: "Choose editor for current project" }))

    const editorMenu = await screen.findByRole("dialog", { name: "Open current project" })
    expect(editorMenu.querySelector(".external-editor-menu-option-icon-image")).not.toBeNull()
    fireEvent.click(within(editorMenu).getByRole("button", { name: /VS Code/i }))

    await waitFor(() => {
      expect(window.desktop!.openInExternalEditor).toHaveBeenCalledWith({
        targetPath: "C:\\Projects\\Project 2\\app",
        editorID: "vscode",
      })
    })
    expect(window.localStorage.getItem("desktop.externalEditor.lastUsed.v1")).toBe("vscode")
  })

  it("opens the remembered external editor from the primary split button", async () => {
    window.localStorage.setItem("desktop.externalEditor.lastUsed.v1", "explorer")
    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listExternalEditorsForTarget).toHaveBeenCalledWith({
        targetPath: "C:\\Projects\\Project 2\\app",
      })
    })

    const topMenu = screen.getByLabelText("Session canvas top menu")
    fireEvent.click(await within(topMenu).findByRole("button", { name: "Open current project in File Explorer" }))

    await waitFor(() => {
      expect(window.desktop!.openInExternalEditor).toHaveBeenCalledWith({
        targetPath: "C:\\Projects\\Project 2\\app",
        editorID: "explorer",
      })
    })
  })

  it("creates a global skill from the inline draft form", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\layout-review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["---", "name: layout-review", "description: Describe when this skill should be used.", "---", "", "# layout-review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-review",
            path: directoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: filePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.createGlobalSkill = vi.fn().mockResolvedValue({
      directory: directoryPath,
      file: {
        path: filePath,
        content,
      },
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    expect(screen.getByLabelText("Skills top menu")).toBeInTheDocument()
    expect(screen.queryByLabelText("Left sidebar top menu")).not.toBeInTheDocument()
    expect(screen.queryByRole("complementary", { name: "Inspector sidebar" })).not.toBeInTheDocument()

    await screen.findByText("No skills exist yet. Use + to create the first one.")

    fireEvent.click(screen.getByRole("button", { name: "Create global skill or folder" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "New skill" }))

    const nameInput = screen.getByRole("textbox", { name: "New global skill name" })
    fireEvent.change(nameInput, { target: { value: "layout-review" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(window.desktop!.createGlobalSkill).toHaveBeenCalledWith({
        name: "layout-review",
        parentDirectory: null,
      })
    })

    await screen.findByRole("button", { name: "SKILL.md" })
    expect(screen.queryByRole("textbox", { name: "New global skill name" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("creates a global skill folder and a nested skill from the tree menu", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const folderPath = `${root}\\frontend`
    const directoryPath = `${folderPath}\\review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["---", "name: review", "description: Describe when this skill should be used.", "---", "", "# review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "frontend",
            path: folderPath,
            kind: "directory",
            role: "folder",
            children: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "frontend",
            path: folderPath,
            kind: "directory",
            role: "folder",
            children: [
              {
                name: "review",
                path: directoryPath,
                kind: "directory",
                role: "skill",
                children: [
                  {
                    name: "SKILL.md",
                    path: filePath,
                    kind: "file",
                    role: "resource",
                  },
                ],
              },
            ],
          },
        ],
      })
    window.desktop!.createGlobalSkillFolder = vi.fn().mockResolvedValue({
      directory: folderPath,
    })
    window.desktop!.createGlobalSkill = vi.fn().mockResolvedValue({
      directory: directoryPath,
      file: {
        path: filePath,
        content,
      },
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))
    await screen.findByText("No skills exist yet. Use + to create the first one.")

    fireEvent.click(screen.getByRole("button", { name: "Create global skill or folder" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "New folder" }))
    fireEvent.change(screen.getByRole("textbox", { name: "New global skill name" }), {
      target: { value: "frontend" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(window.desktop!.createGlobalSkillFolder).toHaveBeenCalledWith({
        name: "frontend",
        parentDirectory: null,
      })
    })
    await screen.findByRole("button", { name: "frontend" })

    fireEvent.click(screen.getByRole("button", { name: "Actions for frontend" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "New skill here" }))
    fireEvent.change(screen.getByRole("textbox", { name: "New global skill name" }), {
      target: { value: "review" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => {
      expect(window.desktop!.createGlobalSkill).toHaveBeenCalledWith({
        name: "review",
        parentDirectory: folderPath,
      })
    })
    expect(await screen.findByRole("button", { name: "SKILL.md" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("moves a global skill into a selected folder", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const folderPath = `${root}\\frontend`
    const oldDirectoryPath = `${root}\\review`
    const oldFilePath = `${oldDirectoryPath}\\SKILL.md`
    const nextDirectoryPath = `${folderPath}\\review`
    const nextFilePath = `${nextDirectoryPath}\\SKILL.md`
    const content = ["---", "name: review", "description: Move me.", "---", "", "# review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "frontend",
            path: folderPath,
            kind: "directory",
            role: "folder",
            children: [],
          },
          {
            name: "review",
            path: oldDirectoryPath,
            kind: "directory",
            role: "skill",
            children: [
              {
                name: "SKILL.md",
                path: oldFilePath,
                kind: "file",
                role: "resource",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "frontend",
            path: folderPath,
            kind: "directory",
            role: "folder",
            children: [
              {
                name: "review",
                path: nextDirectoryPath,
                kind: "directory",
                role: "skill",
                children: [
                  {
                    name: "SKILL.md",
                    path: nextFilePath,
                    kind: "file",
                    role: "resource",
                  },
                ],
              },
            ],
          },
        ],
      })
    window.desktop!.readGlobalSkillFile = vi.fn().mockImplementation(async ({ path }: { path: string }) => ({
      path,
      content,
    }))
    window.desktop!.moveGlobalSkillDirectory = vi.fn().mockResolvedValue({
      previousDirectory: oldDirectoryPath,
      directory: nextDirectoryPath,
      filePath: nextFilePath,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))
    expect(await screen.findByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)

    fireEvent.click(screen.getByRole("button", { name: "Actions for review" }))
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move to folder..." }))

    const dialog = await screen.findByRole("dialog", { name: "Move skill or folder" })
    fireEvent.change(within(dialog).getByRole("combobox", { name: "Move destination" }), {
      target: { value: folderPath },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Move" }))

    await waitFor(() => {
      expect(window.desktop!.moveGlobalSkillDirectory).toHaveBeenCalledWith({
        directory: oldDirectoryPath,
        parentDirectory: folderPath,
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Move skill or folder" })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("button", { name: "SKILL.md" })).toBeInTheDocument()
    expect(window.desktop!.readGlobalSkillFile).toHaveBeenLastCalledWith({ path: nextFilePath })
  })

  it("opens the global skills folder from the skills page", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    window.desktop!.getGlobalSkillsTree = vi.fn().mockResolvedValue({
      root,
      items: [],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    const openLocationButton = await screen.findByRole("button", { name: "打开文件位置" })
    await waitFor(() => {
      expect(openLocationButton).not.toBeDisabled()
    })
    expect(screen.queryByText(root)).not.toBeInTheDocument()

    fireEvent.click(openLocationButton)

    await waitFor(() => {
      expect(window.desktop!.openInExternalEditor).toHaveBeenCalledWith({
        targetPath: root,
        editorID: "explorer",
      })
    })
  })

  it("previews and installs global skills from a Git repository", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\layout-review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["---", "name: Layout Review", "description: Review layouts.", "---", "", "# Layout Review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-review",
            path: directoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: filePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.previewGlobalSkillGitInstall = vi.fn().mockResolvedValue({
      previewID: "preview-1",
      source: "owner/repo",
      cloneUrl: "https://github.com/owner/repo.git",
      skills: [
        {
          id: "skills/layout-review",
          name: "Layout Review",
          description: "Review layouts.",
          relativePath: "skills/layout-review",
          directoryName: "layout-review",
          targetDirectory: directoryPath,
          available: true,
          filePath,
        },
        {
          id: "skills/existing",
          name: "Existing",
          description: "Already installed.",
          relativePath: "skills/existing",
          directoryName: "existing",
          targetDirectory: `${root}\\existing`,
          available: false,
          reason: "Skill 'existing' already exists.",
          filePath: `${root}\\existing\\SKILL.md`,
        },
      ],
    })
    window.desktop!.installGlobalSkillsFromGit = vi.fn().mockResolvedValue({
      installed: [
        {
          id: "skills/layout-review",
          name: "Layout Review",
          directory: directoryPath,
          filePath,
        },
      ],
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))
    fireEvent.click(await screen.findByRole("button", { name: "Install skill" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "From URL" }))

    const dialog = await screen.findByRole("dialog", { name: "Install skills from Git" })
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Git skill repository" }), {
      target: { value: "owner/repo" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview" }))

    await waitFor(() => {
      expect(window.desktop!.previewGlobalSkillGitInstall).toHaveBeenCalledWith({
        source: "owner/repo",
        parentDirectory: null,
      })
    })

    expect(await within(dialog).findByRole("checkbox", { name: /Layout Review/ })).toBeChecked()
    expect(within(dialog).getByRole("checkbox", { name: /Existing/ })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole("button", { name: "Install (1)" }))

    await waitFor(() => {
      expect(window.desktop!.installGlobalSkillsFromGit).toHaveBeenCalledWith({
        previewID: "preview-1",
        skillIDs: ["skills/layout-review"],
        parentDirectory: null,
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Install skills from Git" })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole("button", { name: "SKILL.md" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("installs a global skill from a local SKILL.md file", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\local-review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["---", "name: Local Review", "description: Review local layouts.", "---", "", "# Local Review"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "local-review",
            path: directoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: filePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.installGlobalSkillFromLocalFile = vi.fn().mockResolvedValue({
      installed: [
        {
          id: ".",
          name: "Local Review",
          directory: directoryPath,
          filePath,
        },
      ],
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))
    fireEvent.click(await screen.findByRole("button", { name: "Install skill" }))
    fireEvent.click(await screen.findByRole("menuitem", { name: "From local file" }))

    const dialog = await screen.findByRole("dialog", { name: "Install local skill" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Choose SKILL.md" }))

    await waitFor(() => {
      expect(window.desktop!.installGlobalSkillFromLocalFile).toHaveBeenCalledWith({
        parentDirectory: null,
      })
    })

    expect(await screen.findByRole("button", { name: "SKILL.md" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("filters the global skills tree from the fixed search row", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const algorithmicDirectoryPath = `${root}\\algorithmic-art`
    const algorithmicFilePath = `${algorithmicDirectoryPath}\\SKILL.md`
    const frontendFolderPath = `${root}\\frontend`
    const reviewDirectoryPath = `${frontendFolderPath}\\review`
    const reviewFilePath = `${reviewDirectoryPath}\\SKILL.md`

    window.desktop!.getGlobalSkillsTree = vi.fn().mockResolvedValue({
      root,
      items: [
        {
          name: "algorithmic-art",
          path: algorithmicDirectoryPath,
          kind: "directory",
          children: [
            {
              name: "SKILL.md",
              path: algorithmicFilePath,
              kind: "file",
            },
          ],
        },
        {
          name: "frontend",
          path: frontendFolderPath,
          kind: "directory",
          role: "folder",
          children: [
            {
              name: "review",
              path: reviewDirectoryPath,
              kind: "directory",
              children: [
                {
                  name: "SKILL.md",
                  path: reviewFilePath,
                  kind: "file",
                },
              ],
            },
          ],
        },
      ],
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: algorithmicFilePath,
      content: "# Algorithmic Art",
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    const search = await screen.findByRole("searchbox", { name: "Search skills" })
    expect(search.closest(".skills-tree-search-row")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "algorithmic-art" })).toBeInTheDocument()
    const algorithmicSkillRow = screen.getByRole("button", { name: "algorithmic-art" })
    const frontendFolderRow = screen.getByRole("button", { name: "frontend" })
    expect(algorithmicSkillRow).toHaveClass("has-leading-disclosure")
    expect(frontendFolderRow).not.toHaveClass("has-leading-disclosure")
    expect(algorithmicSkillRow.firstElementChild).toHaveClass("skill-tree-leading")
    expect(algorithmicSkillRow.querySelector(".skill-tree-role-icon")).not.toBeInTheDocument()
    expect(algorithmicSkillRow.querySelector(".lucide-file-text")).not.toBeInTheDocument()
    expect(frontendFolderRow.firstElementChild).toHaveClass("skill-tree-role-icon", "is-folder")
    expect(frontendFolderRow.querySelector(".lucide-folder")).toBeInTheDocument()
    expect(frontendFolderRow.querySelector(".lucide-folder-open")).not.toBeInTheDocument()
    expect(Array.from(frontendFolderRow.children).some((child) => child.classList.contains("skill-tree-leading"))).toBe(false)

    fireEvent.change(search, { target: { value: "review" } })

    expect(screen.queryByRole("button", { name: "algorithmic-art" })).not.toBeInTheDocument()
    const expandedFrontendFolderRow = screen.getByRole("button", { name: "frontend" })
    expect(expandedFrontendFolderRow).toBeInTheDocument()
    expect(expandedFrontendFolderRow.querySelector(".lucide-folder-open")).toBeInTheDocument()
    expect(expandedFrontendFolderRow.querySelector(".lucide-folder")).not.toBeInTheDocument()
    const reviewSkillRow = screen.getByRole("button", { name: "review" })
    expect(reviewSkillRow.querySelector(".skill-tree-role-icon")).not.toBeInTheDocument()
    expect(reviewSkillRow.querySelector(".lucide-file-text")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "SKILL.md" }).querySelector(".lucide-file-text")).toBeInTheDocument()

    fireEvent.change(search, { target: { value: "missing" } })

    expect(screen.getByText("No skills match your search.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "review" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Clear skills search" }))

    expect(search).toHaveValue("")
    expect(screen.getByRole("button", { name: "algorithmic-art" })).toBeInTheDocument()
  })

  it("switches the global skill editor between edit and markdown preview", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\layout-review`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = ["# Preview Heading", "", "- First task", "- Second task"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi.fn().mockResolvedValue({
      root,
      items: [
        {
          name: "layout-review",
          path: directoryPath,
          kind: "directory",
          children: [
            {
              name: "SKILL.md",
              path: filePath,
              kind: "file",
            },
          ],
        },
      ],
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    const editor = await screen.findByRole("textbox", { name: "Global skill editor" })
    expect(editor).toHaveValue(content)
    await waitFor(() => {
      expect(editor).toHaveFocus()
    })

    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    expect(screen.queryByRole("textbox", { name: "Global skill editor" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Preview Heading" })).toBeInTheDocument()
    expect(screen.getByText("First task")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))

    const reopenedEditor = screen.getByRole("textbox", { name: "Global skill editor" })
    expect(reopenedEditor).toHaveValue(content)
    await waitFor(() => {
      expect(reopenedEditor).toHaveFocus()
    })

    fireEvent.change(reopenedEditor, { target: { value: `${content}\n\nEditable note` } })

    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(`${content}\n\nEditable note`)
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled()
  })

  it("renders global skill frontmatter as structured preview metadata", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const directoryPath = `${root}\\agent-browser`
    const filePath = `${directoryPath}\\SKILL.md`
    const content = [
      "---",
      "name: agent-browser",
      "description: Browser automation CLI for AI agents.",
      "allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)",
      "hidden: true",
      "---",
      "",
      "# agent-browser",
      "",
      "Fast browser automation CLI for AI agents.",
    ].join("\n")

    window.desktop!.getGlobalSkillsTree = vi.fn().mockResolvedValue({
      root,
      items: [
        {
          name: "agent-browser",
          path: directoryPath,
          kind: "directory",
          children: [
            {
              name: "SKILL.md",
              path: filePath,
              kind: "file",
            },
          ],
        },
      ],
    })
    window.desktop!.readGlobalSkillFile = vi.fn().mockResolvedValue({
      path: filePath,
      content,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    expect(await screen.findByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
    const agentBrowserRow = screen.getByRole("button", { name: "agent-browser" })
    const skillFileRow = screen.getByRole("button", { name: "SKILL.md" })
    expect(agentBrowserRow).not.toHaveClass("is-active")
    expect(skillFileRow).toHaveClass("is-active")
    expect(document.querySelectorAll(".skill-tree-row.is-active")).toHaveLength(1)

    fireEvent.click(agentBrowserRow)

    expect(agentBrowserRow).toHaveClass("is-active")
    expect(screen.queryByRole("button", { name: "SKILL.md" })).not.toBeInTheDocument()
    expect(document.querySelectorAll(".skill-tree-row.is-active")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    const metadata = screen.getByRole("region", { name: "Skill metadata" })
    expect(within(metadata).getByText("Skill Metadata")).toBeInTheDocument()
    expect(within(metadata).getByText("Browser automation CLI for AI agents.")).toBeInTheDocument()
    expect(within(metadata).getByText("Hidden")).toBeInTheDocument()
    expect(within(metadata).getByText("Bash(agent-browser:*)")).toBeInTheDocument()
    expect(within(metadata).getByText("Bash(npx agent-browser:*)")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "agent-browser" })).toBeInTheDocument()
    expect(screen.queryByText(/name: agent-browser/)).not.toBeInTheDocument()
    expect(screen.queryByText(/allowed-tools:/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))

    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(content)
  })

  it("renames a global skill from the tree with double click", async () => {
    const root = "C:\\Users\\19128\\.anybox\\skills"
    const oldDirectoryPath = `${root}\\layout-review`
    const oldFilePath = `${oldDirectoryPath}\\SKILL.md`
    const nextDirectoryPath = `${root}\\layout-audit`
    const nextFilePath = `${nextDirectoryPath}\\SKILL.md`
    const oldContent = ["---", "name: layout-review", "description: Describe when this skill should be used.", "---", "", "# layout-review"].join("\n")
    const nextContent = ["---", "name: layout-audit", "description: Describe when this skill should be used.", "---", "", "# layout-audit"].join("\n")

    window.desktop!.getGlobalSkillsTree = vi
      .fn()
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-review",
            path: oldDirectoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: oldFilePath,
                kind: "file",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        root,
        items: [
          {
            name: "layout-audit",
            path: nextDirectoryPath,
            kind: "directory",
            children: [
              {
                name: "SKILL.md",
                path: nextFilePath,
                kind: "file",
              },
            ],
          },
        ],
      })
    window.desktop!.readGlobalSkillFile = vi
      .fn()
      .mockResolvedValueOnce({
        path: oldFilePath,
        content: oldContent,
      })
      .mockResolvedValueOnce({
        path: nextFilePath,
        content: nextContent,
      })
    window.desktop!.renameGlobalSkill = vi.fn().mockResolvedValue({
      previousDirectory: oldDirectoryPath,
      directory: nextDirectoryPath,
      filePath: nextFilePath,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open skills" }))

    const oldDirectoryButton = await screen.findByRole("button", { name: "layout-review" })
    fireEvent.doubleClick(oldDirectoryButton)

    const renameInput = await screen.findByRole("textbox", { name: "Rename global skill layout-review" })
    fireEvent.change(renameInput, { target: { value: "layout-audit" } })
    fireEvent.keyDown(renameInput, { key: "Enter" })

    await waitFor(() => {
      expect(window.desktop!.renameGlobalSkill).toHaveBeenCalledWith({
        directory: oldDirectoryPath,
        name: "layout-audit",
      })
    })

    await screen.findByRole("button", { name: "layout-audit" })
    expect(screen.queryByRole("textbox", { name: "Rename global skill layout-review" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Global skill editor" })).toHaveValue(nextContent)
  })

  it("routes window control clicks through the desktop bridge", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Minimize window" }))
    fireEvent.click(screen.getByRole("button", { name: "Maximize window" }))
    fireEvent.click(screen.getByRole("button", { name: "Close window" }))

    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(1, "minimize")
    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(2, "toggle-maximize")
    expect(window.desktop!.windowAction).toHaveBeenNthCalledWith(3, "close")
  })

  it("opens the git quick menu and triggers commit and push for the active workspace", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitCommit = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Committed to main.",
    })
    window.desktop!.gitPush = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Pushed main.",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })
    await screen.findByRole("button", { name: "Atlas review" })
    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    fireEvent.click(await screen.findByRole("button", { name: "Git" }))
    fireEvent.click(screen.getByRole("button", { name: /Commit changes/i }))

    expect(await screen.findByRole("textbox", { name: "Commit message" })).toBeInTheDocument()

    fireEvent.change(screen.getByRole("textbox", { name: "Commit message" }), {
      target: {
        value: "chore: wire git quick menu",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Run commit" }))

    await waitFor(() => {
      expect(window.desktop!.gitCommit).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        message: "chore: wire git quick menu",
      })
    })

    expect(await screen.findByText("Committed to main.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Push branch/i }))

    await waitFor(() => {
      expect(window.desktop!.gitPush).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    expect(await screen.findByText("Pushed main.")).toBeInTheDocument()
  })

  it("runs stage all and commit from the git quick menu", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: false,
        reason: "Stage changes before committing.",
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Switch to a feature branch before creating a pull request.",
      },
      canCreateBranch: {
        enabled: true,
      },
    })

    render(<App />)

    await screen.findByRole("button", { name: "Atlas review" })

    fireEvent.click(await screen.findByRole("button", { name: "Git" }))
    fireEvent.click(screen.getByRole("button", { name: /Commit changes/i }))

    fireEvent.change(await screen.findByRole("textbox", { name: "Commit message" }), {
      target: {
        value: "chore: stage all from quick menu",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Stage all + commit" }))

    await waitFor(() => {
      expect(window.desktop!.gitCommit).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        message: "chore: stage all from quick menu",
        stageAll: true,
      })
    })
  })

  it("refreshes git commit availability when the quick menu opens after staged changes", async () => {
    let canCommit = false
    const getCapabilities = () => ({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: canCommit
        ? {
            enabled: true,
          }
        : {
            enabled: false,
            reason: "Stage changes before committing.",
          },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Switch to a feature branch before creating a pull request.",
      },
      canCreateBranch: {
        enabled: true,
      },
    })

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(async () => getCapabilities())

    render(<App />)

    await screen.findByRole("button", { name: "Atlas review" })

    const gitGetCapabilities = window.desktop!.gitGetCapabilities as ReturnType<typeof vi.fn>
    const menuRefresh = createDeferred<ReturnType<typeof getCapabilities>>()
    const unexpectedRefresh = createDeferred<ReturnType<typeof getCapabilities>>()
    gitGetCapabilities.mockReset()
    gitGetCapabilities.mockImplementationOnce(() => menuRefresh.promise)
    gitGetCapabilities.mockImplementation(() => unexpectedRefresh.promise)

    fireEvent.click(await screen.findByRole("button", { name: "Git" }))

    const commitButton = await screen.findByRole("button", { name: /Commit changes/i })
    expect(commitButton).toBeEnabled()
    fireEvent.click(commitButton)
    expect(screen.getByRole("button", { name: "Run commit" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Stage all + commit" })).toBeEnabled()
    await waitFor(() => {
      expect(gitGetCapabilities).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      menuRefresh.resolve(getCapabilities())
      await menuRefresh.promise
    })

    expect(gitGetCapabilities).toHaveBeenCalledTimes(1)

    gitGetCapabilities.mockReset()
    canCommit = true
    gitGetCapabilities.mockResolvedValue(getCapabilities())

    act(() => {
      window.dispatchEvent(new Event("focus"))
    })

    await waitFor(() => {
      expect(gitGetCapabilities).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Run commit" })).toBeEnabled()
    })
  })

  it("keeps the existing workspace while git capabilities load for a stable project id", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "prj_atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "prj_atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(
      async () => ({
        directory: "C:\\Projects\\Atlas\\client",
        root: "C:\\Projects\\Atlas",
        branch: "main",
        defaultBranch: "main",
        isGitRepo: true,
        canCommit: {
          enabled: true,
        },
        canStageAllCommit: {
          enabled: true,
        },
        canPush: {
          enabled: true,
        },
        canCreatePullRequest: {
          enabled: false,
          reason: "Switch to a feature branch before creating a pull request.",
        },
        canCreateBranch: {
          enabled: true,
        },
      }),
    )

    render(<App />)

    expect(await screen.findByText("Atlas")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "prj_atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    expect(window.desktop!.openFolderWorkspace).not.toHaveBeenCalled()
  })

  it("refreshes git state without reopening the workspace for index-only watcher events", async () => {
    const workspace: LoadedFolderWorkspace = {
      id: "C:\\Projects\\Atlas\\client",
      directory: "C:\\Projects\\Atlas\\client",
      name: "client",
      created: 1,
      updated: 20,
      project: {
        id: "prj_atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-atlas-review",
          projectID: "prj_atlas",
          directory: "C:\\Projects\\Atlas\\client",
          title: "Atlas review",
          created: 18,
          updated: 20,
        },
      ],
    }
    let workspaceFileChangeListener: ((event: { directory: string; paths: string[] }) => void) | null = null
    window.desktop!.onWorkspaceFileChange = vi.fn((listener) => {
      workspaceFileChangeListener = listener
      return vi.fn(() => {
        workspaceFileChangeListener = null
      })
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([workspace])
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue(workspace)
    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: workspace.directory,
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Switch to a feature branch before creating a pull request.",
      },
      canCreateBranch: {
        enabled: true,
      },
    })

    render(<App />)

    await screen.findByRole("button", { name: "Atlas review" })

    const gitGetCapabilities = window.desktop!.gitGetCapabilities as ReturnType<typeof vi.fn>
    const openFolderWorkspace = window.desktop!.openFolderWorkspace as ReturnType<typeof vi.fn>
    const getSessionDiff = window.desktop!.getSessionDiff as ReturnType<typeof vi.fn>
    gitGetCapabilities.mockClear()
    openFolderWorkspace.mockClear()
    getSessionDiff.mockClear()

    act(() => {
      workspaceFileChangeListener?.({
        directory: workspace.directory,
        paths: ["C:\\Projects\\Atlas\\client\\.git\\index"],
      })
    })

    await waitFor(() => {
      expect(gitGetCapabilities).toHaveBeenCalled()
    })
    expect(openFolderWorkspace).not.toHaveBeenCalled()
    expect(getSessionDiff).not.toHaveBeenCalled()
  })

  it("reopens the workspace when watcher events indicate repository structure changed", async () => {
    const workspace: LoadedFolderWorkspace = {
      id: "C:\\Projects\\Atlas\\client",
      directory: "C:\\Projects\\Atlas\\client",
      name: "client",
      created: 1,
      updated: 20,
      project: {
        id: "prj_atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-atlas-review",
          projectID: "prj_atlas",
          directory: "C:\\Projects\\Atlas\\client",
          title: "Atlas review",
          created: 18,
          updated: 20,
        },
      ],
    }
    let workspaceFileChangeListener: ((event: { directory: string; paths: string[] }) => void) | null = null
    window.desktop!.onWorkspaceFileChange = vi.fn((listener) => {
      workspaceFileChangeListener = listener
      return vi.fn(() => {
        workspaceFileChangeListener = null
      })
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([workspace])
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue(workspace)
    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: workspace.directory,
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Switch to a feature branch before creating a pull request.",
      },
      canCreateBranch: {
        enabled: true,
      },
    })

    render(<App />)

    await screen.findByRole("button", { name: "Atlas review" })

    const openFolderWorkspace = window.desktop!.openFolderWorkspace as ReturnType<typeof vi.fn>
    openFolderWorkspace.mockClear()

    act(() => {
      workspaceFileChangeListener?.({
        directory: workspace.directory,
        paths: ["C:\\Projects\\Atlas\\client\\.git\\config"],
      })
    })

    await waitFor(() => {
      expect(openFolderWorkspace).toHaveBeenCalledWith({
        directory: workspace.directory,
      })
    })
  })

  it("refreshes the workspace diff when files change under the active session directory", async () => {
    const workspace: LoadedFolderWorkspace = {
      id: "C:\\Projects\\Atlas\\client",
      directory: "C:\\Projects\\Atlas\\client",
      name: "client",
      created: 1,
      updated: 20,
      project: {
        id: "prj_atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-atlas-review",
          projectID: "prj_atlas",
          directory: "C:\\Projects\\Atlas\\client",
          title: "Atlas review",
          created: 18,
          updated: 20,
        },
      ],
    }
    let workspaceFileChangeListener: ((event: { directory: string; paths: string[] }) => void) | null = null
    let diffRequestCount = 0
    const changedDiff = {
      title: "1 file change (+3 -1)",
      stats: {
        files: 1,
        additions: 3,
        deletions: 1,
      },
      diffs: [
        {
          file: "src/App.tsx",
          additions: 3,
          deletions: 1,
          patch: [
            "diff --git a/src/App.tsx b/src/App.tsx",
            "index 1111111..2222222 100644",
            "--- a/src/App.tsx",
            "+++ b/src/App.tsx",
            "@@ -1,2 +1,3 @@",
            " import { AppShell } from './shell'",
            "+import { WorkspaceDiff } from './WorkspaceDiff'",
            " export function App() {",
          ].join("\n"),
        },
      ],
    }

    window.desktop!.onWorkspaceFileChange = vi.fn((listener) => {
      workspaceFileChangeListener = listener
      return vi.fn(() => {
        workspaceFileChangeListener = null
      })
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([workspace])
    window.desktop!.getSessionDiff = vi.fn().mockImplementation(async () => {
      diffRequestCount += 1
      return diffRequestCount === 1 ? { diffs: [] } : changedDiff
    })

    render(<App />)

    await screen.findByRole("button", { name: "Atlas review" })
    await waitFor(() => {
      expect(window.desktop!.getSessionDiff).toHaveBeenCalledWith({
        sessionID: "session-atlas-review",
      })
    })
    expect(screen.getByText("No changes in this session.")).toBeInTheDocument()

    vi.useFakeTimers()
    try {
      act(() => {
        workspaceFileChangeListener?.({
          directory: workspace.directory,
          paths: ["C:\\Projects\\Atlas\\client\\src\\App.tsx"],
        })
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
    } finally {
      vi.useRealTimers()
    }

    await waitFor(() => {
      expect(window.desktop!.getSessionDiff).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText("src/App.tsx")).toBeInTheDocument()
  })

  it("shows the current git branch in the composer utility bar and switches branches from the list", async () => {
    let currentBranch = "main"
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(async () => ({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: currentBranch,
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest:
        currentBranch === "main"
          ? {
              enabled: false,
              reason: "Switch to a feature branch before creating a pull request.",
            }
          : {
              enabled: true,
            },
      canCreateBranch: {
        enabled: true,
      },
    }))
    window.desktop!.gitListBranches = vi.fn().mockImplementation(async () => [
      {
        name: "main",
        kind: "local",
        current: currentBranch === "main",
      },
      {
        name: "feature/ui-pass",
        kind: "local",
        current: currentBranch === "feature/ui-pass",
      },
      {
        name: "origin/release/hotfix",
        kind: "remote",
        current: false,
      },
    ])
    window.desktop!.gitCheckoutBranch = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
      currentBranch = name === "origin/release/hotfix" ? "release/hotfix" : name

      return {
        directory: "C:\\Projects\\Atlas\\client",
        root: "C:\\Projects\\Atlas",
        branch: currentBranch,
        stdout: "",
        stderr: "",
        summary: `Switched to ${currentBranch}.`,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    const utilityBar = document.querySelector(".composer-utility-bar") as HTMLElement
    expect(utilityBar).not.toBeNull()

    fireEvent.click(within(utilityBar).getByRole("button", { name: "main" }))

    const branchSwitcher = await screen.findByRole("dialog", { name: "Git branch switcher" })
    expect(within(branchSwitcher).getByRole("button", { name: /feature\/ui-pass/ })).toBeInTheDocument()
    expect(within(branchSwitcher).getByRole("button", { name: /origin\/release\/hotfix/ })).toBeInTheDocument()

    fireEvent.click(within(branchSwitcher).getByRole("button", { name: /feature\/ui-pass/ }))

    await waitFor(() => {
      expect(window.desktop!.gitCheckoutBranch).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        name: "feature/ui-pass",
      })
    })

    await waitFor(() => {
      expect(within(utilityBar).getByRole("button", { name: "feature/ui-pass" })).toBeInTheDocument()
    })
  })

  it.skip("opens the create-and-checkout branch dialog from the composer utility bar", async () => {
    let currentBranch = "main"
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(async () => ({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: currentBranch,
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest:
        currentBranch === "main"
          ? {
              enabled: false,
              reason: "Switch to a feature branch before creating a pull request.",
            }
          : {
              enabled: true,
            },
      canCreateBranch: {
        enabled: true,
      },
    }))
    window.desktop!.gitListBranches = vi.fn().mockImplementation(async () => [
      {
        name: "main",
        kind: "local",
        current: currentBranch === "main",
      },
      {
        name: "feature/test",
        kind: "local",
        current: currentBranch === "feature/test",
      },
    ])
    window.desktop!.gitCreateBranch = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
      currentBranch = name

      return {
        directory: "C:\\Projects\\Atlas\\client",
        root: "C:\\Projects\\Atlas",
        branch: currentBranch,
        stdout: "",
        stderr: "",
        summary: `Created and switched to ${currentBranch}.`,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    const utilityBar = document.querySelector(".composer-utility-bar") as HTMLElement
    expect(utilityBar).not.toBeNull()

    fireEvent.click(within(utilityBar).getByRole("button", { name: "main" }))

    const branchSwitcher = await screen.findByRole("dialog", { name: "Git branch switcher" })
    fireEvent.click(within(branchSwitcher).getByRole("button", { name: "创建并检出新分支" }))

    const createDialog = await screen.findByRole("dialog", { name: "Create and checkout branch" })
    expect(within(createDialog).getByRole("button", { name: "取消" })).toBeInTheDocument()
    expect(within(createDialog).getByRole("button", { name: "创建并检出" })).toBeInTheDocument()

    fireEvent.change(within(createDialog).getByRole("textbox", { name: "分支名称" }), {
      target: {
        value: "feature/new-flow",
      },
    })
    fireEvent.click(within(createDialog).getByRole("button", { name: "创建并检出" }))

    await waitFor(() => {
      expect(window.desktop!.gitCreateBranch).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        name: "feature/new-flow",
      })
    })

    await waitFor(() => {
      expect(within(utilityBar).getByRole("button", { name: "feature/new-flow" })).toBeInTheDocument()
    })
  })

  it("opens the create-and-checkout branch dialog from the composer utility bar with the current branch labels", async () => {
    let currentBranch = "main"
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(async () => ({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: currentBranch,
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest:
        currentBranch === "main"
          ? {
              enabled: false,
              reason: "Switch to a feature branch before creating a pull request.",
            }
          : {
              enabled: true,
            },
      canCreateBranch: {
        enabled: true,
      },
    }))
    window.desktop!.gitListBranches = vi.fn().mockImplementation(async () => [
      {
        name: "main",
        kind: "local",
        current: currentBranch === "main",
      },
      {
        name: "feature/test",
        kind: "local",
        current: currentBranch === "feature/test",
      },
    ])
    window.desktop!.gitCreateBranch = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
      currentBranch = name

      return {
        directory: "C:\\Projects\\Atlas\\client",
        root: "C:\\Projects\\Atlas",
        branch: currentBranch,
        stdout: "",
        stderr: "",
        summary: `Created and switched to ${currentBranch}.`,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    const utilityBar = document.querySelector(".composer-utility-bar") as HTMLElement
    expect(utilityBar).not.toBeNull()

    fireEvent.click(within(utilityBar).getByRole("button", { name: "main" }))

    const branchSwitcher = await screen.findByRole("dialog", { name: "Git branch switcher" })
    fireEvent.click(within(branchSwitcher).getByRole("button", { name: "Create and switch branch" }))

    const createDialog = await screen.findByRole("dialog", { name: "Create and checkout branch" })
    expect(within(createDialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument()
    expect(within(createDialog).getByRole("button", { name: "Create and switch" })).toBeInTheDocument()

    fireEvent.change(within(createDialog).getByRole("textbox", { name: "Branch name" }), {
      target: {
        value: "feature/new-flow",
      },
    })
    fireEvent.click(within(createDialog).getByRole("button", { name: "Create and switch" }))

    await waitFor(() => {
      expect(window.desktop!.gitCreateBranch).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        name: "feature/new-flow",
      })
    })

    await waitFor(() => {
      expect(within(utilityBar).getByRole("button", { name: "feature/new-flow" })).toBeInTheDocument()
    })
  })

  it("keeps the branch switcher list in sync after creating a branch from the top git menu", async () => {
    let currentBranch = "main"
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockImplementation(async () => ({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: currentBranch,
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest:
        currentBranch === "main"
          ? {
              enabled: false,
              reason: "Switch to a feature branch before creating a pull request.",
            }
          : {
              enabled: true,
            },
      canCreateBranch: {
        enabled: true,
      },
    }))
    window.desktop!.gitListBranches = vi.fn().mockImplementation(async () => {
      const branches = [
        {
          name: "main",
          kind: "local" as const,
          current: currentBranch === "main",
        },
      ]

      if (currentBranch !== "main") {
        branches.push({
          name: currentBranch,
          kind: "local" as const,
          current: true,
        })
      }

      return branches
    })
    window.desktop!.gitCreateBranch = vi.fn().mockImplementation(async ({ name }: { name: string }) => {
      currentBranch = name

      return {
        directory: "C:\\Projects\\Atlas\\client",
        root: "C:\\Projects\\Atlas",
        branch: currentBranch,
        stdout: "",
        stderr: "",
        summary: `Created and switched to ${currentBranch}.`,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    fireEvent.click(await screen.findByRole("button", { name: "Git" }))

    const gitQuickMenu = await screen.findByRole("dialog", { name: "Git quick menu" })
    fireEvent.click(within(gitQuickMenu).getByRole("button", { name: /Create branch/i }))
    fireEvent.change(screen.getByRole("textbox", { name: "Branch name" }), {
      target: {
        value: "feature/top-menu-sync",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Create branch" }))

    await waitFor(() => {
      expect(window.desktop!.gitCreateBranch).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
        name: "feature/top-menu-sync",
      })
    })

    await waitFor(() => {
      expect(window.desktop!.gitListBranches).toHaveBeenCalledTimes(1)
    })

    const utilityBar = document.querySelector(".composer-utility-bar") as HTMLElement
    expect(utilityBar).not.toBeNull()

    await waitFor(() => {
      expect(within(utilityBar).getByRole("button", { name: "feature/top-menu-sync" })).toBeInTheDocument()
    })

    fireEvent.click(within(utilityBar).getByRole("button", { name: "feature/top-menu-sync" }))

    const branchSwitcher = await screen.findByRole("dialog", { name: "Git branch switcher" })
    expect(within(branchSwitcher).getByRole("button", { name: /feature\/top-menu-sync/ })).toBeInTheDocument()
  })

  it("hides the git button when the active workspace is not a git repository", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Plain\\client",
        directory: "C:\\Projects\\Plain\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-plain",
          name: "Plain",
          worktree: "C:\\Projects\\Plain",
        },
        sessions: [
          {
            id: "session-plain-review",
            projectID: "project-plain",
            directory: "C:\\Projects\\Plain\\client",
            title: "Plain review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Plain\\client",
      root: null,
      branch: null,
      defaultBranch: null,
      isGitRepo: false,
      canCommit: {
        enabled: false,
        reason: "Not a git repository.",
      },
      canStageAllCommit: {
        enabled: false,
        reason: "Not a git repository.",
      },
      canPush: {
        enabled: false,
        reason: "Not a git repository.",
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Not a git repository.",
      },
      canCreateBranch: {
        enabled: false,
        reason: "Not a git repository.",
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-plain",
        directory: "C:\\Projects\\Plain\\client",
      })
    })

    expect(screen.queryByRole("button", { name: "Git" })).not.toBeInTheDocument()
    expect(document.querySelector(".composer-utility-git-branch-button")).toBeNull()
  })

  it("disables branch creation in the git quick menu before the first commit", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: null,
      isGitRepo: true,
      canCommit: {
        enabled: false,
        reason: "Stage changes before committing.",
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: false,
        reason: "Create the first commit before pushing this branch.",
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Create the first commit before opening a pull request.",
      },
      canCreateBranch: {
        enabled: false,
        reason: "Create the first commit before creating a branch.",
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    fireEvent.click(await screen.findByRole("button", { name: "Git" }))

    const gitQuickMenu = await screen.findByRole("dialog", { name: "Git quick menu" })
    const createBranchButton = within(gitQuickMenu).getByRole("button", { name: /Create branch/i })

    expect(createBranchButton).toBeDisabled()
    expect(createBranchButton).toHaveTextContent("Create the first commit before creating a branch.")
    expect(within(gitQuickMenu).getByText("Current branch: main")).toBeInTheDocument()
  })

  it("loads folder and session lists into the sidebar on startup", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
      {
        id: "C:\\Projects\\Beacon\\server",
        directory: "C:\\Projects\\Beacon\\server",
        name: "server",
        created: 2,
        updated: 5,
        project: {
          id: "project-beacon",
          name: "Beacon",
          worktree: "C:\\Projects\\Beacon",
        },
        sessions: [
          {
            id: "session-beacon-ship",
            projectID: "project-beacon",
            directory: "C:\\Projects\\Beacon\\server",
            title: "Beacon ship",
            created: 3,
            updated: 5,
          },
        ],
      },
    ])

    render(<App />)

    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()
    expect(screen.getAllByText("Atlas").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Atlas review" })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    })
    expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
  })

  it("marks missing startup folders as deleted and skips watching them", async () => {
    window.desktop!.updateWorkspaceWatchDirectories = vi.fn().mockResolvedValue({
      directories: ["C:\\Projects\\Atlas\\client"],
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Ghost\\client",
        directory: "C:\\Projects\\Ghost\\client",
        name: "ghost-client",
        exists: false,
        created: 1,
        updated: 30,
        project: {
          id: "project-ghost",
          name: "Ghost",
          worktree: "C:\\Projects\\Ghost",
        },
        sessions: [
          {
            id: "session-ghost-review",
            projectID: "project-ghost",
            directory: "C:\\Projects\\Ghost\\client",
            title: "Ghost review",
            created: 10,
            updated: 30,
          },
        ],
      },
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        exists: true,
        created: 2,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 3,
            updated: 20,
          },
        ],
      },
    ])

    render(<App />)

    expect(await screen.findByText("已删除")).toBeInTheDocument()
    expect(screen.getAllByText("Ghost").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Create session for ghost-client" })).toBeDisabled()
    await waitFor(() => {
      expect(window.desktop!.updateWorkspaceWatchDirectories).toHaveBeenCalledWith({
        directories: ["C:\\Projects\\Atlas\\client"],
      })
    })
  })

  it("rebuilds the active session history from the server after startup", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Recover the server session" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [{ id: "part-text-1", type: "text", text: "History restored from backend" }],
      },
    ])

    render(<App />)

    expect(await screen.findByText("Recover the server session")).toBeInTheDocument()
    expect(screen.getByText("History restored from backend")).toBeInTheDocument()
    expect(window.desktop!.agentSession!.loadHistory).toHaveBeenCalledWith({
      backendSessionID: "session-atlas-review",
    })
  })

  it("loads session diff summaries into the inspector and renders patch trace items from history", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Ship the toolbar update" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          {
            id: "part-patch-1",
            type: "patch",
            hash: "snapshot-2",
            files: ["src/App.tsx", "src/styles.css"],
            summary: {
              files: 2,
              additions: 8,
              deletions: 3,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 5,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 3,
                deletions: 2,
              },
            ],
          },
        ],
      },
    ])
    window.desktop!.getSessionDiff = vi.fn().mockResolvedValue({
      title: "2 file changes (+8 -3)",
      stats: {
        files: 2,
        additions: 8,
        deletions: 3,
      },
      diffs: [
        {
          file: "src/App.tsx",
          additions: 5,
          deletions: 1,
          patch: [
            "diff --git a/src/App.tsx b/src/App.tsx",
            "index 1111111..2222222 100644",
            "--- a/src/App.tsx",
            "+++ b/src/App.tsx",
            "@@ -1,2 +1,2 @@",
            '-import { OldToolbar } from "./toolbar"',
            '+import { NewToolbar } from "./toolbar"',
            ' export function App() {',
          ].join("\n"),
        },
        {
          file: "src/styles.css",
          additions: 3,
          deletions: 2,
          patch: [
            "diff --git a/src/styles.css b/src/styles.css",
            "index 3333333..4444444 100644",
            "--- a/src/styles.css",
            "+++ b/src/styles.css",
            "@@ -12,2 +12,3 @@",
            "-.toolbar { display: flex; }",
            "+.toolbar {",
            "+  display: grid;",
            "+}",
          ].join("\n"),
        },
      ],
    })
    window.desktop!.restoreWorkspaceDiffFile = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      file: "src/App.tsx",
    })

    const { container } = render(<App />)

    expect(await screen.findByText("Ship the toolbar update")).toBeInTheDocument()
    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    expect(within(inspector).queryByText("Workspace diff")).not.toBeInTheDocument()
    expect(within(inspector).queryByText("2 file changes (+8 -3)")).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("searchbox", { name: "Search workspace diff files" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("group", { name: "Workspace diff filters" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("button", { name: "All" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("button", { name: "Added" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("button", { name: "Modified" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("button", { name: "Deleted" })).not.toBeInTheDocument()
    expect(within(inspector).queryByRole("button", { name: "Renamed" })).not.toBeInTheDocument()
    expect(screen.getAllByText("src/App.tsx").length).toBeGreaterThan(0)
    expect(screen.getAllByText("src/styles.css").length).toBeGreaterThan(0)
    expect(within(inspector).getByText("+5")).toBeInTheDocument()
    expect(within(inspector).getByText("-1")).toBeInTheDocument()
    expect(within(inspector).getByRole("button", { name: "Restore src/App.tsx" })).toBeInTheDocument()
    expect(screen.queryByText("@@ -1,2 +1,2 @@")).not.toBeInTheDocument()
    expect(screen.queryByText("diff --git a/src/App.tsx b/src/App.tsx")).not.toBeInTheDocument()

    fireEvent.click(within(inspector).getByRole("button", { name: "src/App.tsx" }))

    expect(screen.queryByText("@@ -1,2 +1,2 @@")).not.toBeInTheDocument()
    expect(screen.getByText('import { OldToolbar } from "./toolbar"')).toBeInTheDocument()
    expect(screen.getByText('import { NewToolbar } from "./toolbar"')).toBeInTheDocument()
    expect(container.querySelectorAll(".right-sidebar-diff-row").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-add").length).toBeGreaterThan(0)
    expect(container.querySelectorAll(".right-sidebar-diff-row.is-remove").length).toBeGreaterThan(0)
    expect(window.desktop!.getSessionDiff).toHaveBeenCalledWith({
      sessionID: "session-atlas-review",
    })

    const getSessionDiff = window.desktop!.getSessionDiff as ReturnType<typeof vi.fn>
    const diffCallsBeforeRestore = getSessionDiff.mock.calls.length
    fireEvent.click(within(inspector).getByRole("button", { name: "Restore src/App.tsx" }))

    await waitFor(() => {
      expect(window.desktop!.restoreWorkspaceDiffFile).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Atlas\\client",
        file: "src/App.tsx",
      })
    })
    await waitFor(() => {
      expect(getSessionDiff.mock.calls.length).toBeGreaterThan(diffCallsBeforeRestore)
    })
  })

  it("renders assistant trace blocks in backend order instead of grouping by type", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Audit the release flow" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Inspecting workspace." },
          {
            id: "tool-1",
            type: "tool",
            tool: "npm test",
            state: {
              status: "completed",
              output: "ok",
            },
          },
          { id: "reasoning-2", type: "reasoning", text: "Evaluating test output." },
          {
            id: "tool-2",
            type: "tool",
            tool: "replace-text",
            state: {
              status: "completed",
              output: "README updated",
            },
          },
          {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 2,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
            ],
          },
          {
            id: "patch-2",
            type: "patch",
            summary: {
              files: 2,
              additions: 3,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 1,
                deletions: 0,
              },
            ],
          },
          { id: "text-1", type: "text", text: "All checks passed." },
        ],
      },
    ])

    render(<App />)

    const assistantTurn = (await screen.findByText("All checks passed.")).closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    const sectionElements = Array.from((assistantTurn as HTMLElement).querySelectorAll(".assistant-section"))
    const sectionTitles = sectionElements.map((section) => section.getAttribute("aria-label"))

    expect(sectionTitles).toEqual(["Reasoning", "Tools", "Reasoning", "Tools", "Response", "File Changes"])
    expect((assistantTurn as HTMLElement).querySelector(".assistant-section-header")).toBeNull()

    expect(within(sectionElements[0] as HTMLElement).getByText("Inspecting workspace.")).toBeInTheDocument()
    expect(within(sectionElements[0] as HTMLElement).queryByRole("button", { name: /npm test.*completed/i })).not.toBeInTheDocument()

    expect(within(sectionElements[1] as HTMLElement).getByRole("button", { name: /npm test.*completed/i })).toBeInTheDocument()
    expect(within(sectionElements[1] as HTMLElement).queryByText("Inspecting workspace.")).not.toBeInTheDocument()

    expect(within(sectionElements[2] as HTMLElement).getByText("Evaluating test output.")).toBeInTheDocument()
    expect(within(sectionElements[2] as HTMLElement).queryByRole("button", { name: /replace-text.*completed/i })).not.toBeInTheDocument()

    expect(within(sectionElements[3] as HTMLElement).getByRole("button", { name: /replace-text.*completed/i })).toBeInTheDocument()
    expect(within(sectionElements[3] as HTMLElement).queryByText("Evaluating test output.")).not.toBeInTheDocument()

    expect(within(sectionElements[4] as HTMLElement).getByText("All checks passed.")).toBeInTheDocument()
    expect(within(sectionElements[4] as HTMLElement).queryByText("Inspecting workspace.")).not.toBeInTheDocument()

    expect(within(sectionElements[5] as HTMLElement).getByText("2 file changes (+3 -1)")).toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).queryByText("1 file change (+2 -1)")).not.toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).getByText(/src\/App\.tsx \(\+2 -1\).*src\/styles\.css \(\+1 -0\)/)).toBeInTheDocument()
    expect(within(sectionElements[5] as HTMLElement).queryByText("All checks passed.")).not.toBeInTheDocument()
  })

  it("shows one file-change summary at the end of a consecutive assistant cycle", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Complete the release checklist" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          { id: "reasoning-1", type: "reasoning", text: "Preparing the first change set." },
          { id: "text-1", type: "text", text: "Created the first draft of the release notes." },
          {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 4,
              deletions: 0,
            },
            changes: [
              {
                file: "docs/release-notes.md",
                additions: 4,
                deletions: 0,
              },
            ],
          },
        ],
      },
      {
        info: {
          id: "msg-assistant-2",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 102,
        },
        parts: [
          { id: "reasoning-2", type: "reasoning", text: "Running the final verification pass." },
          {
            id: "tool-2",
            type: "tool",
            tool: "npm test",
            state: {
              status: "completed",
              output: "ok",
            },
          },
          { id: "text-2", type: "text", text: "Finished the cycle." },
        ],
      },
    ])

    render(<App />)

    const firstAssistantTurn = (await screen.findByText("Created the first draft of the release notes.")).closest(
      ".assistant-turn",
    ) as HTMLElement | null
    const finalAssistantTurn = (await screen.findByText("Finished the cycle.")).closest(".assistant-turn") as HTMLElement | null

    expect(firstAssistantTurn).not.toBeNull()
    expect(finalAssistantTurn).not.toBeNull()
    expect(firstAssistantTurn).not.toBe(finalAssistantTurn)

    expect(within(firstAssistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    const finalFileChangeSection = within(finalAssistantTurn as HTMLElement).getByRole("region", { name: "File Changes" })
    expect(within(finalFileChangeSection).getByText("1 file change (+4 -0)")).toBeInTheDocument()
    expect(within(finalFileChangeSection).getByText("docs/release-notes.md (+4 -0)")).toBeInTheDocument()
    expect(screen.getAllByRole("region", { name: "File Changes" })).toHaveLength(1)
  })

  it("replays detached backend turns from the session event stream", async () => {
    let sessionStreamListener: DesktopAgentSessionEventListener | undefined

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    const detachedTurnHistory = [
      {
        info: {
          id: "msg-detached-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 200,
        },
        parts: [
          {
            id: "tool-detached",
            type: "tool",
            tool: "read-file",
            state: {
              status: "waiting-approval",
              title: "Read repo config",
            },
          },
        ],
      },
    ]
    window.desktop!.agentSession!.loadHistory = vi
      .fn()
      .mockResolvedValue(detachedTurnHistory)
      .mockResolvedValueOnce([])
    window.desktop!.agentSession!.loadPermissionRequests = vi.fn().mockResolvedValue([])
    window.desktop!.agentSession!.subscribe = vi.fn().mockResolvedValue({
      backendSessionID: "session-atlas-review",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      sessionStreamListener = listener
      return vi.fn()
    })

    window.desktop!.gitGetCapabilities = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      defaultBranch: "main",
      isGitRepo: true,
      canCommit: {
        enabled: true,
      },
      canStageAllCommit: {
        enabled: true,
      },
      canPush: {
        enabled: true,
      },
      canCreatePullRequest: {
        enabled: false,
        reason: "Switch to a feature branch before creating a pull request.",
      },
      canCreateBranch: {
        enabled: true,
      },
    })
    window.desktop!.gitCommit = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Committed to main.",
    })
    window.desktop!.gitPush = vi.fn().mockResolvedValue({
      directory: "C:\\Projects\\Atlas\\client",
      root: "C:\\Projects\\Atlas",
      branch: "main",
      stdout: "",
      stderr: "",
      summary: "Pushed main.",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.subscribe).toHaveBeenCalledWith({
        uiSessionID: "session-atlas-review",
        backendSessionID: "session-atlas-review",
      })
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalled()
    })

    act(() => {
      sessionStreamListener?.(createSubscriptionStreamEvent({
        backendSessionID: "session-atlas-review",
        id: "200:turn-detached:1",
        event: "started",
        data: {
          sessionID: "session-atlas-review",
          turnID: "turn-detached",
          cursor: "200:turn-detached:1",
        },
      }))
      sessionStreamListener?.(createSubscriptionStreamEvent({
        backendSessionID: "session-atlas-review",
        id: "201:turn-detached:2",
        event: "part",
        data: {
          sessionID: "session-atlas-review",
          turnID: "turn-detached",
          cursor: "201:turn-detached:2",
          part: {
            id: "tool-detached",
            type: "tool",
            tool: "read-file",
            state: {
              status: "waiting-approval",
              title: "Read repo config",
            },
          },
        },
      }))
      sessionStreamListener?.(createSubscriptionStreamEvent({
        backendSessionID: "session-atlas-review",
        id: "202:turn-detached:3",
        event: "done",
        data: {
          sessionID: "session-atlas-review",
          turnID: "turn-detached",
          cursor: "202:turn-detached:3",
          status: "blocked",
          parts: [
            {
              id: "tool-detached",
              type: "tool",
              tool: "read-file",
              state: {
                status: "waiting-approval",
                title: "Read repo config",
              },
            },
          ],
        },
      }))
    })

    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenCalledTimes(2)
    })

    await screen.findByRole("button", { name: /read-file.*waiting approval/i })
  })

  it("streams the response immediately while keeping file changes hidden until completion", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let activeStreamID = ""
    let activeSessionID = ""

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        activeStreamID = input.clientTurnID
        activeSessionID = input.backendSessionID

        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "started",
          data: { sessionID: input.backendSessionID },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "delta",
          data: { kind: "reasoning", delta: "Planning live update." },
        }))

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Show live output")
    fireEvent.click(getComposerSendButton())

    const reasoningText = await screen.findByText("Planning live update.")
    const assistantTurn = reasoningText.closest(".assistant-turn") as HTMLElement | null

    expect(assistantTurn).not.toBeNull()

    const reasoningSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "Reasoning" })
    expect(within(reasoningSection).getByText("Planning live update.")).toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "Response" })).not.toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    act(() => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "delta",
        data: { kind: "text", delta: "Streaming answer" },
      }))
    })

    expect(await screen.findByText("Streaming answer")).toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()

    act(() => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "part",
        data: {
          part: {
            id: "patch-1",
            type: "patch",
            summary: {
              files: 1,
              additions: 2,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
            ],
          },
        },
      }))
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "part",
        data: {
          part: {
            id: "patch-2",
            type: "patch",
            summary: {
              files: 2,
              additions: 3,
              deletions: 1,
            },
            changes: [
              {
                file: "src/App.tsx",
                additions: 2,
                deletions: 1,
              },
              {
                file: "src/styles.css",
                additions: 1,
                deletions: 0,
              },
            ],
          },
        },
      }))
    })

    expect(within(assistantTurn as HTMLElement).queryByRole("region", { name: "File Changes" })).not.toBeInTheDocument()
    expect(within(assistantTurn as HTMLElement).getByRole("region", { name: "Response" })).toBeInTheDocument()

    act(() => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "done",
        data: {
          sessionID: activeSessionID,
          parts: [
            { id: "reasoning-1", type: "reasoning", text: "Planning live update." },
            {
              id: "patch-1",
              type: "patch",
              summary: {
                files: 1,
                additions: 2,
                deletions: 1,
              },
              changes: [
                {
                  file: "src/App.tsx",
                  additions: 2,
                  deletions: 1,
                },
              ],
            },
            {
              id: "patch-2",
              type: "patch",
              summary: {
                files: 2,
                additions: 3,
                deletions: 1,
              },
              changes: [
                {
                  file: "src/App.tsx",
                  additions: 2,
                  deletions: 1,
                },
                {
                  file: "src/styles.css",
                  additions: 1,
                  deletions: 0,
                },
              ],
            },
            { id: "text-1", type: "text", text: "Streaming answer" },
          ],
        },
      }))
    })

    await waitFor(() => {
      expect(within(assistantTurn as HTMLElement).getByRole("region", { name: "Response" })).toBeInTheDocument()
    })

    const responseSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "Response" })
    expect(within(responseSection).getByText("Streaming answer")).toBeInTheDocument()

    const fileChangeSection = within(assistantTurn as HTMLElement).getByRole("region", { name: "File Changes" })
    expect(within(fileChangeSection).getByText("2 file changes (+3 -1)")).toBeInTheDocument()
    expect(within(fileChangeSection).queryByText("1 file change (+2 -1)")).not.toBeInTheDocument()
    expect(within(fileChangeSection).getByText(/src\/App\.tsx \(\+2 -1\).*src\/styles\.css \(\+1 -0\)/)).toBeInTheDocument()

    const reasoningPosition = reasoningSection.compareDocumentPosition(fileChangeSection)
    const responsePosition = responseSection.compareDocumentPosition(fileChangeSection)
    expect(reasoningPosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(responsePosition & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("reloads session history from the server when switching sessions in the sidebar", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
          {
            id: "session-atlas-followup",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas followup",
            created: 11,
            updated: 19,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-user-1",
            sessionID: "session-atlas-review",
            role: "user",
            created: 100,
          },
          parts: [{ id: "part-user-1", type: "text", text: "First session prompt" }],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-user-2",
            sessionID: "session-atlas-followup",
            role: "user",
            created: 110,
          },
          parts: [{ id: "part-user-2", type: "text", text: "Second session prompt" }],
        },
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-followup",
            role: "assistant",
            created: 111,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Second session reply" }],
        },
      ])

    render(<App />)

    expect(await screen.findByText("First session prompt")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Atlas followup" }))

    expect(await screen.findByText("Second session prompt")).toBeInTheDocument()
    expect(screen.getByText("Second session reply")).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenNthCalledWith(1, {
        backendSessionID: "session-atlas-review",
      })
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenNthCalledWith(2, {
        backendSessionID: "session-atlas-followup",
      })
    })
  })

  it("renders AskUserQuestion cards and sends quick replies without clearing the composer", async () => {
    const attachmentCapableModel = {
      id: "gpt-4o-mini",
      providerID: "openai",
      name: "GPT-4o mini",
      status: "active",
      available: true,
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: true,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: true,
          video: false,
          pdf: true,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
      limit: {
        context: 128000,
        output: 8192,
      },
    }

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
      items: [attachmentCapableModel],
      selection: {},
      effectiveModel: attachmentCapableModel,
    })
    window.desktop!.pickComposerAttachments = vi.fn().mockResolvedValue(["C:\\Refs\\brief.pdf"])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 100,
        },
        parts: [{ id: "part-user-1", type: "text", text: "Deploy the app" }],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 101,
        },
        parts: [
          {
            id: "tool-question-1",
            type: "tool",
            tool: "AskUserQuestion",
            state: {
              status: "completed",
              output: "{\"status\":\"asked\"}",
              metadata: {
                kind: "ask-user-question",
                version: 1,
                questionID: "que_deploy_target",
                header: "Deployment target",
                question: "Where should I deploy this app?",
                options: [
                  {
                    label: "Vercel",
                    value: "vercel",
                    description: "Best fit for the current setup.",
                  },
                  {
                    label: "Cloudflare",
                    value: "cloudflare",
                  },
                ],
                allowFreeform: true,
                multiple: false,
                required: true,
              },
            },
          },
        ],
      },
    ])

    render(<App />)

    const questionCard = await screen.findByRole("region", { name: "Deployment target" })
    expect(within(questionCard).getByText("Where should I deploy this app?")).toBeInTheDocument()
    expect(within(questionCard).getByRole("button", { name: "Vercel" })).toBeInTheDocument()
    expect(within(questionCard).getByRole("button", { name: "Cloudflare" })).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getProjectModels).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
      expect(screen.getByRole("button", { name: "Add attachments" })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add attachments" }))

    expect(await screen.findByText("brief.pdf")).toBeInTheDocument()

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })
    setComposerDraftValue(draftInput, "keep this draft")
    expectComposerDraftValue(draftInput, "keep this draft")

    fireEvent.click(within(questionCard).getByRole("button", { name: "Vercel" }))

    await waitFor(() => {
      expect(window.desktop!.agentSession!.answerQuestion).toHaveBeenCalled()
    })

    const answerQuestion = window.desktop!.agentSession!.answerQuestion
    expect(answerQuestion).toBeDefined()
    if (!answerQuestion) throw new Error("Expected answerQuestion mock")

    const answerInput = vi.mocked(answerQuestion).mock.calls.at(-1)?.[0]
    expect(answerInput).toBeDefined()
    if (!answerInput) throw new Error("Expected answerQuestion payload")

    expect(answerInput).toEqual(expect.objectContaining({
      backendSessionID: "session-atlas-review",
      questionID: "que_deploy_target",
      selectedOptions: ["vercel"],
    }))
    expect(answerInput).not.toHaveProperty("attachments")
    expect(screen.getByText("brief.pdf")).toBeInTheDocument()
    expectComposerDraftValue(draftInput, "keep this draft")
    expect(screen.queryByText(/^vercel$/)).not.toBeInTheDocument()
    expect(within(questionCard).queryByText("Answered.")).not.toBeInTheDocument()
  })

  it("shows pending permission requests for the active session and blocks sending until resolved", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([])
    window.desktop!.agentSession!.loadPermissionRequests = vi.fn().mockResolvedValue([
      createPermissionRequest({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
        prompt: {
          details: {
            paths: ["README.md"],
            workdir: "C:\\Projects\\Atlas\\client",
          },
        },
      }),
    ])

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    expect(approvalPanel.closest(".thread-shell")).not.toBeNull()
    expect(within(approvalPanel).getByRole("heading", { name: "Read repo config" })).toBeInTheDocument()
    expect(within(approvalPanel).getByText("Read README.md")).toBeInTheDocument()
    expect(getComposerSendButton()).toBeDisabled()
    expect(within(approvalPanel).getByRole("button", { name: "Allow Read repo config" })).toBeInTheDocument()
    expect(within(approvalPanel).getByRole("button", { name: "Deny Read repo config" })).toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadPermissionRequests).toHaveBeenCalledWith({
        backendSessionID: "session-atlas-review",
      })
    })
  })

  it("approves a pending permission request, resumes the session, and refreshes history", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 111,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Approval recorded and session resumed." }],
        },
      ])
    window.desktop!.agentSession!.loadPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "message-atlas-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
    window.desktop!.agentSession!.respondPermissionRequest = vi.fn().mockResolvedValue(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow Read repo config" }))

    await waitFor(() => {
      expect(window.desktop!.agentSession!.respondPermissionRequest).toHaveBeenCalledWith({
        requestID: "permission-atlas-1",
        decision: "allow",
        note: undefined,
        resume: false,
      })
      expect(window.desktop!.agentSession!.resumeTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-atlas-review",
        clientTurnID: expect.any(String),
      }))
    })
    expect(await screen.findByText("Approval recorded and session resumed.")).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Tool approval request" })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenNthCalledWith(2, {
        backendSessionID: "session-atlas-review",
      })
      expect(window.desktop!.agentSession!.loadPermissionRequests).toHaveBeenNthCalledWith(2, {
        backendSessionID: "session-atlas-review",
      })
    })
  })

  it("streams resumed output immediately after approval and clears the waiting tool state first", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let finishResumeStream: (() => void) | undefined

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi
      .fn()
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "waiting-approval",
                approvalID: "approval-atlas-1",
                input: {
                  path: "README.md",
                },
                title: "Read repo config",
                time: {
                  start: 90,
                },
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "completed",
                input: {
                  path: "README.md",
                },
                output: "README loaded",
                title: "Read repo config",
                time: {
                  start: 90,
                  end: 120,
                },
              },
            },
          ],
        },
      ])
      .mockResolvedValueOnce([
        {
          info: {
            id: "msg-assistant-1",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 100,
          },
          parts: [
            {
              id: "tool-part-1",
              type: "tool",
              tool: "read-file",
              state: {
                status: "completed",
                input: {
                  path: "README.md",
                },
                output: "README loaded",
                title: "Read repo config",
                time: {
                  start: 90,
                  end: 120,
                },
              },
            },
          ],
        },
        {
          info: {
            id: "msg-assistant-2",
            sessionID: "session-atlas-review",
            role: "assistant",
            created: 121,
          },
          parts: [{ id: "part-text-2", type: "text", text: "Resumed answer" }],
        },
      ])
    window.desktop!.agentSession!.loadPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "msg-assistant-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
    window.desktop!.agentSession!.respondPermissionRequest = vi.fn().mockResolvedValue(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "msg-assistant-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.resumeTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
      }) => {
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "started",
          data: { sessionID: input.backendSessionID },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "delta",
          data: { kind: "text", delta: "Resumed answer" },
        }))

        await new Promise<void>((resolve) => {
          finishResumeStream = () => {
            streamListener?.(createRequestStreamEvent({
              backendSessionID: input.backendSessionID,
              clientTurnID: input.clientTurnID,
              event: "done",
              data: {
                sessionID: input.backendSessionID,
                parts: [{ id: "part-text-2", type: "text", text: "Resumed answer" }],
              },
            }))
            resolve()
          }
        })

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    const toolTraceToggle = await screen.findByRole("button", { name: /read-file.*waiting approval/i })
    expect(toolTraceToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText("Waiting for permission approval before the tool can continue.")).not.toBeInTheDocument()

    fireEvent.click(toolTraceToggle)

    expect(toolTraceToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.queryByText("Waiting for permission approval before the tool can continue.")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /read-file input/i }))

    expect(await screen.findByText("Waiting for permission approval before the tool can continue.")).toBeInTheDocument()

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow Read repo config" }))

    await waitFor(() => {
      expect(window.desktop!.agentSession!.respondPermissionRequest).toHaveBeenCalledWith({
        requestID: "permission-atlas-1",
        decision: "allow",
        note: undefined,
        resume: false,
      })
      expect(window.desktop!.agentSession!.resumeTurn).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(await screen.findByRole("button", { name: /read-file output/i }))
    expect(await screen.findByText("README loaded")).toBeInTheDocument()
    expect(screen.queryByText("Waiting for permission approval before the tool can continue.")).not.toBeInTheDocument()
    expect(screen.getByText("Resumed answer")).toBeInTheDocument()
    expect(getComposerSendButton()).toBeDisabled()

    act(() => {
      finishResumeStream?.()
    })

    expect(await screen.findByText("Resumed answer")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadHistory).toHaveBeenNthCalledWith(3, {
        backendSessionID: "session-atlas-review",
      })
      expect(getComposerSendButton()).toBeEnabled()
    })
  })

  it("hides the approval dialog immediately after a decision is chosen", async () => {
    const response = createDeferred<PermissionResolveResult>()

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([])
    window.desktop!.agentSession!.loadPermissionRequests = vi
      .fn()
      .mockResolvedValueOnce([
        createPermissionRequest({
          id: "permission-atlas-1",
          approvalID: "approval-atlas-1",
          sessionID: "session-atlas-review",
          messageID: "message-atlas-1",
          toolCallID: "toolcall-atlas-1",
          projectID: "project-atlas",
          createdAt: 100,
          prompt: {
            details: {
              paths: ["README.md"],
              workdir: "C:\\Projects\\Atlas\\client",
            },
          },
        }),
      ])
      .mockResolvedValueOnce([])
    window.desktop!.agentSession!.respondPermissionRequest = vi.fn().mockReturnValue(response.promise)

    render(<App />)

    const approvalPanel = await screen.findByRole("region", { name: "Tool approval request" })
    fireEvent.click(within(approvalPanel).getByRole("button", { name: "Allow Read repo config" }))

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Tool approval request" })).not.toBeInTheDocument()
    })
    expect(getComposerSendButton()).toBeDisabled()

    response.resolve(
      createPermissionResolveResult({
        id: "permission-atlas-1",
        approvalID: "approval-atlas-1",
        sessionID: "session-atlas-review",
        messageID: "message-atlas-1",
        toolCallID: "toolcall-atlas-1",
        projectID: "project-atlas",
        createdAt: 100,
      }),
    )

    await waitFor(() => {
      expect(window.desktop!.agentSession!.loadPermissionRequests).toHaveBeenNthCalledWith(2, {
        backendSessionID: "session-atlas-review",
      })
    })
  })

  it("does not show seed workspaces when startup folder loading fails", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockRejectedValue(new Error("backend unavailable"))

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
  })

  it("opens a folder from a selected directory and appends it to the sidebar", async () => {
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue("C:\\Projects\\Orion\\client")
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      created: 1,
      updated: 2,
      project: {
        id: "project-orion",
        name: "Orion",
        worktree: "C:\\Projects\\Orion",
      },
      sessions: [],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    await waitFor(() => {
      expect(window.desktop!.pickProjectDirectory).toHaveBeenCalledTimes(1)
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Orion\\client",
      })
    })
    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()
    expect(screen.getAllByText("Orion").length).toBeGreaterThan(0)
  })

  it("reuses the existing create session tab when opening a folder without sessions", async () => {
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue("C:\\Projects\\Orion\\client")
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      created: 1,
      updated: 2,
      project: {
        id: "project-orion",
        name: "Orion",
        worktree: "C:\\Projects\\Orion",
      },
      sessions: [],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    expect(await screen.findByRole("combobox", { name: "Session project" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    await waitFor(() => {
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Orion\\client",
      })
    })

    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to create session tab 2" })).toBeNull()
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Orion\\client")
  })

  it("keeps a newly opened folder when startup folder loading resolves afterwards", async () => {
    const startupLoad = createDeferred<LoadedFolderWorkspace[]>()
    window.desktop!.listFolderWorkspaces = vi.fn().mockImplementation(() => startupLoad.promise)
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue("C:\\Projects\\Orion\\client")
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue({
      id: "C:\\Projects\\Orion\\client",
      directory: "C:\\Projects\\Orion\\client",
      name: "client",
      created: 1,
      updated: 2,
      project: {
        id: "project-orion",
        name: "Orion",
        worktree: "C:\\Projects\\Orion",
      },
      sessions: [],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    expect(await screen.findByRole("button", { name: "client" })).toBeInTheDocument()

    await act(async () => {
      startupLoad.resolve([])
      await startupLoad.promise
    })

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "client" })).toBeInTheDocument()
    })
    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
  })

  it("waits for the initial workspace load before requesting project-specific composer data", async () => {
    const startupLoad = createDeferred<LoadedFolderWorkspace[]>()
    window.desktop!.listFolderWorkspaces = vi.fn().mockImplementation(() => startupLoad.promise)

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })

    expect(window.desktop!.getProjectModels).not.toHaveBeenCalled()
    expect(window.desktop!.getProjectSkills).not.toHaveBeenCalled()
    expect(window.desktop!.getProjectSkillSelection).not.toHaveBeenCalled()
    expect(window.desktop!.getGlobalMcpServers).not.toHaveBeenCalled()
    expect(window.desktop!.getProjectMcpSelection).not.toHaveBeenCalled()

    await act(async () => {
      startupLoad.resolve([
        {
          id: "C:\\Projects\\Atlas\\app",
          directory: "C:\\Projects\\Atlas\\app",
          name: "app",
          created: 1,
          updated: 2,
          project: {
            id: "project-atlas",
            name: "Atlas",
            worktree: "C:\\Projects\\Atlas",
          },
          sessions: [],
        },
      ])
      await startupLoad.promise
    })

    await waitFor(() => {
      expect(window.desktop!.getProjectModels).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
      expect(window.desktop!.getProjectSkills).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
      expect(window.desktop!.getProjectSkillSelection).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
      expect(window.desktop!.getProjectMcpSelection).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
    })

    expect(window.desktop!.getGlobalMcpServers).toHaveBeenCalledTimes(1)
  })

  it("waits for the initial workspace load before starting git and file watchers", async () => {
    const startupLoad = createDeferred<LoadedFolderWorkspace[]>()
    window.desktop!.listFolderWorkspaces = vi.fn().mockImplementation(() => startupLoad.promise)
    window.desktop!.updateWorkspaceWatchDirectories = vi.fn().mockResolvedValue({
      directories: [],
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
    })

    expect(window.desktop!.updateWorkspaceWatchDirectories).not.toHaveBeenCalled()
    expect(window.desktop!.gitGetCapabilities).not.toHaveBeenCalled()

    await act(async () => {
      startupLoad.resolve([
        {
          id: "C:\\Projects\\Atlas\\client",
          directory: "C:\\Projects\\Atlas\\client",
          name: "client",
          created: 1,
          updated: 2,
          project: {
            id: "project-atlas",
            name: "Atlas",
            worktree: "C:\\Projects\\Atlas",
          },
          sessions: [
            {
              id: "session-atlas-review",
              projectID: "project-atlas",
              directory: "C:\\Projects\\Atlas\\client",
              title: "Atlas review",
              created: 1,
              updated: 2,
            },
          ],
        },
      ])
      await startupLoad.promise
    })

    await screen.findByRole("button", { name: "Atlas review" })

    await waitFor(() => {
      expect(window.desktop!.updateWorkspaceWatchDirectories).toHaveBeenCalledWith({
        directories: ["C:\\Projects\\Atlas\\client"],
      })
    })
    await waitFor(() => {
      expect(window.desktop!.gitGetCapabilities).toHaveBeenCalledWith({
        projectID: "project-atlas",
        directory: "C:\\Projects\\Atlas\\client",
      })
    })
  })

  it("shows each newly opened folder and keeps only the latest one selected", async () => {
    window.desktop!.pickProjectDirectory = vi
      .fn()
      .mockResolvedValueOnce("C:\\Projects\\Orion\\client")
      .mockResolvedValueOnce("C:\\Projects\\Nova\\server")
    window.desktop!.openFolderWorkspace = vi
      .fn()
      .mockResolvedValueOnce({
        id: "C:\\Projects\\Orion\\client",
        directory: "C:\\Projects\\Orion\\client",
        name: "client",
        created: 1,
        updated: 2,
        project: {
          id: "project-orion",
          name: "Orion",
          worktree: "C:\\Projects\\Orion",
        },
        sessions: [],
      })
      .mockResolvedValueOnce({
        id: "C:\\Projects\\Nova\\server",
        directory: "C:\\Projects\\Nova\\server",
        name: "server",
        created: 3,
        updated: 4,
        project: {
          id: "project-nova",
          name: "Nova",
          worktree: "C:\\Projects\\Nova",
        },
        sessions: [],
      })

    render(<App />)

    const openFolder = screen.getByRole("button", { name: "Open folder" })
    fireEvent.click(openFolder)
    expect((await screen.findByRole("button", { name: "client" })).closest(".project-row")).toHaveClass("is-active")

    fireEvent.click(openFolder)

    await waitFor(() => {
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledTimes(2)
      expect(window.desktop!.openFolderWorkspace).toHaveBeenNthCalledWith(2, {
        directory: "C:\\Projects\\Nova\\server",
      })
    })

    expect((await screen.findByRole("button", { name: "server" })).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "client" }).closest(".project-row")).not.toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "client" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "server" })).toHaveAttribute("aria-expanded", "true")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)
  })

  it("does not open a folder when directory selection is cancelled", async () => {
    window.desktop!.pickProjectDirectory = vi.fn().mockResolvedValue(null)
    window.desktop!.openFolderWorkspace = vi.fn()

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))

    await waitFor(() => {
      expect(window.desktop!.pickProjectDirectory).toHaveBeenCalledTimes(1)
    })
    expect(window.desktop!.openFolderWorkspace).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "app" })).toBeInTheDocument()
  })

  it("adds the selected sidebar session to the focused pane and activates it", async () => {
    render(<App />)

    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to session Chat 2" })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))

    expect(await screen.findByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByRole("button", { name: "Chat 2" }).closest(".session-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "app" }).closest(".project-row")).toHaveClass("is-active")
  })

  it("reuses open session tabs while preserving create session tabs in the focused pane", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))

    expect(await screen.findByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(screen.getByRole("button", { name: "Chat 1" }))

    expect(screen.getByRole("button", { name: "Switch to session Chat 1" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Switch to session Chat 2" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Switch to session Chat 1" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "Switch to session Chat 2" })).toHaveLength(1)
  })

  it("drags a tab out of the focused pane to create a sibling pane", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))

    const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
    const chat2Tab = screen.getByRole("button", { name: "Switch to session Chat 2" })
    const chat2TabContainer = chat2Tab.closest(".session-tab")

    expect(chat2TabContainer).not.toBeNull()
    expect(chat2TabContainer).not.toHaveAttribute("draggable")
    expect(chat2Tab).not.toHaveAttribute("draggable")

    fireEvent.dragStart(chat2Tab)
    fireEvent.dragEnter(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.dragOver(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.drop(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.dragEnd(chat2Tab)

    await waitFor(() => {
      expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
    })

    const panes = Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]
    expect(within(panes[0]).getByRole("button", { name: "Switch to session Chat 1" })).toBeInTheDocument()
    expect(within(panes[1]).getByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
  })

  it("drags a create-session tab out of the focused pane to create a sibling pane", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
    const createTab = screen.getByRole("button", { name: "Switch to create session tab" })
    const createTabContainer = createTab.closest(".session-tab")

    expect(createTabContainer).not.toBeNull()
    expect(createTabContainer).not.toHaveAttribute("draggable")
    expect(createTab).not.toHaveAttribute("draggable")

    fireEvent.dragStart(createTab)
    fireEvent.dragEnter(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.dragOver(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.drop(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.dragEnd(createTab)

    await waitFor(() => {
      expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
    })

    const panes = Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]
    expect(within(panes[1]).getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
  })

  it("shows a layout preview instead of visible split hints while dragging over a pane edge", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
    const createTab = screen.getByRole("button", { name: "Switch to create session tab" })

    fireEvent.dragStart(createTab)
    fireEvent.dragEnter(within(sourcePane).getByTestId("pane-drop-right"))
    fireEvent.dragOver(within(sourcePane).getByTestId("pane-drop-right"))

    const liveRegion = sourcePane.querySelector(".workbench-pane-live-region.pane-drop-preview-current") as HTMLElement | null
    const incomingPreview = sourcePane.querySelector(".workbench-pane-incoming-preview.pane-drop-preview-incoming") as HTMLElement | null

    expect(sourcePane.querySelector(".pane-drop-preview.is-right")).not.toBeNull()
    expect(liveRegion).not.toBeNull()
    expect(liveRegion?.style.left).toBe("12px")
    expect(liveRegion?.style.width).toBe("calc(50% - 18px)")
    expect(incomingPreview).not.toBeNull()
    expect(incomingPreview?.style.left).toBe("calc(50% + 6px)")
  })

  it("shows a merge preview block in the target pane tab bar when dragging into pane center", async () => {
    render(<App />)

    const panes = await createSiblingPaneFromCreateTab()
    const sourceTab = within(panes[0]).getByRole("button", { name: "Switch to session Chat 1" })

    fireEvent.dragStart(sourceTab)
    fireEvent.dragEnter(within(panes[1]).getByTestId("pane-drop-center"))
    fireEvent.dragOver(within(panes[1]).getByTestId("pane-drop-center"))

    const mergePreview = panes[1].querySelector(".pane-tab-merge-preview")
    const addButton = within(panes[1]).getByRole("button", { name: "Add session tab" })

    expect(mergePreview).not.toBeNull()
    expect(panes[1].querySelector(".pane-drop-preview")).toBeNull()
    expect(mergePreview?.nextElementSibling).toBe(addButton)
  })

  it("drops a create-session tab into a sibling pane via pointer drag", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
    const createTab = screen.getByRole("button", { name: "Switch to create session tab" })

    Object.defineProperty(sourcePane, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(createTab, {
      button: 0,
      clientX: 120,
      clientY: 24,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, {
      clientX: 360,
      clientY: 150,
      pointerId: 1,
    })
    fireEvent.pointerUp(window, {
      clientX: 360,
      clientY: 150,
      pointerId: 1,
    })

    await waitFor(() => {
      expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
    })
  })

  it("treats the workbench top edge as the top split target for top-row panes during pointer drag", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    const workbench = document.querySelector(".workbench-panes") as HTMLElement
    const sourcePane = document.querySelector(".workbench-pane") as HTMLElement
    const createTab = screen.getByRole("button", { name: "Switch to create session tab" })

    Object.defineProperty(workbench, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 320,
        width: 400,
        height: 320,
        toJSON: () => ({}),
      }),
    })

    Object.defineProperty(sourcePane, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 32,
        left: 0,
        top: 32,
        right: 400,
        bottom: 320,
        width: 400,
        height: 288,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(createTab, {
      button: 0,
      clientX: 120,
      clientY: 56,
      pointerId: 1,
    })
    fireEvent.pointerMove(window, {
      clientX: 200,
      clientY: 8,
      pointerId: 1,
    })
    fireEvent.pointerUp(window, {
      clientX: 200,
      clientY: 8,
      pointerId: 1,
    })

    await waitFor(() => {
      expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
    })
  })

  it("drops a tab into another pane and activates it there", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Chat 2" }))
    let panes = await createSiblingPaneFromCreateTab()
    const chat2Tab = within(panes[0]).getByRole("button", { name: "Switch to session Chat 2" })

    fireEvent.dragStart(chat2Tab)
    fireEvent.dragEnter(within(panes[1]).getByTestId("pane-drop-center"))
    fireEvent.dragOver(within(panes[1]).getByTestId("pane-drop-center"))
    fireEvent.drop(within(panes[1]).getByTestId("pane-drop-center"))
    fireEvent.dragEnd(chat2Tab)

    await waitFor(() => {
      panes = Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]
      expect(within(panes[1]).getByRole("button", { name: "Switch to session Chat 2" })).toHaveAttribute("aria-pressed", "true")
    })

    expect(within(panes[1]).getByRole("button", { name: "Switch to create session tab" })).toBeInTheDocument()
    expect(within(panes[0]).queryByRole("button", { name: "Switch to session Chat 2" })).toBeNull()
  })

  it("restores a single workbench pane without leaving the canvas shifted left", async () => {
    render(<App />)

    const panes = await createSiblingPaneFromCreateTab()

    expect(document.querySelectorAll(".workbench-pane")).toHaveLength(2)
    expect(document.querySelector(".workbench-panes")).toHaveClass("has-multiple")
    expect(document.querySelectorAll(".pane-tab-bar .window-controls")).toHaveLength(0)
    expect(document.querySelectorAll(".right-sidebar-top-menu .window-controls")).toHaveLength(1)

    fireEvent.click(within(panes[1]).getByRole("button", { name: "Close create session tab" }))

    await waitFor(() => {
      expect(document.querySelectorAll(".workbench-pane")).toHaveLength(1)
    })

    expect(document.querySelector(".workbench-panes")).not.toHaveClass("has-multiple")
    expect(document.querySelector(".pane-tab-bar")).not.toHaveClass("has-window-controls-clearance")
    expect(document.querySelectorAll(".pane-tab-bar .window-controls")).toHaveLength(0)
    expect(document.querySelectorAll(".right-sidebar-top-menu .window-controls")).toHaveLength(1)
  })

  it("limits session canvas tab drag regions to the top row of panes", async () => {
    render(<App />)

    const panes = await createStackedPaneFromCreateTab()
    expect(panes).toHaveLength(2)

    expect(panes[0].querySelector(".pane-tab-bar")).toHaveClass("window-drag-region")
    expect(panes[1].querySelector(".pane-tab-bar")).not.toHaveClass("window-drag-region")
  })

  it("keeps the right sidebar toggle in the top-right pane when panes are stacked", async () => {
    render(<App />)

    const panes = await createStackedPaneFromCreateTab()
    expect(panes).toHaveLength(2)

    expect(within(panes[0]).getByRole("button", { name: "Collapse right sidebar" })).toBeInTheDocument()
    expect(within(panes[1]).queryByRole("button", { name: "Collapse right sidebar" })).toBeNull()
  })

  it("temporarily disables the top-row pane drag region while dragging a tab", () => {
    render(<App />)

    const tab = screen.getByRole("button", { name: "Switch to session Chat 1" })
    const tabBar = tab.closest(".pane-tab-bar")

    expect(tabBar).toHaveClass("window-drag-region")

    fireEvent.dragStart(tab)
    expect(tabBar).not.toHaveClass("window-drag-region")

    fireEvent.dragEnd(tab)
    expect(tabBar).toHaveClass("window-drag-region")
  })

  it("renders decorative curves on the active pane tab only", () => {
    render(<App />)

    const tabBar = screen.getByRole("navigation", { name: "Pane tabs" })

    expect(tabBar.querySelectorAll(".session-tab.is-active .session-tab-active-curve")).toHaveLength(2)
    expect(tabBar.querySelectorAll(".session-tab.is-active .session-tab-active-curve-svg")).toHaveLength(2)
    expect(tabBar.querySelectorAll(".session-tab:not(.is-active) .session-tab-active-curve")).toHaveLength(0)
  })

  it("falls back to the create session tab when the last session tab closes", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Close session tab Chat 1" }))

    expect(await screen.findByRole("combobox", { name: "Session project" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
  })

  it("focuses the existing create session tab when the pane tab bar add button is clicked", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    fireEvent.click(screen.getByRole("button", { name: "Switch to session Chat 1" }))

    const pane = document.querySelector(".workbench-pane") as HTMLElement
    const paneTabBar = within(pane).getByRole("navigation", { name: "Pane tabs" })

    fireEvent.click(within(paneTabBar).getByRole("button", { name: "Add session tab" }))

    expect(screen.getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("button", { name: "Switch to create session tab 2" })).toBeNull()
  })

  it("focuses the existing create session tab in another pane when the folder row action is clicked", async () => {
    render(<App />)

    const panes = await createSiblingPaneFromCreateTab()

    fireEvent.click(within(panes[0]).getByRole("button", { name: "Switch to session Chat 1" }))
    fireEvent.click(screen.getByRole("button", { name: "Create session for src" }))

    const updatedPanes = Array.from(document.querySelectorAll(".workbench-pane")) as HTMLElement[]

    expect(within(updatedPanes[1]).getByRole("button", { name: "Switch to create session tab" })).toHaveAttribute("aria-pressed", "true")
    expect(within(updatedPanes[0]).queryByRole("button", { name: "Switch to create session tab" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Switch to create session tab 2" })).toBeNull()
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 1\\src")
  })

  it("allows multiple create session tabs with independent project selections", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })
    expect(screen.queryByRole("textbox", { name: "Session title" })).not.toBeInTheDocument()

    fireEvent.change(getCreateSessionProjectSelect(), {
      target: { value: "C:\\Projects\\Project 1\\src" },
    })
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 1\\src")

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))

    expect(await screen.findByRole("button", { name: "Switch to create session tab 2" })).toHaveAttribute("aria-pressed", "true")
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 1\\src")

    fireEvent.change(getCreateSessionProjectSelect(), {
      target: { value: "C:\\Projects\\Project 2\\app" },
    })
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 2\\app")

    fireEvent.click(screen.getByRole("button", { name: "Switch to create session tab" }))
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 1\\src")

    fireEvent.click(screen.getByRole("button", { name: "Switch to create session tab 2" }))
    expect(getCreateSessionProjectSelect()).toHaveValue("C:\\Projects\\Project 2\\app")
  })

  it("shows the session canvas top menu while a create session tab is active", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))

    await screen.findByRole("combobox", { name: "Session project" })

    const topMenu = screen.getByLabelText("Session canvas top menu")
    expect(topMenu).toBeInTheDocument()
    expect(within(topMenu).queryByText("Create session")).not.toBeInTheDocument()
    expect(within(topMenu).getByRole("button", { name: "Select project skills: Skills" })).toBeInTheDocument()
    expect(within(topMenu).getByRole("button", { name: "Select project MCP servers: MCP" })).toBeInTheDocument()
  })

  it("creates a persisted session for the selected folder", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-backend-new",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
        title: "Backend chat",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    expect(await screen.findByRole("combobox", { name: "Session project" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Session title" })).not.toBeInTheDocument()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Create the backend session")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
      })
    })
    expect(await screen.findByRole("button", { name: "Backend chat" })).toBeInTheDocument()
    expect(within(screen.getByLabelText("Session canvas top menu")).getByText("Backend chat")).toBeInTheDocument()
  })

  it("creates a session only for the currently selected folder", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-layout-next",
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
        title: "Layout follow-up",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "src" }))

    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "app" }).closest(".project-row")).not.toHaveClass("is-active")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Create session for src")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledTimes(1)
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
      })
    })

    expect(await screen.findByRole("button", { name: "Layout follow-up" })).toBeInTheDocument()
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)
  })

  it("does not open a create session tab when selecting an empty folder row", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "src" }))

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
      expect(screen.getByRole("button", { name: "src" })).toHaveAttribute("aria-expanded", "true")
      expect(screen.queryByRole("button", { name: "Switch to create session tab" })).not.toBeInTheDocument()
      expect(screen.queryByRole("combobox", { name: "Session project" })).not.toBeInTheDocument()
    })
  })

  it("creates a session from the folder row action", async () => {
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-layout-scratch",
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
        title: "Layout scratch",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session for src" }))
    await screen.findByRole("combobox", { name: "Session project" })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Create scratch session")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-1",
        directory: "C:\\Projects\\Project 1\\src",
      })
    })

    expect(await screen.findByRole("button", { name: "Layout scratch" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
  })

  it("keeps the composer visible on the create session canvas and sends after creating the session", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-backend-new",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
        title: "Backend chat",
        created: 1,
        updated: 2,
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    expect(screen.getByRole("textbox", { name: "Task draft" })).toBeInTheDocument()
    expect(getComposerSendButton()).toBeEnabled()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Ship the first session prompt")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.createFolderSession).toHaveBeenCalledWith({
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
      })
    })
    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend-new",
        text: "Ship the first session prompt",
        skills: [],
      }))
    })

    expect(await screen.findByRole("button", { name: "Backend chat" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Session project" })).not.toBeInTheDocument()
  })

  it("creates a backend session in the active workspace directory for local sessions", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.createAgentSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-backend-local",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
        title: "Seed backend session",
        created: 1,
        updated: 1,
      },
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Inspect the seeded workspace")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.createAgentSession).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Project 2\\app",
      })
    })
    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend-local",
        text: "Inspect the seeded workspace",
        skills: [],
      }))
    })
  })

  it("renders the first streamed turn immediately after sending from the create session canvas", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let releaseStream: (() => void) | undefined
    let activeStreamID = ""
    let activeSessionID = ""

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.createFolderSession = vi.fn().mockResolvedValue({
      session: {
        id: "session-backend-streamed",
        projectID: "project-2",
        directory: "C:\\Projects\\Project 2\\app",
        title: "Streamed backend chat",
        created: 1,
        updated: 2,
      },
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        activeStreamID = input.clientTurnID
        activeSessionID = input.backendSessionID

        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole("button", { name: "Create session" }))
    await screen.findByRole("combobox", { name: "Session project" })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Stream the first session prompt")
    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        clientTurnID: expect.any(String),
        backendSessionID: "session-backend-streamed",
        text: "Stream the first session prompt",
        skills: [],
      }))
    })
    expect(await screen.findByRole("button", { name: "Streamed backend chat" })).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Session project" })).not.toBeInTheDocument()
    expect(screen.getByText("Preparing...")).toBeInTheDocument()

    await act(async () => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "delta",
        data: {
          kind: "text",
          partID: "part-text-1",
          delta: "First token is visible.",
          text: "First token is visible.",
        },
      }))
      await Promise.resolve()
    })

    expect(await screen.findByText("First token is visible.")).toBeInTheDocument()

    await act(async () => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "done",
        data: {
          sessionID: activeSessionID,
          parts: [{ id: "part-text-1", type: "text", text: "First token is visible." }],
        },
      }))
      releaseStream?.()
      await Promise.resolve()
    })
  })

  it("opens global provider settings", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "openai",
        name: "OpenAI",
        source: "api",
        env: ["OPENAI_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.openai.com/v1",
        modelCount: 0,
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))

    const settingsDialog = await screen.findByRole("dialog", { name: "Settings" })

    expect(settingsDialog).toHaveClass("settings-page")
    expect(screen.getByRole("button", { name: "Close settings" })).toBeInTheDocument()
    expect(screen.queryByText("Global settings")).not.toBeInTheDocument()
    expect(screen.queryByText("Manage shared providers and models for the app.")).not.toBeInTheDocument()
    expect(settingsDialog.querySelectorAll(".settings-primary-nav-icon")).toHaveLength(6)
    expect(screen.getByText("\u9009\u9879")).toBeInTheDocument()
    const providerNavButton = screen.getByRole("button", { name: "Provider" })
    expect(providerNavButton).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Models" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tools" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Archived Sessions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Developer Mode" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "MCP" })).not.toBeInTheDocument()
    expect(screen.queryByText("Choose a provider on the left, then edit the shared credentials and endpoint used across the app.")).not.toBeInTheDocument()
    expect(screen.queryByText("Providers discovered from the catalog, environment, and saved config.")).not.toBeInTheDocument()
    expect(screen.queryByText("Search providers")).not.toBeInTheDocument()
    fireEvent.click(providerNavButton)
    expect(await screen.findByRole("button", { name: "Refresh provider catalog" })).toBeInTheDocument()
    expect(await screen.findByRole("textbox", { name: "Search providers" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /DeepSeek.*Connected/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /OpenAI.*Not connected/ })).toBeInTheDocument()
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument()
    expect(screen.queryByText("No known models yet")).not.toBeInTheDocument()
    expect(screen.queryByText("1 known models")).not.toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: "DeepSeek" })).toBeInTheDocument()
    expect(screen.getByText("连接方式")).toBeInTheDocument()
    expect(screen.getByText("使用环境变量 DEEPSEEK_API_KEY")).toBeInTheDocument()
    expect(screen.getByText("高级设置")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Provider Models" })).toBeInTheDocument()
    expect(settingsDialog.querySelector(".settings-detail-hero")).toBeNull()
    expect(screen.queryByText("Provider ID")).not.toBeInTheDocument()
    expect(screen.queryByText("Environment")).not.toBeInTheDocument()
    expect(screen.queryByText("Save shared credentials and endpoint overrides for this provider.")).not.toBeInTheDocument()
    expect(screen.queryByText("Edit the shared credentials and endpoint the app should use when routing to DeepSeek.")).not.toBeInTheDocument()
    expect(screen.queryByText("Reset removes the saved provider configuration and falls back to environment or catalog defaults.")).not.toBeInTheDocument()
    expect(screen.getByLabelText("API key for DeepSeek")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save DeepSeek settings" })).toHaveTextContent("保存")

    const providerList = screen.getByRole("list", { name: "Provider list" })
    const providerButtons = within(providerList).getAllByRole("button")
    expect(providerButtons[0]).toHaveTextContent("DeepSeek")
    expect(providerButtons[1]).toHaveTextContent("OpenAI")
    expect(within(providerList).queryByText("Connected")).not.toBeInTheDocument()
    expect(within(providerList).queryByText("Not connected")).not.toBeInTheDocument()
    expect(providerList.querySelectorAll(".settings-status-indicator")).toHaveLength(2)

    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))

    expect(screen.getByRole("button", { name: "Primary model: DeepSeek / DeepSeek Reasoner" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Connected Models" })).toBeInTheDocument()
    expect(screen.getByText("DeepSeek Reasoner")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(1)
    })
  })

  it("edits prompt presets from the prompts page", async () => {
    let promptPresetSelection = { ...PROMPT_PRESET_SELECTION_FIXTURE }
    let promptPresetDocuments = [
      createPromptPresetDocument("system-default"),
      createPromptPresetDocument("plan-mode"),
      createPromptPresetDocument("side-chat"),
      createPromptPresetDocument("provider-gpt"),
    ]

    function listPromptPresetSummaries() {
      return promptPresetDocuments.map(({ content, ...summary }) => summary)
    }

    function readPromptPresetDocumentForTest(presetID: string) {
      const preset = promptPresetDocuments.find((item) => item.id === presetID)
      if (!preset) {
        throw new Error(`Unknown prompt preset '${presetID}'`)
      }

      return preset
    }

    function upsertPromptPresetDocument(document: ReturnType<typeof createPromptPresetDocument>) {
      promptPresetDocuments = promptPresetDocuments.some((preset) => preset.id === document.id)
        ? promptPresetDocuments.map((preset) => (preset.id === document.id ? document : preset))
        : [...promptPresetDocuments, document]
    }

    window.desktop!.getPromptPresets = vi.fn().mockImplementation(() =>
      Promise.resolve(listPromptPresetSummaries()),
    )
    window.desktop!.getPromptPresetSelection = vi.fn().mockImplementation(() =>
      Promise.resolve({ ...promptPresetSelection }),
    )
    window.desktop!.readPromptPreset = vi.fn().mockImplementation(({ presetID }: { presetID: string }) =>
      Promise.resolve(readPromptPresetDocumentForTest(presetID)),
    )
    window.desktop!.createPromptPreset = vi.fn().mockImplementation(() => {
      const document = createPromptPresetDocument("custom-untitled-preset", {
        label: "Untitled preset",
        source: "custom",
        description: "Custom prompt preset.",
        content: "",
      })
      upsertPromptPresetDocument(document)
      return Promise.resolve(document)
    })
    window.desktop!.updatePromptPresetSelection = vi.fn().mockImplementation((input: typeof PROMPT_PRESET_SELECTION_FIXTURE) => {
      promptPresetSelection = { ...input }
      return Promise.resolve(promptPresetSelection)
    })
    window.desktop!.updatePromptPreset = vi.fn().mockImplementation(
      ({ presetID, label, content }: { presetID: string; label?: string; content: string }) => {
        const current = readPromptPresetDocumentForTest(presetID)
        const nextDocument = {
          ...current,
          label: label ?? current.label,
          content,
          hasOverride: current.source === "bundled" ? true : false,
        }
        upsertPromptPresetDocument(nextDocument)
        return Promise.resolve(nextDocument)
      },
    )
    window.desktop!.resetPromptPreset = vi.fn().mockImplementation(({ presetID }: { presetID: string }) => {
      const nextDocument = createPromptPresetDocument(presetID, {
        hasOverride: false,
      })
      upsertPromptPresetDocument(nextDocument)
      return Promise.resolve(nextDocument)
    })
    window.desktop!.deletePromptPreset = vi.fn().mockImplementation(({ presetID }: { presetID: string }) => {
      promptPresetDocuments = promptPresetDocuments.filter((preset) => preset.id !== presetID)
      promptPresetSelection = {
        systemPromptPresetID: "system-default",
        planModePromptPresetID: promptPresetSelection.planModePromptPresetID,
        sideChatPromptPresetID: promptPresetSelection.sideChatPromptPresetID,
      }
      return Promise.resolve(promptPresetSelection)
    })
    window.desktop!.previewPromptUrlInstall = vi.fn().mockResolvedValue({
      previewID: "prompt-preview-1",
      source: "https://github.com/acme/prompts/tree/main/prompts",
      prompts: [
        {
          id: "remote-system-prompt",
          label: "Remote System Prompt",
          description: "Downloaded prompt.",
          sourcePath: "https://github.com/acme/prompts/blob/main/prompts/system.md",
          available: true,
        },
      ],
    })
    window.desktop!.installPromptsFromUrl = vi.fn().mockImplementation(() => {
      const document = createPromptPresetDocument("custom-remote-system-prompt", {
        label: "Remote System Prompt",
        source: "custom",
        description: "Downloaded prompt.",
        sourcePath: "https://github.com/acme/prompts/blob/main/prompts/system.md",
        content: "remote installed prompt",
      })
      upsertPromptPresetDocument(document)
      return Promise.resolve({
        installed: [document],
      })
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open prompts" }))

    const promptTree = await screen.findByRole("list", { name: "Prompt presets" })
    const bundledPromptFolder = within(promptTree).getByRole("button", { name: "Bundled prompt folder" })
    expect(bundledPromptFolder.querySelector(".skill-tree-leading")).toBeNull()
    expect(bundledPromptFolder.firstElementChild).toHaveClass("skill-tree-role-icon", "is-folder")
    expect(promptTree.lastElementChild).toHaveClass("prompt-presets-new-menu-shell")
    expect(within(promptTree.lastElementChild as HTMLElement).getByRole("button", { name: "New" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "System Prompt" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Plan Mode Prompt" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Side Chat Prompt" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "GPT Provider Prompt" })).toBeInTheDocument()
    expect(screen.getByLabelText("System prompt preset")).toHaveValue("system-default")
    expect(screen.getByLabelText("Plan mode prompt preset")).toHaveValue("plan-mode")
    expect(screen.getByLabelText("Side chat prompt preset")).toHaveValue("side-chat")
    expect(screen.queryByRole("button", { name: /Confirm .* prompt preset/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Plan Mode Prompt" }))

    await waitFor(() => {
      expect(window.desktop!.readPromptPreset).toHaveBeenCalledWith({
        presetID: "plan-mode",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    const planPreview = screen.getByRole("region", { name: "Plan Mode Prompt markdown preview" })
    expect(planPreview).toHaveTextContent("<system-reminder>")
    expect(within(planPreview).getByRole("heading", { name: "Plan Mode - System Reminder" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Edit" }))
    expect(screen.getByRole("textbox", { name: "Plan Mode Prompt content" })).toHaveValue(
      "<system-reminder>\n# Plan Mode - System Reminder",
    )

    fireEvent.change(screen.getByLabelText("System prompt preset"), {
      target: {
        value: "provider-gpt",
      },
    })

    await waitFor(() => {
      expect(window.desktop!.updatePromptPresetSelection).toHaveBeenCalledWith({
        systemPromptPresetID: "provider-gpt",
        planModePromptPresetID: "plan-mode",
        sideChatPromptPresetID: "side-chat",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "New" }))

    expect(await screen.findByDisplayValue("Untitled preset")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Preset name"), {
      target: {
        value: "Focus preset",
      },
    })

    const customTextarea = screen.getByRole("textbox", { name: "Untitled preset content" })
    fireEvent.change(customTextarea, {
      target: {
        value: "custom system prompt",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(window.desktop!.updatePromptPreset).toHaveBeenCalledWith({
        presetID: "custom-untitled-preset",
        label: "Focus preset",
        content: "custom system prompt",
      })
    })

    fireEvent.change(screen.getByLabelText("System prompt preset"), {
      target: {
        value: "custom-untitled-preset",
      },
    })

    await waitFor(() => {
      expect(window.desktop!.updatePromptPresetSelection).toHaveBeenLastCalledWith({
        systemPromptPresetID: "custom-untitled-preset",
        planModePromptPresetID: "plan-mode",
        sideChatPromptPresetID: "side-chat",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Delete" }))

    await waitFor(() => {
      expect(window.desktop!.deletePromptPreset).toHaveBeenCalledWith({
        presetID: "custom-untitled-preset",
      })
    })

    expect(await screen.findByText("Prompt preset deleted.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Install prompt" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "From URL" }))

    const promptUrlInstallDialog = await screen.findByRole("dialog", { name: "Install prompts from URL" })
    fireEvent.change(within(promptUrlInstallDialog).getByRole("textbox", { name: "Prompt resource URL" }), {
      target: {
        value: "https://github.com/acme/prompts/tree/main/prompts",
      },
    })
    fireEvent.click(within(promptUrlInstallDialog).getByRole("button", { name: "Preview" }))

    await waitFor(() => {
      expect(window.desktop!.previewPromptUrlInstall).toHaveBeenCalledWith({
        source: "https://github.com/acme/prompts/tree/main/prompts",
      })
    })
    expect(within(promptUrlInstallDialog).getByText("Remote System Prompt")).toBeInTheDocument()

    fireEvent.click(within(promptUrlInstallDialog).getByRole("button", { name: "Install (1)" }))

    await waitFor(() => {
      expect(window.desktop!.installPromptsFromUrl).toHaveBeenCalledWith({
        previewID: "prompt-preview-1",
        promptIDs: ["remote-system-prompt"],
      })
    })

    expect(await screen.findByText("Installed 1 prompt.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Remote System Prompt" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Remote System Prompt content" })).toHaveValue(
      "remote installed prompt",
    )

    fireEvent.click(screen.getByRole("button", { name: "GPT Provider Prompt" }))

    await waitFor(() => {
      expect(window.desktop!.readPromptPreset).toHaveBeenCalledWith({
        presetID: "provider-gpt",
      })
    })

    const textarea = screen.getByRole("textbox", { name: "GPT Provider Prompt content" })
    fireEvent.change(textarea, {
      target: {
        value: "custom gpt provider prompt",
      },
    })

    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(window.desktop!.updatePromptPreset).toHaveBeenCalledWith({
        presetID: "provider-gpt",
        label: undefined,
        content: "custom gpt provider prompt",
      })
    })

    expect(await screen.findByText("Prompt preset saved.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reset" }))

    await waitFor(() => {
      expect(window.desktop!.resetPromptPreset).toHaveBeenCalledWith({
        presetID: "provider-gpt",
      })
    })

    expect(await screen.findByText("Prompt preset reset to default.")).toBeInTheDocument()
  })

  it("refreshes the global provider catalog from settings", async () => {
    const refreshCatalog = createDeferred<
      {
        id: string
        name: string
        source: string
        env: string[]
        configured: boolean
        available: boolean
        apiKeyConfigured: boolean
        baseURL: string
        modelCount: number
      }[]
    >()

    window.desktop!.getGlobalProviderCatalog = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "api",
          env: ["DEEPSEEK_API_KEY"],
          configured: false,
          available: false,
          apiKeyConfigured: false,
          baseURL: "https://api.deepseek.com",
          modelCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "openai",
          name: "OpenAI",
          source: "api",
          env: ["OPENAI_API_KEY"],
          configured: false,
          available: false,
          apiKeyConfigured: false,
          baseURL: "https://api.openai.com/v1",
          modelCount: 2,
        },
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "api",
          env: ["DEEPSEEK_API_KEY"],
          configured: false,
          available: false,
          apiKeyConfigured: false,
          baseURL: "https://api.deepseek.com",
          modelCount: 1,
        },
      ])
    window.desktop!.getGlobalModels = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        selection: {},
      })
      .mockResolvedValueOnce({
        items: [],
        selection: {},
      })
    window.desktop!.refreshGlobalProviderCatalog = vi.fn().mockImplementation(() => refreshCatalog.promise)

    render(<App />)

    await openProviderSettingsSection()

    const refreshButton = screen.getByRole("button", { name: "Refresh provider catalog" })
    fireEvent.click(refreshButton)

    expect(refreshButton).toBeDisabled()
    expect(refreshButton).toHaveTextContent("Refreshing...")

    refreshCatalog.resolve([
      {
        id: "openai",
        name: "OpenAI",
        source: "api",
        env: ["OPENAI_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.openai.com/v1",
        modelCount: 2,
      },
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "api",
        env: ["DEEPSEEK_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])

    await waitFor(() => {
      expect(window.desktop!.refreshGlobalProviderCatalog).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(2)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(2)
    })

    expect(await screen.findByText("Provider catalog refreshed.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Dismiss settings message" }))
    expect(screen.queryByText("Provider catalog refreshed.")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /OpenAI.*Not connected/ })).toBeInTheDocument()
  })

  it("opens built-in tools from the activity rail and loads tool availability", async () => {
    window.desktop!.getBuiltinTools = vi.fn().mockResolvedValue({
      items: [
        {
          id: "git_bash_command",
          title: "Git Bash",
          description: "Run a Git Bash/MSYS Bash command inside the current project boundary.",
          aliases: [],
          capabilities: {
            kind: "exec",
            readOnly: false,
            destructive: true,
            concurrency: "exclusive",
            needsShell: true,
          },
        },
        {
          id: "read-file",
          title: "Read File",
          description: "Read a text file or a line range from the current project.",
          aliases: [],
          capabilities: {
            kind: "read",
            readOnly: true,
            destructive: false,
            concurrency: "safe",
          },
        },
      ],
      selection: {
        tools: {
          "read-file": false,
        },
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open tools" }))

    expect(screen.getByLabelText("Tools top menu")).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    expect(screen.queryByText("Pick a project first")).not.toBeInTheDocument()
    expect(await screen.findByText("Global tool availability")).toBeInTheDocument()
    expect(screen.getByText("1 of 2 built-in tools enabled.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Shell tools, 1 of 1 enabled" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText("Git Bash")).toBeInTheDocument()
    expect(screen.queryByText("Read File")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Read tools, 0 of 1 enabled" }))
    expect(screen.getByText("Read File")).toBeInTheDocument()

    await waitFor(() => {
      expect(window.desktop!.getBuiltinTools).toHaveBeenCalledTimes(1)
    })
  })

  it("edits global MCP servers from the activity rail and runs global diagnostics", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })
    window.desktop!.getGlobalMcpServers = vi.fn().mockResolvedValue([
      {
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        enabled: true,
      },
    ])
    window.desktop!.updateGlobalMcpServer = vi.fn().mockResolvedValue({
      id: "filesystem",
      name: "Filesystem Tools",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      enabled: true,
    })
    window.desktop!.getGlobalMcpServerDiagnostic = vi.fn().mockResolvedValue({
      serverID: "filesystem",
      enabled: true,
      ok: true,
      toolCount: 1,
      toolNames: ["read_file"],
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open MCP" }))

    expect(screen.getByLabelText("MCP top menu")).toBeInTheDocument()
    const filesystemButton = await screen.findByRole("button", { name: /Filesystem enabled/ })
    const newServerButton = screen.getByRole("button", { name: "New server" })
    const pageButtons = screen.getAllByRole("button")
    expect(pageButtons.indexOf(filesystemButton)).toBeLessThan(pageButtons.indexOf(newServerButton))
    expect(screen.queryByText("npx")).not.toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    expect(screen.queryByText("Pick a project first")).not.toBeInTheDocument()
    expect(screen.queryByText("Diagnostic context")).not.toBeInTheDocument()

    fireEvent.click(filesystemButton)
    fireEvent.change(screen.getByRole("textbox", { name: "MCP server name" }), {
      target: { value: "Filesystem Tools" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save server" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalMcpServer).toHaveBeenCalledWith({
        serverID: "filesystem",
        server: {
          name: "Filesystem Tools",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          env: undefined,
          cwd: undefined,
          enabled: true,
          timeoutMs: undefined,
        },
      })
    })

    await waitFor(() => {
      expect(window.desktop!.getGlobalMcpServerDiagnostic).toHaveBeenCalledWith({
        serverID: "filesystem",
      })
    })
  })

  it("toggles the left rail from appearance settings", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const getLeftActivityRail = () => container.querySelector(".activity-rail:not(.is-right)") as HTMLElement | null

    expect(appShell).not.toBeNull()
    expect(getLeftActivityRail()).not.toBeNull()
    const railCollapseButton = screen.getByRole("button", { name: "Collapse left sidebar" })
    const railTopMenu = railCollapseButton.closest(".activity-rail-top-menu")
    expect(railCollapseButton.closest(".activity-rail")).not.toBeNull()
    expect(railCollapseButton).toHaveClass("is-expanded")
    expect(railCollapseButton).not.toHaveClass("is-collapsed")
    expect(railTopMenu).not.toBeNull()
    expect(getLeftActivityRail()!.firstElementChild).toBe(railTopMenu)

    fireEvent.click(railCollapseButton)
    const railExpandButton = screen.getByRole("button", { name: "Expand left sidebar" })
    expect(railExpandButton).toHaveClass("is-collapsed")
    expect(railExpandButton).not.toHaveClass("is-expanded")

    fireEvent.click(railExpandButton)
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toHaveClass("is-expanded")

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })

    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    const railSwitch = screen.getByRole("switch", { name: "Show left rail" })
    expect(railSwitch).toHaveAttribute("aria-checked", "true")
    expect(getLeftActivityRail()).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 54px")

    fireEvent.click(railSwitch)

    expect(railSwitch).toHaveAttribute("aria-checked", "false")
    expect(getLeftActivityRail()).toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 0px")
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".left-sidebar-top-menu")).not.toBeNull()

    fireEvent.click(screen.getAllByRole("button", { name: "Close settings" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-display-width: 0px")
    expect(screen.getByRole("button", { name: "Expand left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" }).closest(".pane-tab-bar")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand left sidebar" }))
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".left-sidebar-top-menu")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Show left rail" }))

    expect(screen.getByRole("switch", { name: "Show left rail" })).toHaveAttribute("aria-checked", "true")
    expect(getLeftActivityRail()).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--activity-rail-display-width: 54px")
    expect(screen.getByRole("button", { name: "Collapse left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()
  })

  it("toggles debug region colors from developer mode settings", async () => {
    const { container } = render(<App />)
    const windowShell = container.querySelector(".window-shell") as HTMLElement | null

    expect(windowShell).not.toBeNull()
    expect(windowShell).toHaveClass("debug-ui-regions")

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))

    const debugRegionsSwitch = screen.getByRole("switch", { name: "Show debug region colors" })
    expect(debugRegionsSwitch).toHaveAttribute("aria-checked", "true")

    fireEvent.click(debugRegionsSwitch)

    expect(debugRegionsSwitch).toHaveAttribute("aria-checked", "false")
    expect(windowShell).not.toHaveClass("debug-ui-regions")
    expect(window.localStorage.getItem("desktop.debugUiRegions")).toBe("false")

    fireEvent.click(debugRegionsSwitch)

    expect(debugRegionsSwitch).toHaveAttribute("aria-checked", "true")
    expect(windowShell).toHaveClass("debug-ui-regions")
    expect(window.localStorage.getItem("desktop.debugUiRegions")).toBe("true")
  })

  it("toggles line debug colors from developer mode settings", async () => {
    const { container } = render(<App />)
    const windowShell = container.querySelector(".window-shell") as HTMLElement | null

    expect(windowShell).not.toBeNull()
    expect(windowShell).not.toHaveClass("debug-line-colors")

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))

    const debugLineColorsSwitch = screen.getByRole("switch", { name: "Show line debug colors" })
    expect(debugLineColorsSwitch).toHaveAttribute("aria-checked", "false")

    fireEvent.click(debugLineColorsSwitch)

    expect(debugLineColorsSwitch).toHaveAttribute("aria-checked", "true")
    expect(windowShell).toHaveClass("debug-line-colors")
    expect(window.localStorage.getItem("desktop.debugLineColors")).toBe("true")

    fireEvent.click(debugLineColorsSwitch)

    expect(debugLineColorsSwitch).toHaveAttribute("aria-checked", "false")
    expect(windowShell).not.toHaveClass("debug-line-colors")
    expect(window.localStorage.getItem("desktop.debugLineColors")).toBe("false")
  })

  it("toggles trace debug metadata from developer mode settings", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))

    const debugMetadataSwitch = screen.getByRole("switch", { name: "Show trace debug metadata" })
    expect(debugMetadataSwitch).toHaveAttribute("aria-checked", "false")

    fireEvent.click(debugMetadataSwitch)

    expect(debugMetadataSwitch).toHaveAttribute("aria-checked", "true")
    expect(window.localStorage.getItem("desktop.agentDebugTrace")).toBe("true")

    fireEvent.click(debugMetadataSwitch)

    expect(debugMetadataSwitch).toHaveAttribute("aria-checked", "false")
    expect(window.localStorage.getItem("desktop.agentDebugTrace")).toBe("false")
  })

  it("keeps theme editing and shell visibility under appearance while excluding developer toggles", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    expect(screen.getByRole("radio", { name: /Warm Terra & Sand/i })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /Sage \/ Slate/i })).toBeInTheDocument()
    expect(screen.getByText("Theme Config File")).toBeInTheDocument()
    expect(screen.getByLabelText("Current appearance config JSON")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Accent Base Light brand-primary")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Accent Base Dark brand-primary-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Rest Light semantic-accent-icon-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Rest Dark semantic-accent-icon-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Hover Light semantic-accent-icon-hover-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Hover Dark semantic-accent-icon-hover-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Active Light semantic-accent-icon-active-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Accent States Icon Active Dark semantic-accent-icon-active-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Pane Tab Bar Surface Light semantic-pane-tab-bar-surface-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Pane Tab Bar Surface Dark semantic-pane-tab-bar-surface-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Left Sidebar Top Menu Surface Light semantic-left-sidebar-top-menu-surface-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Left Sidebar Top Menu Surface Dark semantic-left-sidebar-top-menu-surface-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Right Sidebar Top Menu Surface Light semantic-right-sidebar-top-menu-surface-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Shell Chrome Right Sidebar Top Menu Surface Dark semantic-right-sidebar-top-menu-surface-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Dropdown Select Menu Surface Light semantic-dropdown-menu-surface-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Dropdown Select Menu Surface Dark semantic-dropdown-menu-surface-dark")).toBeInTheDocument()
    expect(screen.getByLabelText("Composer Button Surface Light semantic-composer-button-surface-light")).toBeInTheDocument()
    expect(screen.getByLabelText("Composer Button Surface Dark semantic-composer-button-surface-dark")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show left rail" })).toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show debug region colors" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show line debug colors" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show trace tool calls" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show trace sources" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show trace approvals" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show trace debug metadata" })).not.toBeInTheDocument()
    expect(screen.queryByRole("switch", { name: "Show right rail" })).not.toBeInTheDocument()
    expect(screen.getByText("No rail")).toBeInTheDocument()
    expect(screen.queryByText("Line Colors")).not.toBeInTheDocument()
  })

  it("switches the accent theme from appearance settings", async () => {
    render(<App />)

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-brand-theme", "terra")
    })

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    fireEvent.click(screen.getByRole("radio", { name: /Sage \/ Slate/i }))

    expect(document.documentElement).toHaveAttribute("data-brand-theme", "sage")
    expect(window.localStorage.getItem("desktop.brandTheme")).toBe("sage")

    fireEvent.click(screen.getByRole("radio", { name: /Warm Terra & Sand/i }))

    expect(document.documentElement).toHaveAttribute("data-brand-theme", "terra")
    expect(window.localStorage.getItem("desktop.brandTheme")).toBe("terra")
  })

  it("saves semantic token overrides from appearance settings", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))

    const accentBaseInput = screen.getByLabelText("Accent States Accent Base Light brand-primary hex color") as HTMLInputElement
    const questionCardInput = screen.getByLabelText(
      "Question Card Surface Light semantic-question-card-surface-light hex color",
    ) as HTMLInputElement
    const preview = screen.getByLabelText("Current appearance config JSON") as HTMLTextAreaElement
    const saveAppearanceConfig = window.desktop!.saveAppearanceConfig as ReturnType<typeof vi.fn>

    fireEvent.change(accentBaseInput, { target: { value: "#ffffff" } })
    fireEvent.blur(accentBaseInput)
    fireEvent.change(questionCardInput, { target: { value: "#123456" } })
    fireEvent.blur(questionCardInput)

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue("--brand-primary")).toBe("#ffffff")
      expect(document.documentElement.style.getPropertyValue("--semantic-question-card-surface-light")).toBe("#123456")
    })
    await waitFor(() => {
      expect(saveAppearanceConfig).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(preview.value).toContain("#ffffff")
      expect(preview.value).toContain("#123456")
    })
  })

  it("groups debug overlays and trace visibility under developer mode", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))

    expect(screen.getByRole("switch", { name: "Show debug region colors" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show line debug colors" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show trace tool calls" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show trace sources" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show trace approvals" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Show trace debug metadata" })).toBeInTheDocument()
    expect(screen.getByText("Developer State")).toBeInTheDocument()
    expect(screen.getByText("Line Colors")).toBeInTheDocument()
  })

  it("reveals backend-only thread trace entries when workflow and debug metadata are enabled", async () => {
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 10,
        },
        parts: [
          {
            id: "part-user-1",
            sessionID: "session-atlas-review",
            messageID: "msg-user-1",
            type: "text",
            text: "Inspect the permission flow",
          },
        ],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 11,
          completed: 12,
        },
        parts: [
          {
            id: "part-permission-1",
            sessionID: "session-atlas-review",
            messageID: "msg-assistant-1",
            type: "permission",
            approvalID: "approval-atlas-1",
            toolCallID: "toolcall-atlas-1",
            tool: "read-file",
            action: "ask",
            created: 12,
          },
          {
            id: "part-step-start-1",
            sessionID: "session-atlas-review",
            messageID: "msg-assistant-1",
            type: "step-start",
          },
          {
            id: "part-text-1",
            sessionID: "session-atlas-review",
            messageID: "msg-assistant-1",
            type: "text",
            text: "Done.",
          },
        ],
      },
    ])

    render(<App />)

    expect(await screen.findByRole("button", { name: "Atlas review" })).toBeInTheDocument()
    expect(await screen.findByText("Done.")).toBeInTheDocument()
    expect(screen.getByText("Permission requested")).toBeInTheDocument()
    expect(screen.queryByText("Reasoning step started")).not.toBeInTheDocument()
    expect(screen.queryByText("approval.id")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Show trace workflow events" }))
    fireEvent.click(screen.getByRole("switch", { name: "Show trace debug metadata" }))

    expect(screen.getByText("Reasoning step started")).toBeInTheDocument()
    expect(screen.getByText("approval.id")).toBeInTheDocument()
    expect(screen.getAllByText("part.id").length).toBeGreaterThan(0)
  })

  it("keeps long completed tool output collapsed until the user expands it", async () => {
    const tailMarker = "tail-marker-visible-after-expand"
    const inputMarker = "input-marker-visible-after-enabling-tool-inputs"
    const longOutput = `${"tool output line\n".repeat(80)}${tailMarker}`

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([
      {
        info: {
          id: "msg-user-1",
          sessionID: "session-atlas-review",
          role: "user",
          created: 10,
        },
        parts: [
          {
            id: "part-user-1",
            sessionID: "session-atlas-review",
            messageID: "msg-user-1",
            type: "text",
            text: "Show me the full tool output",
          },
        ],
      },
      {
        info: {
          id: "msg-assistant-1",
          sessionID: "session-atlas-review",
          role: "assistant",
          created: 11,
          completed: 12,
        },
        parts: [
          {
            id: "part-tool-1",
            sessionID: "session-atlas-review",
            messageID: "msg-assistant-1",
            type: "tool",
            tool: "capture-long-output",
            state: {
              status: "completed",
              input: {
                path: "PROJECT_ANALYSIS.md",
                content: inputMarker,
              },
              output: longOutput,
            },
          },
        ],
      },
    ])

    render(<App />)

    expect(await screen.findByRole("button", { name: "Atlas review" })).toBeInTheDocument()
    const toolToggle = await screen.findByRole("button", { name: /capture-long-output/i })

    expect(screen.queryByText(new RegExp(tailMarker))).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(inputMarker))).not.toBeInTheDocument()

    fireEvent.click(toolToggle)

    expect(screen.queryByText(new RegExp(tailMarker))).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /capture-long-output output/i }))
    expect(await screen.findByText(new RegExp(tailMarker))).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Developer Mode/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Show trace tool inputs" }))

    expect(screen.queryByText(new RegExp(inputMarker))).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /capture-long-output input/i }))
    expect(await screen.findByText(new RegExp(inputMarker))).toBeInTheDocument()
  })

  it("keeps provider configuration focused on editable fields for environment-backed providers", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "env",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })

    render(<App />)

    const settingsDialog = await openProviderSettingsSection()
    await screen.findByRole("heading", { name: "DeepSeek" })

    const detailPanel = settingsDialog.querySelector(".settings-service-detail-panel")
    expect(detailPanel).not.toBeNull()
    expect((detailPanel as HTMLElement).querySelector(".settings-detail-meta-grid")).toBeNull()
    expect((detailPanel as HTMLElement).querySelector(".settings-detail-hero")).toBeNull()
    expect(
      within(detailPanel as HTMLElement).queryByText(
        "Edit the shared credentials and endpoint the app should use when routing to DeepSeek.",
      ),
    ).not.toBeInTheDocument()
    expect(
      within(detailPanel as HTMLElement).queryByText("This provider can also inherit credentials from the current environment."),
    ).not.toBeInTheDocument()
    expect(
      within(detailPanel as HTMLElement).getByText("当前连接来自环境变量，修改需更新本地环境变量。"),
    ).toBeInTheDocument()
    expect((detailPanel as HTMLElement).querySelector(".provider-advanced-settings")).not.toHaveAttribute("open")
    expect(
      within(detailPanel as HTMLElement).queryByText("保存全局 provider 的非敏感设置。连接凭据使用全应用共享连接。"),
    ).not.toBeInTheDocument()
    expect(within(detailPanel as HTMLElement).getByRole("button", { name: "测试连接" })).toBeInTheDocument()
  })

  it("tests provider connection from the provider detail page", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "env",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })
    window.desktop!.testGlobalProviderConnection = vi.fn().mockResolvedValue({
      providerID: "deepseek",
      ok: true,
      status: "working",
      checkedAt: 1,
      message: "连接测试成功。",
    })

    render(<App />)

    await openProviderSettingsSection()
    await screen.findByRole("heading", { name: "DeepSeek" })
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }))

    await waitFor(() => {
      expect(window.desktop!.testGlobalProviderConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          providerID: "deepseek",
          method: "api-key",
          credentialMode: "environment",
          baseURL: "https://api.deepseek.com",
        }),
      )
    })
    expect(await screen.findByText("连接测试成功。")).toBeInTheDocument()
  })

  it("keeps manual provider drafts after testing the connection", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "api",
        env: ["DEEPSEEK_API_KEY"],
        configured: false,
        available: false,
        apiKeyConfigured: false,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })
    window.desktop!.testGlobalProviderConnection = vi.fn().mockResolvedValue({
      providerID: "deepseek",
      ok: true,
      status: "working",
      checkedAt: 1,
      message: "连接测试成功。",
    })

    render(<App />)

    await openProviderSettingsSection()
    await screen.findByRole("heading", { name: "DeepSeek" })

    const apiKeyInput = screen.getByLabelText("API key for DeepSeek")
    fireEvent.change(apiKeyInput, {
      target: {
        value: "sk-draft-deepseek",
      },
    })
    fireEvent.change(screen.getByLabelText("Base URL for DeepSeek"), {
      target: {
        value: "https://draft.deepseek.test/v1",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }))

    await waitFor(() => {
      expect(window.desktop!.testGlobalProviderConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          providerID: "deepseek",
          method: "api-key",
          credentialMode: "manual",
          apiKey: "sk-draft-deepseek",
          baseURL: "https://draft.deepseek.test/v1",
        }),
      )
    })
    expect(await screen.findByText("连接测试成功。")).toBeInTheDocument()
    expect(screen.getByLabelText("API key for DeepSeek")).toHaveValue("sk-draft-deepseek")
    expect(screen.getByLabelText("Base URL for DeepSeek")).toHaveValue("https://draft.deepseek.test/v1")
  })

  it("shows every OpenAI connection method as direct radio choices", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "openai",
        name: "OpenAI",
        source: "env",
        env: ["OPENAI_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
        authCapabilities: [
          {
            method: "chatgpt-browser",
            label: "ChatGPT Pro/Plus (browser)",
            kind: "browser_oauth",
            recommended: true,
          },
          {
            method: "chatgpt-headless",
            label: "ChatGPT Pro/Plus (headless)",
            kind: "device_code",
          },
          {
            method: "api-key",
            label: "API key",
            kind: "api_key",
          },
        ],
        authState: {
          providerID: "openai",
          scope: "global",
          activeMethod: "chatgpt-browser",
          status: "connected",
          capabilities: [],
          credentials: [],
        },
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })

    render(<App />)

    await openProviderSettingsSection()
    await screen.findByRole("heading", { name: "OpenAI" })

    expect(screen.queryByLabelText("Authentication method for OpenAI")).not.toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "ChatGPT Pro/Plus（浏览器登录）" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "ChatGPT Pro/Plus（设备码登录）" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "使用环境变量 OPENAI_API_KEY" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "手动输入 API key" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("radio", { name: "ChatGPT Pro/Plus（设备码登录）" }))
    expect(screen.getByRole("button", { name: "开始设备登录" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("radio", { name: "手动输入 API key" }))
    expect(screen.getByLabelText("API key for OpenAI")).toBeInTheDocument()
  })

  it("saves provider overrides from the settings page", async () => {
    const refreshedCatalog = createDeferred<
      {
        id: string
        name: string
        source: string
        env: string[]
        configured: boolean
        available: boolean
        apiKeyConfigured: boolean
        baseURL: string
        modelCount: number
      }[]
    >()
    const refreshedModels = createDeferred<{
      items: {
        id: string
        providerID: string
        name: string
        status: string
        available: boolean
        capabilities: {
          temperature: boolean
          reasoning: boolean
          attachment: boolean
          toolcall: boolean
          input: {
            text: boolean
            audio: boolean
            image: boolean
            video: boolean
            pdf: boolean
          }
          output: {
            text: boolean
            audio: boolean
            image: boolean
            video: boolean
            pdf: boolean
          }
        }
        limit: {
          context: number
          output: number
        }
      }[]
      selection: {
        model?: string
        small_model?: string
      }
    }>()

    window.desktop!.getGlobalProviderCatalog = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "api",
          env: ["DEEPSEEK_API_KEY"],
          configured: false,
          available: false,
          apiKeyConfigured: false,
          baseURL: "https://api.deepseek.com",
          modelCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "deepseek",
          name: "DeepSeek",
          source: "config",
          env: ["DEEPSEEK_API_KEY"],
          configured: true,
          available: true,
          apiKeyConfigured: true,
          baseURL: "https://proxy.deepseek.test/v1",
          modelCount: 1,
        },
      ])
      .mockImplementationOnce(() => refreshedCatalog.promise)
    window.desktop!.getGlobalModels = vi
      .fn()
      .mockResolvedValueOnce({
        items: [],
        selection: {},
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "deepseek-reasoner",
            providerID: "deepseek",
            name: "DeepSeek Reasoner",
            status: "active",
            available: true,
            capabilities: {
              temperature: true,
              reasoning: true,
              attachment: false,
              toolcall: true,
              input: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
              },
              output: {
                text: true,
                audio: false,
                image: false,
                video: false,
                pdf: false,
              },
            },
            limit: {
              context: 128000,
              output: 8192,
            },
          },
        ],
        selection: {},
      })
      .mockImplementationOnce(() => refreshedModels.promise)

    render(<App />)

    await openProviderSettingsSection()
    await screen.findByRole("heading", { name: "DeepSeek" })
    fireEvent.change(screen.getByLabelText("Base URL for DeepSeek"), {
      target: {
        value: "https://proxy.deepseek.test/v1",
      },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save DeepSeek settings" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalProvider).toHaveBeenCalledWith({
        providerID: "deepseek",
        provider: {
          name: "DeepSeek",
          env: ["DEEPSEEK_API_KEY"],
          options: {
            baseURL: "https://proxy.deepseek.test/v1",
          },
        },
      })
    })

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(2)
      expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole("heading", { name: "DeepSeek" })).toBeInTheDocument()
    expect(screen.queryByText("Fetching provider catalog")).not.toBeInTheDocument()

    refreshedCatalog.resolve([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://proxy.deepseek.test/v1",
        modelCount: 1,
      },
    ])
    refreshedModels.resolve({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {},
    })

    expect(await screen.findByText("Provider settings saved.")).toBeInTheDocument()
    expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalledTimes(2)
    expect(window.desktop!.getGlobalModels).toHaveBeenCalledTimes(2)
  })

  it("closes settings on escape or backdrop click", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [],
      selection: {},
    })

    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    expect(appShell).not.toBeNull()
    expect(appShell).not.toHaveClass("is-settings-open")

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument()
    expect(appShell).toHaveClass("is-settings-open")

    const settingsOverlay = container.querySelector(".settings-page-overlay")
    expect(settingsOverlay).not.toBeNull()
    fireEvent.click(settingsOverlay!)

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    })
    expect(appShell).not.toHaveClass("is-settings-open")

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeInTheDocument()
    expect(appShell).toHaveClass("is-settings-open")

    fireEvent.keyDown(window, { key: "Escape" })

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument()
    })
    expect(appShell).not.toHaveClass("is-settings-open")
  })

  it("drags settings within the main window", async () => {
    const { container } = render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    const dialog = await screen.findByRole("dialog", { name: "Settings" })
    const settingsOverlay = container.querySelector(".settings-page-overlay")
    const settingsHeader = container.querySelector(".settings-page-header")
    expect(settingsOverlay).not.toBeNull()
    expect(settingsHeader).not.toBeNull()

    Object.defineProperty(settingsOverlay!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        top: 0,
        width: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(dialog, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 500,
        height: 400,
        left: 200,
        right: 600,
        top: 100,
        width: 400,
        x: 200,
        y: 100,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(settingsHeader!, {
      button: 0,
      clientX: 400,
      clientY: 120,
      pointerId: 7,
    })

    await waitFor(() => {
      expect(dialog).toHaveClass("is-dragging")
    })

    fireEvent.pointerMove(window, {
      clientX: 500,
      clientY: 170,
      pointerId: 7,
    })

    await waitFor(() => {
      expect(dialog).toHaveStyle({ transform: "translate3d(100px, 50px, 0)" })
    })

    fireEvent.pointerUp(window, {
      pointerId: 7,
    })

    await waitFor(() => {
      expect(dialog).not.toHaveClass("is-dragging")
    })
  })

  it("updates the global model selection from settings", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 1,
      },
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: ["OPENAI_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
        {
          id: "gpt-4o-mini",
          providerID: "openai",
          name: "GPT-4o mini",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
      },
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))
    expect(screen.getByText("GPT-4o mini")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Primary model: DeepSeek / DeepSeek Reasoner" }))
    let modelPicker = screen.getByRole("dialog", { name: "Primary model model picker" })
    fireEvent.change(within(modelPicker).getByRole("searchbox", { name: "Search providers or models" }), {
      target: {
        value: "openai",
      },
    })
    fireEvent.click(within(modelPicker).getByRole("option", { name: "GPT-4o mini" }))

    fireEvent.click(screen.getByRole("button", { name: "Small model: Use server default" }))
    modelPicker = screen.getByRole("dialog", { name: "Small model model picker" })
    fireEvent.click(within(modelPicker).getByRole("option", { name: "DeepSeek Reasoner" }))

    await waitFor(() => {
      expect(window.desktop!.updateGlobalModelSelection).toHaveBeenCalledWith({
        model: "openai/gpt-4o-mini",
        small_model: "deepseek/deepseek-reasoner",
      })
    })

    expect(await screen.findByText("Model settings saved.")).toBeInTheDocument()
  })

  it("uses global provider settings APIs when a workspace is selected", async () => {
    window.desktop!.getGlobalProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "deepseek",
        name: "DeepSeek",
        source: "config",
        env: ["DEEPSEEK_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.deepseek.com",
        modelCount: 2,
      },
    ])
    window.desktop!.getGlobalModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
      },
    })
    window.desktop!.getProjectProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: ["OPENAI_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
      },
    ])
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "gpt-4o-mini",
          providerID: "openai",
          name: "GPT-4o mini",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "openai/gpt-4o-mini",
        small_model: "openai/gpt-4o-mini",
      },
    })
    window.desktop!.updateProjectProvider = vi.fn().mockResolvedValue({
      provider: {
        id: "openai",
        name: "OpenAI",
        available: true,
        apiKeyConfigured: true,
      },
      selection: {},
    })
    window.desktop!.deleteProjectProvider = vi.fn().mockResolvedValue({
      providerID: "openai",
      selection: {},
    })
    window.desktop!.updateProjectModelSelection = vi.fn().mockResolvedValue({
      model: "openai/gpt-4o-mini",
      small_model: "openai/gpt-4o-mini",
    })
    window.desktop!.refreshProjectProviderCatalog = vi.fn().mockResolvedValue([
      {
        id: "openai",
        name: "OpenAI",
        source: "config",
        env: ["OPENAI_API_KEY"],
        configured: true,
        available: true,
        apiKeyConfigured: true,
        baseURL: "https://api.openai.com/v1",
        modelCount: 1,
      },
    ])

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getProjectModels).toHaveBeenCalledWith({
        projectID: "project-2",
      })
    })
    const projectModelCallCountBeforeSettings = vi.mocked(window.desktop!.getProjectModels).mock.calls.length

    const settingsDialog = await openProviderSettingsSection()

    await waitFor(() => {
      expect(window.desktop!.getGlobalProviderCatalog).toHaveBeenCalled()
      expect(window.desktop!.getGlobalModels).toHaveBeenCalled()
    })

    expect(window.desktop!.getProjectProviderCatalog).not.toHaveBeenCalled()
    expect(window.desktop!.getProjectModels).toHaveBeenCalledTimes(projectModelCallCountBeforeSettings)

    fireEvent.click(screen.getByRole("button", { name: "Refresh provider catalog" }))

    await waitFor(() => {
      expect(window.desktop!.refreshGlobalProviderCatalog).toHaveBeenCalledTimes(1)
    })

    expect(window.desktop!.refreshProjectProviderCatalog).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /^Models/ }))

    expect((await within(settingsDialog).findAllByText("DeepSeek Reasoner")).length).toBeGreaterThan(0)
    expect(within(settingsDialog).queryByText("GPT-4o mini")).not.toBeInTheDocument()
  })

  it("updates the active session model selection from the composer menu", async () => {
    const modelPayload = {
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
        {
          id: "gpt-4o-mini",
          providerID: "openai",
          name: "GPT-4o mini",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {
        model: "deepseek/deepseek-reasoner",
        small_model: "deepseek/deepseek-reasoner",
      },
    }
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue(modelPayload)
    window.desktop!.getSessionModels = vi.fn().mockResolvedValue(modelPayload)
    window.desktop!.updateSessionModelSelection = vi.fn().mockResolvedValue({
      model: "openai/gpt-4o-mini",
      small_model: "deepseek/deepseek-reasoner",
    })

    render(<App />)

    expect(await screen.findByRole("button", { name: "Add attachments" })).toBeDisabled()
    fireEvent.click(await screen.findByRole("button", { name: "Select model: DeepSeek Reasoner" }))
    const modelList = screen.getByRole("listbox", { name: "Model selection" })
    expect(within(modelList).queryByRole("option", { name: "Use server default" })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search models" }), {
      target: {
        value: "gpt",
      },
    })
    expect(within(modelList).queryByRole("option", { name: /DeepSeek Reasoner/ })).not.toBeInTheDocument()
    fireEvent.click(within(modelList).getByRole("option", { name: "GPT-4o mini OpenAI" }))

    await waitFor(() => {
      expect(window.desktop!.updateSessionModelSelection).toHaveBeenCalledWith({
        sessionID: "session-chat-1",
        model: "openai/gpt-4o-mini",
      })
    })

    expect(await screen.findByRole("button", { name: "Select model: GPT-4o mini" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add attachments" })).toBeEnabled()
  })

  it("includes the selected OpenAI reasoning effort in composer sends", async () => {
    const gpt54Model = {
      id: "gpt-5.4",
      providerID: "openai",
      name: "GPT-5.4",
      status: "active",
      available: true,
      capabilities: {
        temperature: false,
        reasoning: true,
        attachment: false,
        toolcall: true,
        input: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
        output: {
          text: true,
          audio: false,
          image: false,
          video: false,
          pdf: false,
        },
      },
      limit: {
        context: 272000,
        output: 8192,
      },
    }

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
      items: [gpt54Model],
      selection: {
        model: "openai/gpt-5.4",
        small_model: "openai/gpt-5.4",
      },
      effectiveModel: gpt54Model,
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Select reasoning effort: Medium" }))
    expect(screen.queryByRole("option", { name: "Model default" })).not.toBeInTheDocument()
    expect(screen.queryByText("Spend more compute on harder or more ambiguous tasks.")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("option", { name: /^High/ }))

    expect(await screen.findByRole("button", { name: "Select model: GPT-5.4" })).toBeInTheDocument()
    expect(await screen.findByRole("button", { name: "Select reasoning effort: High" })).toBeInTheDocument()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Trace the new toolbar flow")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: [],
        text: "Trace the new toolbar flow",
        reasoningEffort: "high",
      }))
    })
  })

  it("renders the project skill selector in the session canvas top menu and still sends selected skills", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getProjectSkills = vi.fn().mockResolvedValue([
      {
        id: "skill-layout-review",
        name: "layout-review",
        description: "Review the current layout against the desktop shell spec.",
        path: "C:\\Users\\19128\\.anybox\\skills\\layout-review\\SKILL.md",
        scope: "user",
      },
    ])
    window.desktop!.getProjectSkillSelection = vi.fn().mockResolvedValue({
      skillIDs: [],
    })
    window.desktop!.updateProjectSkillSelection = vi.fn().mockResolvedValue({
      skillIDs: ["skill-layout-review"],
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(window.desktop!.getProjectSkills).toHaveBeenCalledWith({
        projectID: "project-2",
      })
      expect(window.desktop!.getProjectSkillSelection).toHaveBeenCalledWith({
        projectID: "project-2",
      })
    })

    const skillButton = await screen.findByRole("button", { name: "Select project skills: Skills" })
    expect(skillButton.closest(".session-canvas-top-menu")).not.toBeNull()

    const composer = document.querySelector(".composer")
    expect(composer).not.toBeNull()
    expect(within(composer as HTMLElement).queryByRole("button", { name: /^Select project skills:/ })).not.toBeInTheDocument()

    fireEvent.click(skillButton)

    const skillMenu = screen.getByRole("dialog", { name: "Project skill selection" })
    expect(within(skillMenu).getByRole("searchbox", { name: "Search skills" })).toBeInTheDocument()
    fireEvent.click(await within(skillMenu).findByRole("option", { name: "layout-review" }))

    await waitFor(() => {
      expect(window.desktop!.updateProjectSkillSelection).toHaveBeenCalledWith({
        projectID: "project-2",
        skillIDs: ["skill-layout-review"],
      })
    })

    expect(await screen.findByRole("button", { name: "Select project skills: layout-review" })).toBeInTheDocument()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Use the project skill selection for this task")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: ["skill-layout-review"],
        text: "Use the project skill selection for this task",
      }))
    })

    expect(await screen.findByRole("button", { name: "Select project skills: layout-review" })).toBeInTheDocument()
  })

  it("renders the project MCP selector in the session canvas top menu and persists selected servers", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getGlobalMcpServers = vi.fn().mockResolvedValue([
      {
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command: "npx",
        enabled: true,
      },
    ])
    window.desktop!.getProjectMcpSelection = vi.fn().mockResolvedValue({
      serverIDs: [],
    })
    window.desktop!.updateProjectMcpSelection = vi.fn().mockResolvedValue({
      serverIDs: ["filesystem"],
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(window.desktop!.getGlobalMcpServers).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getProjectMcpSelection).toHaveBeenCalledWith({
        projectID: "project-2",
      })
    })

    const mcpButton = await screen.findByRole("button", { name: "Select project MCP servers: MCP" })
    expect(mcpButton.closest(".session-canvas-top-menu")).not.toBeNull()

    fireEvent.click(mcpButton)

    const mcpMenu = screen.getByRole("dialog", { name: "Project MCP server selection" })
    fireEvent.click(await within(mcpMenu).findByRole("button", { name: /Filesystem/i }))

    await waitFor(() => {
      expect(window.desktop!.updateProjectMcpSelection).toHaveBeenCalledWith({
        projectID: "project-2",
        serverIDs: ["filesystem"],
      })
    })

    expect(await screen.findByRole("button", { name: "Select project MCP servers: Filesystem" })).toBeInTheDocument()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Keep the selected MCP servers on the project")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: [],
        text: "Keep the selected MCP servers on the project",
      }))
    })

    expect(await screen.findByRole("button", { name: "Select project MCP servers: Filesystem" })).toBeInTheDocument()
  })

  it("adds composer attachments and includes them in agent requests", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "gpt-4o-mini",
          providerID: "openai",
          name: "GPT-4o mini",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: false,
            attachment: true,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: true,
              video: false,
              pdf: true,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {},
      effectiveModel: {
        id: "gpt-4o-mini",
        providerID: "openai",
        name: "GPT-4o mini",
        status: "active",
        available: true,
        capabilities: {
          temperature: true,
          reasoning: false,
          attachment: true,
          toolcall: true,
          input: {
            text: true,
            audio: false,
            image: true,
            video: false,
            pdf: true,
          },
          output: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
        },
        limit: {
          context: 128000,
          output: 8192,
        },
      },
    })
    window.desktop!.pickComposerAttachments = vi.fn().mockResolvedValue([
      "C:\\Refs\\hero.png",
      "C:\\Refs\\brief.pdf",
    ])

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(window.desktop!.getProjectModels).toHaveBeenCalledWith({
        projectID: "project-2",
      })
      expect(screen.getByRole("button", { name: "Add attachments" })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole("button", { name: "Add attachments" }))

    expect(await screen.findByText("hero.png")).toBeInTheDocument()
    expect(screen.getByText("brief.pdf")).toBeInTheDocument()

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Use the references to refine the layout")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        attachments: [
          { path: "C:\\Refs\\hero.png", name: "hero.png" },
          { path: "C:\\Refs\\brief.pdf", name: "brief.pdf" },
        ],
        skills: [],
        text: "Use the references to refine the layout",
      }))
    })
  })

  it("submits composer prompts without an agent mode selector", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    expect(screen.queryByRole("button", { name: /^Agent mode:/ })).not.toBeInTheDocument()
    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Audit the toolbar changes")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: [],
        text: "Audit the toolbar changes",
      }))
    })
  })

  it("submits composer prompts with Enter and exposes the shortcut hint", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })
    const sendButton = getComposerSendButton()

    expect(sendButton).toHaveAttribute("title", "Send task. Press Enter to send. Press Shift+Enter for a newline.")
    expect(sendButton).toHaveAttribute("aria-description", "Press Enter to send. Press Shift+Enter for a newline.")
    expect(sendButton).toHaveAttribute("aria-keyshortcuts", "Enter")
    expect(draftInput).toHaveAttribute("aria-description", "Press Enter to send. Press Shift+Enter for a newline.")

    setComposerDraftValue(draftInput, "Submit from the keyboard")

    const enterEvent = createEvent.keyDown(draftInput, { key: "Enter", code: "Enter" })
    fireEvent(draftInput, enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: [],
        text: "Submit from the keyboard",
      }))
    })
  })

  it("keeps Shift+Enter available for newline insertion in the composer", () => {
    render(<App />)

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })

    setComposerDraftValue(draftInput, "Keep editing this draft")

    const shiftEnterEvent = createEvent.keyDown(draftInput, {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
    })
    fireEvent(draftInput, shiftEnterEvent)

    expect(shiftEnterEvent.defaultPrevented).toBe(false)
    expect(window.desktop!.agentSession!.sendTurn).not.toHaveBeenCalled()
  })

  it("does not submit composer prompts while IME composition is active", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
    })

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })

    setComposerDraftValue(draftInput, "你好")

    fireEvent.compositionStart(draftInput)

    const composingEnterEvent = createEvent.keyDown(draftInput, {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
    })
    fireEvent(draftInput, composingEnterEvent)

    expect(composingEnterEvent.defaultPrevented).toBe(false)
    expect(window.desktop!.agentSession!.sendTurn).not.toHaveBeenCalled()

    fireEvent.compositionEnd(draftInput)

    const enterEvent = createEvent.keyDown(draftInput, { key: "Enter", code: "Enter" })
    fireEvent(draftInput, enterEvent)

    expect(enterEvent.defaultPrevented).toBe(true)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.sendTurn).toHaveBeenCalledWith(expect.objectContaining({
        backendSessionID: "session-backend",
        skills: [],
        text: "你好",
      }))
    })
  })

  it("archives a session from the sidebar", async () => {
    window.desktop!.archiveAgentSession = vi.fn().mockResolvedValue({
      sessionID: "session-chat-1",
      projectID: "project-2",
      directory: "C:\\Projects\\Project 2",
      archivedAt: 1,
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Archive session Chat 1" }))

    await waitFor(() => {
      expect(window.desktop!.archiveAgentSession).toHaveBeenCalledWith({
        sessionID: "session-chat-1",
      })
    })
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
  })

  it("unsubscribes a live session stream when archiving a session", async () => {
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Project 2",
        directory: "C:\\Projects\\Project 2",
        name: "Project 2",
        created: 1,
        updated: 20,
        project: {
          id: "project-2",
          name: "Project 2",
          worktree: "C:\\Projects\\Project 2",
        },
        sessions: [
          {
            id: "session-chat-1",
            projectID: "project-2",
            directory: "C:\\Projects\\Project 2",
            title: "Chat 1",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.subscribe = vi.fn().mockResolvedValue({
      backendSessionID: "session-chat-1",
    })
    window.desktop!.agentSession!.unsubscribe = vi.fn().mockResolvedValue({
      backendSessionID: "session-chat-1",
      removed: true,
    })
    window.desktop!.archiveAgentSession = vi.fn().mockResolvedValue({
      sessionID: "session-chat-1",
      projectID: "project-2",
      directory: "C:\\Projects\\Project 2",
      archivedAt: 1,
    })

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.subscribe).toHaveBeenCalledWith({
        uiSessionID: "session-chat-1",
        backendSessionID: "session-chat-1",
      })
    })

    fireEvent.click(screen.getByRole("button", { name: "Archive session Chat 1" }))

    await waitFor(() => {
      expect(window.desktop!.agentSession!.unsubscribe).toHaveBeenCalledWith({
        backendSessionID: "session-chat-1",
      })
    })
  })

  it("removes inline side chats when archiving a parent session cascade", async () => {
    window.desktop!.archiveAgentSession = vi.fn().mockResolvedValue({
      sessionID: "session-chat-1",
      projectID: "project-2",
      directory: "C:\\Projects\\Project 2",
      archivedAt: 1,
      archivedSessionIDs: ["session-chat-1", "session-side-chat-1"],
    })

    render(<App />)

    fireEvent.click(await screen.findByRole("button", { name: "Open side chat" }))
    expect(await screen.findByRole("region", { name: "Nested side chat" })).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Archive session Chat 1" }))

    await waitFor(() => {
      expect(window.desktop!.archiveAgentSession).toHaveBeenCalledWith({
        sessionID: "session-chat-1",
      })
    })
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Nested side chat" })).not.toBeInTheDocument()
      expect(screen.queryByText("Anchored reply snapshot")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
    })
  })

  it("removes a folder from the sidebar without deleting it from the backend", () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "src" }))
    expect(screen.getByRole("button", { name: "src" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "app" })).toHaveAttribute("aria-expanded", "true")

    fireEvent.click(screen.getByRole("button", { name: "\u79FB\u9664 app" }))

    expect(screen.queryByRole("button", { name: "app" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "src" }).closest(".project-row")).toHaveClass("is-active")
    expect(screen.getByRole("button", { name: "src" })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Layout pass" })).toBeInTheDocument()
    expect(window.desktop!.deleteProjectWorkspace).not.toHaveBeenCalled()
  })

  it("applies maximized window styling when the window starts maximized", async () => {
    window.desktop!.getWindowState = vi.fn().mockResolvedValue({
      isMaximized: true,
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(container.firstChild).toHaveClass("window-shell", "is-maximized")
    })
  })

  it("appends a prompt and clears the draft input", async () => {
    render(<App />)

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Ship custom titlebar")
    fireEvent.click(getComposerSendButton())

    await waitFor(() => {
      expect(screen.getAllByText("Ship custom titlebar").length).toBeGreaterThan(0)
      expectComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "")
    })
  })

  it("shows a minimal waiting hint before the first visible streamed output arrives", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let releaseStream: (() => void) | undefined
    let activeStreamID = ""
    let activeSessionID = ""

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        activeStreamID = input.clientTurnID
        activeSessionID = input.backendSessionID

        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Wait for the first token")
    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    expect(screen.getByText("Preparing...")).toBeInTheDocument()
    expect(getComposerSendButton()).toBeEnabled()

    await act(async () => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "delta",
        data: {
          kind: "text",
          partID: "part-text-1",
          delta: "Ready now.",
          text: "Ready now.",
        },
      }))
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        event: "done",
        data: {
          sessionID: activeSessionID,
          parts: [{ id: "part-text-1", type: "text", text: "Ready now." }],
        },
      }))
      releaseStream?.()
      await Promise.resolve()
    })

    expect(await screen.findByText("Ready now.")).toBeInTheDocument()
    expect(screen.queryByText("Preparing...")).not.toBeInTheDocument()
  })

  it("ignores stale session stream events after the request stream settles a turn", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let sessionStreamListener: DesktopAgentSessionEventListener | undefined
    let releaseStream: (() => void) | undefined
    let activeStreamID = ""
    let activeSessionID = ""

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 10,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.agentSession!.loadHistory = vi.fn().mockResolvedValue([])
    window.desktop!.agentSession!.subscribe = vi.fn().mockResolvedValue({
      backendSessionID: "session-atlas-review",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      sessionStreamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        activeStreamID = input.clientTurnID
        activeSessionID = input.backendSessionID

        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.subscribe).toHaveBeenCalledWith({
        uiSessionID: "session-atlas-review",
        backendSessionID: "session-atlas-review",
      })
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Finish without stale placeholders")
    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    expect(screen.getByText("Preparing...")).toBeInTheDocument()

    await act(async () => {
      streamListener?.(createRequestStreamEvent({
        backendSessionID: activeSessionID,
        clientTurnID: activeStreamID,
        id: "102:turn-runtime:3",
        event: "runtime",
        data: {
          eventID: "event-completed",
          sessionID: "session-atlas-review",
          turnID: "turn-runtime",
          seq: 3,
          timestamp: 102,
          type: "turn.completed",
          payload: {
            status: "completed",
            finishReason: "stop",
            parts: [{ id: "part-text", type: "text", text: "Done." }],
          },
        },
      }))
      releaseStream?.()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByText("Preparing...")).not.toBeInTheDocument()
    })

    act(() => {
      sessionStreamListener?.(createSubscriptionStreamEvent({
        backendSessionID: "session-atlas-review",
        id: "100:turn-runtime:1",
        event: "runtime",
        data: {
          eventID: "event-started-late",
          sessionID: "session-atlas-review",
          turnID: "turn-runtime",
          seq: 1,
          timestamp: 100,
          type: "turn.started",
          payload: {},
        },
      }))
    })

    expect(screen.queryByText("Preparing...")).not.toBeInTheDocument()
  })

  it("renders streamed reasoning and response before completion", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let finishStream: (() => void) | undefined

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "started",
          data: { sessionID: input.backendSessionID },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "delta",
          data: { kind: "reasoning", delta: "Planning live update." },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "delta",
          data: { kind: "text", delta: "Streaming answer" },
        }))

        await new Promise<void>((resolve) => {
          finishStream = () => {
            streamListener?.(createRequestStreamEvent({
              backendSessionID: input.backendSessionID,
              clientTurnID: input.clientTurnID,
              event: "done",
              data: {
                sessionID: input.backendSessionID,
                parts: [{ id: "part-text", type: "text", text: "Streaming answer" }],
              },
            }))
            resolve()
          }
        })

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.getAgentHealth).toHaveBeenCalledTimes(1)
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Show live output")
    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    const liveReasoning = await screen.findByText("Planning live update.")
    const reasoningItem = liveReasoning.closest(".trace-item")

    expect(liveReasoning).toBeInTheDocument()
    expect(reasoningItem).toHaveAttribute("data-kind", "reasoning")
    expect(reasoningItem).not.toBeNull()
    expect(reasoningItem?.querySelector(".trace-item-header")).toBeNull()
    expect(screen.getByText("Streaming answer")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Streaming response" })).not.toBeInTheDocument()
    expect(screen.queryByText("Renderer subscribed to live backend updates.")).not.toBeInTheDocument()
    expect(screen.queryByText("Waiting for backend response.")).not.toBeInTheDocument()
    expect(getComposerSendButton()).toBeEnabled()

    act(() => {
      finishStream?.()
    })

    expect(await screen.findByText("Streaming answer")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Backend response received" })).not.toBeInTheDocument()
      expect(screen.queryByText("Backend finished streaming this turn.")).not.toBeInTheDocument()
      expect(getComposerSendButton()).toBeEnabled()
    })
  })

  it("refreshes the sidebar workspace metadata after a streamed session updates git metadata", async () => {
    let sessionStreamListener: DesktopAgentSessionEventListener | undefined

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "prj_atlas",
          name: "client",
          worktree: "C:\\Projects\\Atlas\\client",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "prj_atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.openFolderWorkspace = vi.fn().mockResolvedValue({
      id: "C:\\Projects\\Atlas\\client",
      directory: "C:\\Projects\\Atlas\\client",
      name: "client",
      created: 1,
      updated: 21,
      project: {
        id: "prj_atlas",
        name: "Atlas",
        worktree: "C:\\Projects\\Atlas",
      },
      sessions: [
        {
          id: "session-atlas-review",
          projectID: "prj_atlas",
          directory: "C:\\Projects\\Atlas\\client",
          title: "Atlas review",
          created: 18,
          updated: 21,
        },
      ],
    } satisfies LoadedFolderWorkspace)
    window.desktop!.agentSession!.subscribe = vi.fn().mockResolvedValue({
      backendSessionID: "session-atlas-review",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      sessionStreamListener = listener
      return vi.fn()
    })

    render(<App />)

    expect((await screen.findAllByText("client")).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.subscribe).toHaveBeenCalledWith({
        uiSessionID: "session-atlas-review",
        backendSessionID: "session-atlas-review",
      })
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    act(() => {
      sessionStreamListener?.(createSubscriptionStreamEvent({
        backendSessionID: "session-atlas-review",
        event: "done",
        data: {
          message: {
            role: "assistant",
            created: 20,
          },
        },
      }))
    })

    await waitFor(() => {
      expect(window.desktop!.openFolderWorkspace).toHaveBeenCalledWith({
        directory: "C:\\Projects\\Atlas\\client",
      })
    })

    expect(await screen.findByText("Atlas")).toBeInTheDocument()
  })

  it("keeps consecutive streamed replies isolated to their own assistant cards", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined
    let callIndex = 0
    const streamedReplies = [
      {
        delta: "First reply",
        fullText: "First reply",
        finalText: "First reply",
      },
      {
        delta: "Second reply",
        fullText: "First replySecond reply",
        finalText: "Second reply",
      },
    ]

    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        const reply = streamedReplies[callIndex++]
        if (!reply) {
          throw new Error("Unexpected extra streamed reply")
        }

        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "started",
          data: { sessionID: input.backendSessionID },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "delta",
          data: {
            kind: "text",
            delta: reply.delta,
            text: reply.fullText,
          },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "done",
          data: {
            sessionID: input.backendSessionID,
            parts: [{ id: `part-text-${callIndex}`, type: "text", text: reply.finalText }],
          },
        }))

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.agentSession!.onEvent).toHaveBeenCalledTimes(1)
    })

    const draftInput = screen.getByRole("textbox", { name: "Task draft" })
    const sendButton = getComposerSendButton()

    setComposerDraftValue(draftInput, "First prompt")
    fireEvent.click(sendButton)

    expect(await screen.findByText("First reply")).toBeInTheDocument()
    await waitFor(() => {
      expect(sendButton).toBeEnabled()
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Second prompt")
    fireEvent.click(getComposerSendButton())

    expect(await screen.findByText("Second reply")).toBeInTheDocument()

    await waitFor(() => {
      const firstReplyTurn = screen.getByText("First reply").closest(".assistant-turn")
      const secondReplyTurn = screen.getByText("Second reply").closest(".assistant-turn")

      expect(firstReplyTurn).not.toBeNull()
      expect(secondReplyTurn).not.toBeNull()
      expect(firstReplyTurn).not.toBe(secondReplyTurn)
      expect(secondReplyTurn).not.toHaveTextContent("First reply")
    })
  })

  it("toggles folder tree expansion when clicking the same folder", () => {
    render(<App />)

    const appFolder = screen.getByRole("button", { name: "app" })
    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()

    fireEvent.click(appFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("button", { name: "Chat 1" })).not.toBeInTheDocument()

    fireEvent.click(appFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
  })

  it("keeps other folders expanded when selecting a different folder", () => {
    render(<App />)

    const appFolder = screen.getByRole("button", { name: "app" })
    const srcFolder = screen.getByRole("button", { name: "src" })

    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(srcFolder).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(srcFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(srcFolder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: "Chat 1" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Layout pass" })).toBeInTheDocument()
    expect(srcFolder.closest(".project-row")).toHaveClass("is-active")
    expect(appFolder.closest(".project-row")).not.toHaveClass("is-active")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)

    fireEvent.click(appFolder)

    expect(appFolder).toHaveAttribute("aria-expanded", "true")
    expect(srcFolder).toHaveAttribute("aria-expanded", "true")
    expect(appFolder.closest(".project-row")).toHaveClass("is-active")
    expect(srcFolder.closest(".project-row")).not.toHaveClass("is-active")
    expect(document.querySelectorAll(".project-row.is-active")).toHaveLength(1)
  })

  it("toggles the terminal panel from the right sidebar menu without changing the active inspector view", async () => {
    render(<App />)

    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    const collapsedToggle = within(inspector).getByRole("button", { name: "Toggle terminal panel" })
    expect(collapsedToggle.closest(".right-sidebar-top-menu")).not.toBeNull()

    fireEvent.click(collapsedToggle)

    await waitFor(() => {
      expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(1)
      expect(window.desktop!.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    expect(screen.getByRole("button", { name: /^Terminal 1,/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "New terminal" })).not.toBeInTheDocument()
    expect(within(inspector).getByRole("button", { name: "Toggle terminal panel" }).closest(".right-sidebar-top-menu")).not.toBeNull()
    expect(within(inspector).getByRole("button", { name: "Toggle terminal panel" })).toHaveTextContent("")
    expect(screen.queryByText("New terminal")).not.toBeInTheDocument()
    expect(document.querySelector(".terminal-view-meta")).toBeNull()

    const viewHost = inspector.querySelector(".right-sidebar-view-host")
    const terminalPanel = inspector.querySelector(".terminal-panel")
    expect(viewHost).not.toBeNull()
    expect(terminalPanel).not.toBeNull()
    expect(viewHost).toHaveClass("is-changes")
    expect(await within(inspector).findByText("No changes in this session.")).toBeInTheDocument()
    expect(viewHost!.compareDocumentPosition(terminalPanel!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    fireEvent.click(within(inspector).getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Terminal 1,/ })).not.toBeInTheDocument()
    })

    expect(within(inspector).getByRole("button", { name: "Toggle terminal panel" }).closest(".right-sidebar-top-menu")).not.toBeNull()
  })

  it("keeps the terminal toggle in the right sidebar menu when the left rail is hidden", async () => {
    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }))
    await screen.findByRole("dialog", { name: "Settings" })
    fireEvent.click(screen.getByRole("button", { name: /^Appearance/ }))
    fireEvent.click(screen.getByRole("switch", { name: "Show left rail" }))

    const inspector = screen.getByRole("complementary", { name: "Inspector sidebar" })
    const collapsedToggle = within(inspector).getByRole("button", { name: "Toggle terminal panel" })
    expect(collapsedToggle.closest(".right-sidebar-top-menu")).not.toBeNull()
  })

  it("shows real context pressure from streamed assistant usage against the selected model context window", async () => {
    let streamListener: DesktopAgentSessionEventListener | undefined

    window.desktop!.listFolderWorkspaces = vi.fn().mockResolvedValue([
      {
        id: "C:\\Projects\\Atlas\\client",
        directory: "C:\\Projects\\Atlas\\client",
        name: "client",
        created: 1,
        updated: 20,
        project: {
          id: "project-atlas",
          name: "Atlas",
          worktree: "C:\\Projects\\Atlas",
        },
        sessions: [
          {
            id: "session-atlas-review",
            projectID: "project-atlas",
            directory: "C:\\Projects\\Atlas\\client",
            title: "Atlas review",
            created: 18,
            updated: 20,
          },
        ],
      },
    ])
    window.desktop!.getProjectModels = vi.fn().mockResolvedValue({
      items: [
        {
          id: "deepseek-reasoner",
          providerID: "deepseek",
          name: "DeepSeek Reasoner",
          status: "active",
          available: true,
          capabilities: {
            temperature: true,
            reasoning: true,
            attachment: false,
            toolcall: true,
            input: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
            output: {
              text: true,
              audio: false,
              image: false,
              video: false,
              pdf: false,
            },
          },
          limit: {
            context: 128000,
            output: 8192,
          },
        },
      ],
      selection: {},
      effectiveModel: {
        id: "deepseek-reasoner",
        providerID: "deepseek",
        name: "DeepSeek Reasoner",
        status: "active",
        available: true,
        capabilities: {
          temperature: true,
          reasoning: true,
          attachment: false,
          toolcall: true,
          input: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
          output: {
            text: true,
            audio: false,
            image: false,
            video: false,
            pdf: false,
          },
        },
        limit: {
          context: 128000,
          output: 8192,
        },
      },
    })
    window.desktop!.getAgentHealth = vi.fn().mockResolvedValue({
      ok: true,
      baseURL: "http://127.0.0.1:4096",
    })
    window.desktop!.agentSession!.onEvent = vi.fn((listener) => {
      streamListener = listener
      return vi.fn()
    })
    window.desktop!.agentSession!.sendTurn = vi.fn().mockImplementation(
      async (input: {
        clientTurnID: string
        backendSessionID: string
        text: string
      }) => {
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "started",
          data: {
            sessionID: input.backendSessionID,
          },
        }))
        streamListener?.(createRequestStreamEvent({
          backendSessionID: input.backendSessionID,
          clientTurnID: input.clientTurnID,
          event: "done",
          data: {
            sessionID: input.backendSessionID,
            message: {
              id: "message-assistant-1",
              sessionID: input.backendSessionID,
              role: "assistant",
              created: 100,
              completed: 120,
              tokens: {
                input: 64000,
                output: 3200,
                reasoning: 800,
                cache: {
                  read: 1600,
                  write: 0,
                },
              },
            },
            parts: [{ id: "part-text-1", type: "text", text: "Pressure tracked." }],
          },
        }))

        return {
          clientTurnID: input.clientTurnID,
        }
      },
    )

    render(<App />)

    await waitFor(() => {
      expect(window.desktop!.listFolderWorkspaces).toHaveBeenCalledTimes(1)
      expect(window.desktop!.getProjectModels).toHaveBeenCalledWith({
        projectID: "project-atlas",
      })
    })

    setComposerDraftValue(screen.getByRole("textbox", { name: "Task draft" }), "Measure current context pressure")

    await act(async () => {
      fireEvent.click(getComposerSendButton())
      await Promise.resolve()
    })

    expect(
      await screen.findByRole("img", {
        name: "Context pressure 50% (64k / 128k input tokens)",
      }),
    ).toBeInTheDocument()
  })

  it("appends live terminal output directly into the active terminal view", async () => {
    let ptyListener:
      | ((event: {
          ptyID: string
          type: string
          [key: string]: unknown
        }) => void)
      | undefined

    window.desktop!.onPtyEvent = vi.fn((listener) => {
      ptyListener = listener
      return vi.fn()
    })

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(window.desktop!.attachPtySession).toHaveBeenCalledWith({
        id: "pty-1",
        cursor: 0,
      })
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "ready",
        session: {
          id: "pty-1",
          sessionID: "session-chat-1",
          title: "Terminal 1",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 24,
          cols: 80,
          status: "running",
          exitCode: null,
          createdAt: 1,
          updatedAt: 1,
          cursor: 8,
        },
        replay: {
          mode: "reset",
          buffer: "prompt> ",
          cursor: 8,
          startCursor: 0,
        },
      })
    })

    expect(await screen.findByText(/prompt>/)).toBeInTheDocument()

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "output",
        id: "out-1",
        data: "dir",
        cursor: 11,
      })
    })

    expect(await screen.findByText(/prompt>\s*dir/)).toBeInTheDocument()
  })

  it("keeps terminal output in the session-bound terminal control", async () => {
    let ptyListener:
      | ((event: {
          ptyID: string
          type: string
          [key: string]: unknown
        }) => void)
      | undefined

    window.desktop!.onPtyEvent = vi.fn((listener) => {
      ptyListener = listener
      return vi.fn()
    })
    window.desktop!.createPtySession = vi
      .fn()
      .mockResolvedValueOnce({
        id: "pty-1",
        sessionID: "session-chat-1",
        title: "Terminal 1",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 1,
        updatedAt: 1,
        cursor: 0,
      })
      .mockResolvedValueOnce({
        id: "pty-2",
        sessionID: "session-chat-1",
        title: "Terminal 2",
        cwd: "C:\\Projects\\fanfande_studio",
        shell: "powershell.exe",
        rows: 24,
        cols: 80,
        status: "running",
        exitCode: null,
        createdAt: 2,
        updatedAt: 2,
        cursor: 0,
      })
    window.desktop!.attachPtySession = vi.fn().mockImplementation(async ({ id }: { id: string }) => ({
      id,
      sessionID: "session-chat-1",
      title: id === "pty-1" ? "Terminal 1" : "Terminal 2",
      cwd: "C:\\Projects\\fanfande_studio",
      shell: "powershell.exe",
      rows: 24,
      cols: 80,
      status: "running",
      exitCode: null,
      createdAt: 1,
      updatedAt: 1,
      cursor: 0,
    }))

    render(<App />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle terminal panel" }))

    await waitFor(() => {
      expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(1)
    })

    act(() => {
      ptyListener?.({
        ptyID: "pty-1",
        type: "ready",
        session: {
          id: "pty-1",
          sessionID: "session-chat-1",
          title: "Terminal 1",
          cwd: "C:\\Projects\\fanfande_studio",
          shell: "powershell.exe",
          rows: 24,
          cols: 80,
          status: "running",
          exitCode: null,
          createdAt: 1,
          updatedAt: 1,
          cursor: 12,
        },
        replay: {
          mode: "reset",
          buffer: "first output",
          cursor: 12,
          startCursor: 0,
        },
      })
    })

    expect(await screen.findByText("first output")).toBeInTheDocument()

    expect(screen.queryByRole("button", { name: "New terminal" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /^Terminal 1,/i }))
    expect(window.desktop!.createPtySession).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("first output")).toBeInTheDocument()
  })

  it("collapses the sidebar from the rail toggle and restores it on second click", () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null

    expect(appShell).not.toBeNull()
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByTestId("sidebar-resizer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--sidebar-display-width: 0px")
    expect(screen.queryByRole("button", { name: "Open folder" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("sidebar-resizer")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand left sidebar" }).closest(".activity-rail")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain(`--sidebar-display-width: ${DEFAULT_SIDEBAR_WIDTH}px`)
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument()
    expect(screen.getByTestId("sidebar-resizer")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse left sidebar" }).closest(".activity-rail")).not.toBeNull()
  })

  it("collapses and restores the right sidebar from the canvas menu", () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const rightSidebarTopMenu = screen.getByLabelText("Right sidebar top menu")

    expect(appShell).not.toBeNull()
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 0px")
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar-resizer")).toBeInTheDocument()
    expect(within(rightSidebarTopMenu).getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(within(rightSidebarTopMenu).queryByRole("button", { name: "Collapse right sidebar" })).toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar-trailing")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Collapse right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-display-width: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 0px")
    expect(screen.queryByRole("complementary", { name: "Inspector sidebar" })).not.toBeInTheDocument()
    expect(screen.queryByTestId("right-sidebar-resizer")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Minimize window" }).closest(".pane-tab-bar")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Minimize window" }).closest(".pane-tab-bar-trailing")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Expand right sidebar" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Expand right sidebar" }).closest(".pane-tab-bar")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Expand right sidebar" }).closest(".pane-tab-bar-trailing")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Expand right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-display-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)
    expect(appShell!.getAttribute("style")).toContain("--window-controls-right-sidebar-clearance: 0px")
    expect(appShell!.getAttribute("style")).toContain("--window-controls-canvas-clearance: 0px")
    expect(screen.getByRole("complementary", { name: "Inspector sidebar" })).toBeInTheDocument()
    expect(screen.getByTestId("right-sidebar-resizer")).toBeInTheDocument()
    const restoredRightSidebarTopMenu = screen.getByLabelText("Right sidebar top menu")
    expect(within(restoredRightSidebarTopMenu).getByRole("button", { name: "Minimize window" })).toBeInTheDocument()
    expect(within(restoredRightSidebarTopMenu).queryByRole("button", { name: "Collapse right sidebar" })).toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse right sidebar" }).closest(".pane-tab-bar-trailing")).not.toBeNull()
  })

  it("resizes the left sidebar when dragging the divider", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null

    expect(appShell).not.toBeNull()
    Object.defineProperty(appShell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    fireEvent.click(screen.getByRole("button", { name: "Collapse right sidebar" }))

    expect(appShell!.getAttribute("style")).toContain(`--sidebar-width: ${DEFAULT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerDown(screen.getByTestId("sidebar-resizer"), {
      button: 0,
      clientX: 290,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 374,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain("--sidebar-width: 320px")

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 640,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--sidebar-width: ${MAX_SIDEBAR_WIDTH}px`)

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 120,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--sidebar-width: ${MIN_SIDEBAR_WIDTH}px`)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-sidebar")
    })
  })

  it("resizes the right sidebar when dragging the divider", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const expectedRightSidebarMaxWidth = Math.min(
      MAX_RIGHT_SIDEBAR_WIDTH,
      Math.round(1200 * (1 - RIGHT_SIDEBAR_MIN_LEFT_EDGE_RATIO)),
    )

    expect(appShell).not.toBeNull()
    Object.defineProperty(appShell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    fireEvent.click(screen.getByRole("button", { name: "Collapse left sidebar" }))

    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerDown(screen.getByTestId("right-sidebar-resizer"), {
      button: 0,
      clientX: 720,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 760,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain("--right-sidebar-width: 440px")

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 400,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${expectedRightSidebarMaxWidth}px`)

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 1100,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${MIN_RIGHT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-sidebar")
    })
  })

  it("stops resizing the right sidebar when the mouse button is no longer pressed", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null

    expect(appShell).not.toBeNull()
    Object.defineProperty(appShell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerDown(screen.getByTestId("right-sidebar-resizer"), {
      button: 0,
      clientX: 720,
      pointerType: "mouse",
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      buttons: 0,
      clientX: 760,
      pointerType: "mouse",
    })

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-sidebar")
    })
    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 760,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)
  })

  it("limits the right sidebar to two thirds of the app width even when the left sidebar is expanded", async () => {
    const { container } = render(<App />)
    const appShell = container.querySelector(".app-shell") as HTMLElement | null
    const expectedRightSidebarMaxWidth = Math.min(
      MAX_RIGHT_SIDEBAR_WIDTH,
      Math.round(1200 * (1 - RIGHT_SIDEBAR_MIN_LEFT_EDGE_RATIO)),
    )

    expect(appShell).not.toBeNull()
    Object.defineProperty(appShell!, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        width: 1200,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${DEFAULT_RIGHT_SIDEBAR_WIDTH}px`)

    fireEvent.pointerDown(screen.getByTestId("right-sidebar-resizer"), {
      button: 0,
      clientX: 720,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-sidebar")
    })

    fireEvent.pointerMove(window, {
      buttons: 1,
      clientX: 300,
      pointerType: "mouse",
    })
    expect(appShell!.getAttribute("style")).toContain(`--right-sidebar-width: ${expectedRightSidebarMaxWidth}px`)

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-sidebar")
    })
  })

  it("resizes neighboring workbench panes when dragging their divider", async () => {
    render(<App />)

    const panes = await createSiblingPaneFromCreateTab()
    expect(panes).toHaveLength(2)

    Object.defineProperty(panes[0], "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 800,
        width: 400,
        height: 800,
        toJSON: () => ({}),
      }),
    })
    Object.defineProperty(panes[1], "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 414,
        y: 0,
        left: 414,
        top: 0,
        right: 814,
        bottom: 800,
        width: 400,
        height: 800,
        toJSON: () => ({}),
      }),
    })

    fireEvent.pointerDown(screen.getByTestId("workbench-pane-resizer-0"), {
      button: 0,
      clientX: 400,
    })

    await waitFor(() => {
      expect(document.body).toHaveClass("is-resizing-workbench-pane")
    })

    fireEvent.pointerMove(window, {
      clientX: 500,
    })

    await waitFor(() => {
      expect(Number.parseFloat(panes[0].style.flexGrow)).toBeGreaterThan(0.5)
      expect(Number.parseFloat(panes[1].style.flexGrow)).toBeLessThan(0.5)
    })

    fireEvent.pointerUp(window)

    await waitFor(() => {
      expect(document.body).not.toHaveClass("is-resizing-workbench-pane")
    })
  })

  it("shows expand/collapse icon only while hovering a folder row", () => {
    render(<App />)

    const appFolder = screen.getByRole("button", { name: "app" })
    const appFolderLeading = appFolder.querySelector(".project-row-leading")
    const srcFolder = screen.getByRole("button", { name: "src" })
    const srcFolderLeading = srcFolder.querySelector(".project-row-leading")

    expect(appFolderLeading).toHaveAttribute("data-icon", "folder")
    expect(srcFolderLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(appFolder)
    expect(appFolderLeading).toHaveAttribute("data-icon", "expanded")

    fireEvent.mouseLeave(appFolder)
    expect(appFolderLeading).toHaveAttribute("data-icon", "folder")

    fireEvent.mouseEnter(srcFolder)
    expect(srcFolderLeading).toHaveAttribute("data-icon", "collapsed")

    fireEvent.mouseLeave(srcFolder)
    expect(srcFolderLeading).toHaveAttribute("data-icon", "folder")
  })

  it("keeps session rows aligned with folder rows and gives them the same hover treatment", () => {
    expect(styles).toMatch(/\.session-tree\s*\{[^}]*padding-left:\s*0;/s)
    expect(styles).toMatch(/\.project-row\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(/\.session-row\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(
      /\.project-row:hover,\s*\.project-row:focus-visible,\s*\.session-row:hover,\s*\.session-row:focus-visible\s*\{[^}]*background:\s*rgba\(84,\s*96,\s*109,\s*0\.08\);/s,
    )
  })

  it("keeps the prompt input shell and canvas tab caps on the documented radii", () => {
    expect(styles).toMatch(/\.prompt-input-shell\s*\{[^}]*border-radius:\s*28px;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s*\{[^}]*--canvas-region-tab-cap-radius:\s*8px;/s,
    )
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\s*\{[^}]*border-radius:\s*var\(--canvas-region-tab-cap-radius\) var\(--canvas-region-tab-cap-radius\) 0 0;/s,
    )
  })

  it("keeps preview comment hover highlight visibly blue across theme overrides", () => {
    const hoverHighlightBlocks = Array.from(
      styles.matchAll(/\.preview-hover-highlight\s*\{([^}]*)\}/g),
      (match) => match[1],
    )
    expect(hoverHighlightBlocks.length).toBeGreaterThan(0)
    const finalHoverHighlightBlock = hoverHighlightBlocks[hoverHighlightBlocks.length - 1] ?? ""

    expect(finalHoverHighlightBlock).toContain("border-color: #0a84ff;")
    expect(finalHoverHighlightBlock).toContain("background: rgba(10, 132, 255, 0.18);")
    expect(finalHoverHighlightBlock).not.toContain("border-color: var(--seg-accent)")
  })

  it("keeps the canvas tabs separate from the session top menu", () => {
    expect(styles).toMatch(/--brand-primary:\s*#d46b63;/i)
    expect(styles).toMatch(/--brand-accent-highlight:\s*#fca5a5;/i)
    expect(styles).toMatch(/--semantic-accent-icon-light:\s*#78716c;/i)
    expect(styles).toMatch(/--semantic-accent-icon-hover-light:\s*#b9534c;/i)
    expect(styles).toMatch(/--semantic-accent-icon-active-light:\s*#fca5a5;/i)
    expect(styles).toMatch(/--semantic-error-light:\s*#9f1239;/i)
    expect(styles).toMatch(/--semantic-error:\s*var\(--semantic-error-light\);/s)
    expect(styles).toMatch(/--semantic-success-surface-light:\s*#f0f6e7;/i)
    expect(styles).toMatch(/--semantic-success-surface:\s*var\(--semantic-success-surface-light\);/s)
    expect(styles).toMatch(/--seg-danger-border:\s*var\(--semantic-error-border\);/s)
    expect(styles).toMatch(/--surface-app-dark:\s*#1c1917;/i)
    expect(styles).toMatch(/--brand-primary-dark:\s*#e17068;/i)
    expect(styles).toMatch(/:root\[data-brand-theme="sage"\]\s*\{[^}]*--brand-primary:\s*#0f766e;[^}]*--brand-accent-highlight:\s*#2dd4bf;[^}]*--semantic-accent-icon-light:\s*#475569;[^}]*--semantic-accent-icon-hover-light:\s*#115e59;[^}]*--semantic-accent-icon-active-light:\s*#2dd4bf;/is)
    expect(styles).toMatch(/\.canvas\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto auto;[^}]*gap:\s*14px;/s)
    expect(styles).toMatch(/\.canvas-top-stack\s*\{[^}]*display:\s*grid;[^}]*gap:\s*6px;/s)
    expect(styles).toMatch(/\.workbench-pane\s*\{[^}]*flex:\s*1 1 0;[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/@property --pane-drop-preview-sheen-x\s*\{[^}]*syntax:\s*"&lt;percentage&gt;"|@property --pane-drop-preview-sheen-x\s*\{[^}]*syntax:\s*"<percentage>";/s)
    expect(styles).toMatch(/@property --pane-drop-preview-sheen-y\s*\{[^}]*initial-value:\s*50%;/s)
    expect(styles).toMatch(/\.workbench-pane-stage\s*\{[^}]*--pane-drop-preview-motion-duration:\s*220ms;[^}]*--pane-drop-preview-fade-duration:\s*180ms;[^}]*--pane-drop-preview-motion-curve:\s*cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);[^}]*--pane-drop-preview-sheen-x:\s*50%;[^}]*--pane-drop-preview-sheen-y:\s*50%;/s)
    expect(styles).toMatch(/\.workbench-pane-live-region\s*\{[^}]*position:\s*absolute;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto auto;/s)
    expect(styles).toMatch(/\.window-controls\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*flex-end;[^}]*gap:\s*4px;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.window-control,[\s\S]*?\{[^}]*color:\s*var\(--semantic-accent-icon\);/s)
    expect(styles).toMatch(/\.window-control svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.window-control:hover,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.window-control\.is-close:hover,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);/s)
    expect(styles).toMatch(/\.panel-toolbar\s*\{[^}]*min-height:\s*var\(--section-toolbar-height\);[^}]*padding:\s*0;[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.panel-toolbar\.window-drag-region\s*\{[^}]*-webkit-app-region:\s*drag;/s)
    expect(styles).toMatch(/\.shell-top-menu\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*center;/s)
    expect(styles).not.toMatch(/\.shell-top-menu,\s*\.right-sidebar-section-header,\s*\.right-sidebar-list-row\s*\{[^}]*align-items:\s*flex-start;/s)
    expect(styles).toMatch(/\.shell-top-menu\.is-three-column\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\s*\{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\.is-canvas\s*\{[^}]*width:\s*var\(--window-controls-canvas-clearance\);/s)
    expect(styles).toMatch(/\.panel-toolbar-window-controls-spacer\.is-right-sidebar\s*\{[^}]*width:\s*var\(--window-controls-right-sidebar-clearance\);/s)
    expect(styles).toMatch(/--section-toolbar-baseline:\s*var\(--section-toolbar-height\);/s)
    expect(styles).toMatch(/--section-toolbar-icon-size:\s*18px;/s)
    expect(styles).toMatch(/--section-toolbar-aux-icon-size:\s*12px;/s)
    expect(styles).toMatch(/\.top-menu-view-button\s*\{[^}]*border-radius:\s*8px;[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.top-menu-view-button-icon\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-top-menu svg\s*\{[^}]*width:\s*var\(--section-toolbar-icon-size\);[^}]*height:\s*var\(--section-toolbar-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(/\.session-tab-close svg\s*\{[^}]*width:\s*var\(--section-toolbar-aux-icon-size\);[^}]*height:\s*var\(--section-toolbar-aux-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(
      /\.pane-tab-bar\s*\{[^}]*--pane-tab-bar-bg:\s*var\(--seg-pane-tab-bar-surface\);[^}]*--pane-tab-active-bg:\s*var\(--seg-shell\);[^}]*background:\s*var\(--pane-tab-bar-bg\);[^}]*-webkit-app-region:\s*no-drag;/s,
    )
    expect(styles).toMatch(/--pane-tab-inactive-bg:\s*var\(--seg-pane-tab-bar-surface\);/s)
    expect(styles).toMatch(/--pane-tab-hover-bg:\s*var\(--brand-primary-hover\);/s)
    expect(styles).toMatch(
      /\.pane-tab-bar::after\s*\{[^}]*bottom:\s*0;[^}]*height:\s*1px;[^}]*background:\s*var\(--pane-tab-border\);/s,
    )
    expect(styles).toMatch(/\.sidebar-resizer\s*\{[^}]*--sidebar-resizer-top-surface:\s*var\(--seg-pane-tab-bar-surface\);[^}]*background-color:\s*transparent;[^}]*background-image:\s*linear-gradient\(var\(--sidebar-resizer-top-surface\),\s*var\(--sidebar-resizer-top-surface\)\);[^}]*background-position:\s*top;[^}]*background-size:\s*100%\s*var\(--section-toolbar-height\);[^}]*background-repeat:\s*no-repeat;/s)
    expect(styles).toMatch(/\.sidebar-resizer::after\s*\{[^}]*top:\s*calc\(var\(--section-toolbar-height\)\s*-\s*1px\);[^}]*height:\s*1px;[^}]*background:\s*var\(--seg-border\);/s)
    expect(styles).toMatch(/\.pane-tab-bar-leading,\s*\.pane-tab-bar-trailing\s*\{[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.pane-tab-bar-tabs\s*\{[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.pane-tab-bar\.window-drag-region\s+\.pane-tab-bar-tabs\s*\{[^}]*-webkit-app-region:\s*drag;/s)
    expect(styles).toMatch(/\.pane-tab-bar-actions\s*\{[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.sidebar-toggle-button\.is-top-menu,[\s\S]*?\.pane-tab-bar\s+\.canvas-region-top-menu-add-button\s*\{[^}]*-webkit-app-region:\s*no-drag;/s)
    expect(styles).toMatch(/\.right-sidebar-view-host\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*padding-right:\s*2px;/s)
    expect(styles).toMatch(/\.pane-tab-merge-preview\s*\{[^}]*background:\s*var\(--pane-tab-merge-bg\);/s)
    expect(styles).toMatch(/\.pane-drop-targets\s*\{[^}]*grid-template-columns:\s*144px minmax\(0,\s*1fr\) 144px;[^}]*grid-template-rows:\s*10px minmax\(0,\s*1fr\) 108px;[^}]*grid-template-areas:\s*[\s\S]*"\.\s+top\s+\."[\s\S]*"left center right"[\s\S]*"\.\s+bottom\s+\.";/s)
    expect(styles).toMatch(/\.pane-drop-targets\.is-top-row\s*\{[^}]*grid-template-areas:\s*[\s\S]*"top top top"[\s\S]*"left center right"[\s\S]*"\.\s+bottom\s+\.";/s)
    expect(styles).toMatch(/\.pane-drop-target\s*\{[^}]*pointer-events:\s*auto;[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(/\.pane-drop-preview\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*z-index:\s*6;[^}]*pointer-events:\s*none;/s)
    expect(styles).toMatch(/\.pane-drop-preview\.is-left\s*\{[^}]*--pane-drop-preview-sheen-x:\s*18%;[^}]*--pane-drop-preview-sheen-y:\s*50%;/s)
    expect(styles).toMatch(/\.pane-drop-preview\.is-top\s*\{[^}]*--pane-drop-preview-sheen-x:\s*50%;[^}]*--pane-drop-preview-sheen-y:\s*18%;/s)
    expect(styles).toMatch(/\.pane-drop-preview-current,\s*\.pane-drop-preview-incoming\s*\{[^}]*position:\s*absolute;[^}]*transition:[^}]*top var\(--pane-drop-preview-motion-duration\) var\(--pane-drop-preview-motion-curve\)[^}]*left var\(--pane-drop-preview-motion-duration\) var\(--pane-drop-preview-motion-curve\)[^}]*width var\(--pane-drop-preview-motion-duration\) var\(--pane-drop-preview-motion-curve\)[^}]*height var\(--pane-drop-preview-motion-duration\) var\(--pane-drop-preview-motion-curve\)/s)
    expect(styles).toMatch(/\.pane-drop-preview-incoming\s*\{[^}]*background:\s*var\(--mix-brand-accent-active-12-seg-panel-88\);/s)
    expect(styles).toMatch(/\.pane-drop-preview-current\s*\{[^}]*background:\s*var\(--mix-seg-panel-88-white-12\);/s)
    expect(styles).toMatch(/\.canvas-top-menu-git-trigger svg\s*\{[^}]*width:\s*var\(--section-toolbar-aux-icon-size\);[^}]*height:\s*var\(--section-toolbar-aux-icon-size\);[^}]*stroke-width:\s*2;/s)
    expect(styles).toMatch(
      /\.top-menu-view-button:hover,\s*\.top-menu-view-button:focus-visible,[\s\S]*?\{[^}]*background:\s*var\(--mix-ui-accent-strong-14-transparent-86\);[^}]*color:\s*var\(--ui-accent-strong\);/s,
    )
    expect(styles).toMatch(
      /\.top-menu-view-button\.is-active,[\s\S]*?\.top-menu-view-button\.is-active:hover,\s*\.top-menu-view-button\.is-active:focus-visible\s*\{[^}]*background:\s*var\(--mix-brand-accent-active-12-transparent-88\);[^}]*color:\s*var\(--brand-accent-active\);/s,
    )
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(
      /\.sidebar-toggle-button\.is-rail:hover,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.sidebar-toggle-button\.is-rail\.is-active,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-active\);[^}]*transform:\s*none;/s,
    )
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\.is-collapsed\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\.is-collapsed:hover,[\s\S]*?\.sidebar-toggle-button\.is-rail\.is-collapsed:focus-visible\s*\{[^}]*background:\s*var\(--mix-seg-accent-soft-72-seg-panel-28\);[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.sidebar-toggle-button\.is-rail\.is-expanded,[\s\S]*?\.sidebar-toggle-button\.is-rail\.is-expanded:focus-visible\s*\{[^}]*background:\s*var\(--mix-seg-accent-soft-68-seg-panel-32\);[^}]*color:\s*var\(--semantic-accent-icon-active\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.session-tab\s*\{[^}]*cursor:\s*default;/s)
    expect(styles).toMatch(/\.session-tab-trigger\s*\{[^}]*cursor:\s*default;/s)
    expect(styles).toMatch(/\.session-tab-close\s*\{[^}]*cursor:\s*default;/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab\s*\{[^}]*cursor:\s*default;/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab-trigger\s*\{[^}]*cursor:\s*default;/s)
    expect(styles).toMatch(/\.session-tab-trigger,\s*\.session-tab-close,[\s\S]*?\.canvas-region-top-menu-add-button\s*\{[^}]*border-radius:\s*8px;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab-close:hover,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.sidebar-toggle-button\.is-top-menu:hover,\s*\.pane-tab-bar\s+\.sidebar-toggle-button\.is-top-menu:focus-visible,\s*\.pane-tab-bar\s+\.canvas-region-top-menu-add-button:hover,\s*\.pane-tab-bar\s+\.canvas-region-top-menu-add-button:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--pane-tab-icon-hover-color\);/s,
    )
    expect(styles).toMatch(/\.right-sidebar-top-menu-tabs\s*\{[^}]*align-items:\s*center;[^}]*gap:\s*4px;/s)
    expect(styles).toMatch(
      /\.left-sidebar-top-menu\s+\.top-menu-view-button,\s*\.right-sidebar-top-menu\s+\.top-menu-view-button\s*\{[^}]*align-self:\s*center;[^}]*border:\s*1px solid transparent;[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon\);/s,
    )
    expect(styles).toMatch(
      /\.right-sidebar-top-menu\s+\.top-menu-view-button\s*\{[^}]*width:\s*var\(--section-toolbar-control-size\);[^}]*min-width:\s*var\(--section-toolbar-control-size\);[^}]*min-height:\s*var\(--section-toolbar-control-size\);[^}]*border-radius:\s*8px;/s,
    )
    expect(styles).toMatch(
      /\.left-sidebar-top-menu\s+\.top-menu-view-button:hover,\s*\.left-sidebar-top-menu\s+\.top-menu-view-button:focus-visible,\s*\.right-sidebar-top-menu\s+\.top-menu-view-button:hover,\s*\.right-sidebar-top-menu\s+\.top-menu-view-button:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);/s,
    )
    expect(styles).toMatch(
      /\.left-sidebar-top-menu\s+\.top-menu-view-button\.is-active,[\s\S]*?\.right-sidebar-top-menu\s+\.top-menu-view-button\.is-active:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-active\);/s,
    )
    expect(styles).toMatch(
      /\.left-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu,\s*\.right-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;[^}]*color:\s*var\(--semantic-accent-icon\);/s,
    )
    expect(styles).toMatch(
      /\.left-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu:hover,[\s\S]*?\.right-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);/s,
    )
    expect(styles).not.toMatch(
      /\.left-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu\.is-active,\s*\.right-sidebar-top-menu\s+\.sidebar-toggle-button\.is-top-menu\.is-active\s*\{[^}]*color:\s*var\(--semantic-accent-icon-active\);/s,
    )
    expect(styles).toMatch(/--canvas-region-tab-inactive-bg:\s*var\(--mix-seg-shell-84-seg-panel-muted-16\);/s)
    expect(styles).toMatch(/--canvas-region-tab-hover:\s*var\(--mix-seg-panel-66-seg-panel-muted-34\);/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab\s*\{[^}]*background:\s*var\(--pane-tab-inactive-bg\);[^}]*color:\s*var\(--seg-text-2\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab\.is-active\s*\{[^}]*min-height:\s*34px;[^}]*margin-top:\s*6px;[^}]*background:\s*linear-gradient\(var\(--pane-tab-border\),\s*var\(--pane-tab-border\)\)\s*left top \/ 1px calc\(100% - var\(--pane-tab-curve\)\)\s*no-repeat,\s*linear-gradient\(var\(--pane-tab-border\),\s*var\(--pane-tab-border\)\)\s*right top \/ 1px calc\(100% - var\(--pane-tab-curve\)\)\s*no-repeat,\s*var\(--pane-tab-active-bg\);[^}]*border:\s*0;[^}]*transform:\s*none;/s,
    )
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab\.is-active\s*\{[^}]*box-shadow:\s*var\(--pane-tab-active-shadow\);/s)
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab\.is-active::before\s*\{[^}]*left:\s*calc\(var\(--pane-tab-curve\) - 1px\);[^}]*right:\s*calc\(var\(--pane-tab-curve\) - 1px\);[^}]*bottom:\s*-1px;[^}]*height:\s*2px;[^}]*background:\s*var\(--pane-tab-active-bg\);/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve\s*\{[^}]*bottom:\s*-1px;[^}]*width:\s*calc\(var\(--pane-tab-curve\) \+ 1px\);[^}]*height:\s*calc\(var\(--pane-tab-curve\) \+ 1px\);[^}]*pointer-events:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-svg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*overflow:\s*visible;/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-start\s*\{[^}]*left:\s*calc\(var\(--pane-tab-curve\) \* -1\);/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-end\s*\{[^}]*right:\s*calc\(var\(--pane-tab-curve\) \* -1\);/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-end\s+\.session-tab-active-curve-svg\s*\{[^}]*transform:\s*scaleX\(-1\);[^}]*transform-origin:\s*center;/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-fill\s*\{[^}]*fill:\s*var\(--pane-tab-active-bg\);/s,
    )
    expect(styles).toMatch(
      /\.pane-tab-bar\s+\.session-tab-active-curve-stroke\s*\{[^}]*fill:\s*none;[^}]*stroke:\s*var\(--pane-tab-border\);[^}]*stroke-width:\s*1\.25;[^}]*stroke-linecap:\s*round;[^}]*shape-rendering:\s*geometricPrecision;[^}]*vector-effect:\s*non-scaling-stroke;/s,
    )
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab:hover\s*\{[^}]*background:\s*var\(--canvas-region-tab-hover\);[^}]*border-color:\s*transparent;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\.is-active:hover,\s*\.canvas-region-top-menu\s+\.session-tab\.is-active:focus-within\s*\{[^}]*background:\s*var\(--canvas-region-tab-active-bg\);/s,
    )
    expect(styles).toMatch(/\.canvas-region-top-menu\s*\{[^}]*padding-bottom:\s*0;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s*\{[^}]*padding-right:\s*var\(--window-controls-canvas-clearance\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-trailing\.is-right-sidebar-expanded\s*\{[^}]*margin-right:\s*calc\(-1 \* var\(--canvas-inline-padding\)\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-trailing\.is-right-sidebar-collapsed\s*\{[^}]*margin-right:\s*8px;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-tabs-shell\s*\{[^}]*display:\s*flex;[^}]*gap:\s*6px;[^}]*max-width:\s*none;[^}]*justify-self:\s*stretch;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-tabs\s*\{[^}]*flex:\s*0 1 auto;[^}]*align-items:\s*center;[^}]*overflow-x:\s*auto;[^}]*padding-top:\s*0;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-add-button\s*\{[^}]*width:\s*28px;[^}]*min-width:\s*28px;[^}]*min-height:\s*28px;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu-add-glyph\s*\{[^}]*font-size:\s*22px;[^}]*line-height:\s*1;/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.session-tab\s*\{[^}]*min-height:\s*var\(--canvas-region-tab-height\);[^}]*margin-top:\s*6px;[^}]*padding:\s*0 8px 0 10px;/s)
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\.is-active\s*\{[^}]*min-height:\s*calc\(var\(--canvas-region-tab-height\) \+ 4px\);[^}]*background:\s*var\(--canvas-region-tab-active-bg\);[^}]*border:\s*1px solid var\(--canvas-region-tab-border\);[^}]*border-bottom-color:\s*var\(--canvas-region-tab-active-bg\);[^}]*z-index:\s*2;[^}]*box-shadow:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.canvas-region-top-menu\s+\.session-tab\.is-active::before\s*\{[^}]*bottom:\s*-1px;[^}]*height:\s*2px;[^}]*background:\s*var\(--canvas-region-tab-active-bg\);/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu\s*\{[^}]*min-height:\s*var\(--section-toolbar-height\);[^}]*padding-right:\s*calc\(var\(--window-controls-canvas-clearance\) \+ 8px\);[^}]*padding-top:\s*0;[^}]*padding-bottom:\s*0;[^}]*background:\s*transparent;[^}]*border-bottom:\s*0;/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu-copy-main\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*10px;/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu-copy\s+\.label\s*\{[^}]*font-size:\s*12px;[^}]*font-weight:\s*600;[^}]*line-height:\s*1\.2;[^}]*text-transform:\s*none;[^}]*color:\s*var\(--text-primary\);/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu\s+\.canvas-top-menu-button\s*\{[^}]*min-height:\s*var\(--section-toolbar-pill-height\);[^}]*border-radius:\s*8px;[^}]*font-size:\s*12px;[^}]*line-height:\s*1\.2;/s,
    )
    expect(styles).toMatch(
      /\.session-canvas-top-menu-copy\s+\.session-workflow-badge,\s*\.session-canvas-top-menu-copy\s+\.side-chat-badge\s*\{[^}]*min-height:\s*20px;[^}]*padding:\s*0 8px;[^}]*font-size:\s*11px;/s,
    )
    expect(styles).toMatch(
      /\.canvas-top-menu-mcp-trigger,\s*\.canvas-top-menu-skill-trigger\s*\{[^}]*gap:\s*4px;[^}]*max-width:\s*min\(128px,\s*22vw\);/s,
    )
    expect(styles).toMatch(
      /\.canvas-top-menu-selector-panel\s*\{[^}]*top:\s*calc\(100%\s*\+\s*8px\);[^}]*right:\s*0;[^}]*min-width:\s*260px;[^}]*max-height:\s*min\(320px,\s*calc\(100dvh - 180px\)\);/s,
    )
  })

  it("styles shell chrome and composer controls with dedicated semantic surfaces", () => {
    expect(styles).toMatch(/--semantic-accent-icon-light:\s*#78716c;/i)
    expect(styles).toMatch(/--semantic-accent-icon-dark:\s*#d6d3d1;/i)
    expect(styles).toMatch(/--semantic-accent-icon-hover-light:\s*#b9534c;/i)
    expect(styles).toMatch(/--semantic-accent-icon-hover-dark:\s*#fca5a5;/i)
    expect(styles).toMatch(/--semantic-accent-icon-active-light:\s*#fca5a5;/i)
    expect(styles).toMatch(/--semantic-accent-icon-active-dark:\s*#fca5a5;/i)
    expect(styles).toMatch(/--semantic-accent-icon:\s*var\(--semantic-accent-icon-light\);/s)
    expect(styles).toMatch(/--semantic-accent-icon-hover:\s*var\(--semantic-accent-icon-hover-light\);/s)
    expect(styles).toMatch(/--semantic-accent-icon-active:\s*var\(--semantic-accent-icon-active-light\);/s)
    expect(styles).toMatch(/--semantic-accent-icon:\s*var\(--semantic-accent-icon-dark\);/s)
    expect(styles).toMatch(/--semantic-accent-icon-hover:\s*var\(--semantic-accent-icon-hover-dark\);/s)
    expect(styles).toMatch(/--semantic-accent-icon-active:\s*var\(--semantic-accent-icon-active-dark\);/s)
    expect(styles).toMatch(/--semantic-pane-tab-bar-surface-light:\s*#f5f2ee;/i)
    expect(styles).toMatch(/--semantic-pane-tab-bar-surface-dark:\s*#221d1a;/i)
    expect(styles).toMatch(/--semantic-left-sidebar-top-menu-surface-light:\s*#f3ece7;/i)
    expect(styles).toMatch(/--semantic-left-sidebar-top-menu-surface-dark:\s*#241f1c;/i)
    expect(styles).toMatch(/--semantic-right-sidebar-top-menu-surface-light:\s*#f5f2ee;/i)
    expect(styles).toMatch(/--semantic-right-sidebar-top-menu-surface-dark:\s*#221d1a;/i)
    expect(styles).toMatch(/--semantic-pane-tab-bar-surface:\s*var\(--semantic-pane-tab-bar-surface-light\);/s)
    expect(styles).toMatch(/--semantic-left-sidebar-top-menu-surface:\s*var\(--semantic-left-sidebar-top-menu-surface-light\);/s)
    expect(styles).toMatch(/--semantic-right-sidebar-top-menu-surface:\s*var\(--semantic-right-sidebar-top-menu-surface-light\);/s)
    expect(styles).toMatch(/--semantic-pane-tab-bar-surface:\s*var\(--semantic-pane-tab-bar-surface-dark\);/s)
    expect(styles).toMatch(/--semantic-left-sidebar-top-menu-surface:\s*var\(--semantic-left-sidebar-top-menu-surface-dark\);/s)
    expect(styles).toMatch(/--semantic-right-sidebar-top-menu-surface:\s*var\(--semantic-right-sidebar-top-menu-surface-dark\);/s)
    expect(styles).toMatch(/--seg-pane-tab-bar-surface:\s*var\(--semantic-pane-tab-bar-surface\);/s)
    expect(styles).toMatch(/--seg-left-sidebar-top-menu-surface:\s*var\(--semantic-left-sidebar-top-menu-surface\);/s)
    expect(styles).toMatch(/--seg-right-sidebar-top-menu-surface:\s*var\(--semantic-right-sidebar-top-menu-surface\);/s)
    expect(styles).toMatch(/--seg-accent-icon:\s*var\(--semantic-accent-icon\);/s)
    expect(styles).toMatch(/--seg-accent-icon-hover:\s*var\(--semantic-accent-icon-hover\);/s)
    expect(styles).toMatch(/--seg-accent-icon-active:\s*var\(--semantic-accent-icon-active\);/s)
    expect(styles).toMatch(/\.pane-tab-bar\s*\{[^}]*--pane-tab-icon-color:\s*var\(--semantic-accent-icon\);[^}]*--pane-tab-icon-hover-color:\s*var\(--semantic-accent-icon-hover\);[^}]*--pane-tab-icon-active-color:\s*var\(--semantic-accent-icon-active\);/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.sidebar-toggle-button\.is-top-menu,\s*\.pane-tab-bar\s+\.canvas-region-top-menu-add-button\s*\{[^}]*color:\s*var\(--pane-tab-icon-color\);/s)
    expect(styles).not.toMatch(/\.pane-tab-bar\s+\.sidebar-toggle-button\.is-top-menu\.is-active[\s\S]*?color:\s*var\(--pane-tab-icon-active-color\);/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab-close\s*\{[^}]*color:\s*var\(--pane-tab-icon-color\);/s)
    expect(styles).toMatch(/\.pane-tab-bar\s+\.session-tab-close:hover,\s*\.pane-tab-bar\s+\.session-tab-close:focus-visible\s*\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--pane-tab-icon-hover-color\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.sidebar-toggle-button\.is-top-menu,[\s\S]*?\.canvas-region-top-menu-add-button,[\s\S]*?\{[^}]*color:\s*var\(--semantic-accent-icon\);/s)
    expect(styles).toMatch(/\.canvas-region-top-menu\s+\.sidebar-toggle-button\.is-top-menu:hover,[\s\S]*?\.canvas-region-top-menu-add-button:focus-visible,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*border-color:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.terminal-panel-toggle-button\.is-active,[\s\S]*?\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-active\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.settings-page-close-button:hover,\s*\.settings-page-close-button:focus-visible\s*\{[^}]*color:\s*var\(--semantic-accent-icon-hover\);/s)
    expect(styles).toMatch(/\.session-canvas-top-menu\s+\.canvas-top-menu-editor-launch-button,\s*\.session-canvas-top-menu\s+\.canvas-top-menu-editor-menu-button,[\s\S]*?\{[^}]*color:\s*var\(--semantic-accent-icon\);/s)
    expect(styles).toMatch(/\.session-canvas-top-menu\s+\.canvas-top-menu-editor-menu-button\.is-active,[\s\S]*?\.session-canvas-top-menu\s+\.canvas-top-menu-editor-menu-button\.is-active:focus-visible\s*\{[^}]*color:\s*var\(--semantic-accent-icon-active\);[^}]*transform:\s*none;/s)
    expect(styles).toMatch(/\.pane-tab-bar\s*\{[^}]*--pane-tab-bar-bg:\s*var\(--seg-pane-tab-bar-surface\);[^}]*background:\s*var\(--pane-tab-bar-bg\);/s)
    expect(styles).toMatch(/\.left-sidebar-top-menu\s*\{[^}]*background:\s*var\(--seg-left-sidebar-top-menu-surface\);/s)
    expect(styles).toMatch(/\.activity-rail\s*\{[^}]*padding:\s*0 0 14px;/s)
    expect(styles).toMatch(/\.activity-rail-top-menu\s*\{[^}]*min-height:\s*var\(--section-toolbar-height\);[^}]*background:\s*var\(--seg-left-sidebar-top-menu-surface\);/s)
    expect(styles).toMatch(/\.activity-rail-top-menu::after\s*\{[^}]*bottom:\s*0;[^}]*height:\s*1px;[^}]*background:\s*var\(--mix-seg-border-76-transparent-24\);/s)
    expect(styles).toMatch(/\.right-sidebar-top-menu\s*\{[^}]*background:\s*var\(--seg-right-sidebar-top-menu-surface\);/s)
    expect(styles).toMatch(/--semantic-composer-surface-light:\s*#ffffff;/i)
    expect(styles).toMatch(/--semantic-composer-surface:\s*var\(--semantic-composer-surface-light\);/s)
    expect(styles).toMatch(/--semantic-composer-surface:\s*var\(--semantic-composer-surface-dark\);/s)
    expect(styles).not.toMatch(/--semantic-composer-surface:\s*var\(--surface-panel\);/s)
    expect(styles).toMatch(/--semantic-dropdown-menu-surface-light:\s*#ffffff;/i)
    expect(styles).toMatch(
      /--semantic-dropdown-menu-surface:\s*var\(--semantic-dropdown-menu-surface-light\);/s,
    )
    expect(styles).toMatch(
      /--semantic-dropdown-menu-surface:\s*var\(--semantic-dropdown-menu-surface-dark\);/s,
    )
    expect(styles).not.toMatch(/--semantic-dropdown-menu-surface:\s*var\(--surface-panel\);/s)
    expect(styles).toMatch(
      /--semantic-composer-button-surface:\s*var\(--semantic-composer-button-surface-light\);/s,
    )
    expect(styles).toMatch(/--seg-composer-button-surface:\s*var\(--semantic-composer-button-surface\);/s)
    expect(styles).toMatch(/--seg-composer-surface:\s*var\(--semantic-composer-surface\);/s)
    expect(styles).toMatch(/--seg-dropdown-menu-surface:\s*var\(--semantic-dropdown-menu-surface\);/s)
    expect(styles).toMatch(
      /\.composer\s*\{[^}]*background:\s*var\(--seg-composer-surface\);/s,
    )
    expect(styles).toMatch(
      /\.composer-selector-button\s*\{[^}]*min-height:\s*34px;/s,
    )
    expect(styles).toMatch(
      /\.composer\s+\.composer-selector-button,\s*\.composer\s+\.composer-actions\s+\.primary-button,\s*\.composer\s+\.composer-menu-option\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s,
    )
    expect(styles).toMatch(
      /\.composer\s+\.composer-selector-button:not\(:disabled\):hover,\s*\.composer\s+\.composer-selector-button:not\(:disabled\):focus-visible,\s*\.composer\s+\.composer-actions\s+\.primary-button:not\(:disabled\):hover,\s*\.composer\s+\.composer-actions\s+\.primary-button:not\(:disabled\):focus-visible,\s*\.composer\s+\.composer-menu-option:not\(:disabled\):hover,\s*\.composer\s+\.composer-menu-option:not\(:disabled\):focus-visible\s*\{[^}]*background:\s*var\(--seg-composer-button-surface\);[^}]*color:\s*var\(--seg-composer-button-text\);/s,
    )
    expect(styles).toMatch(
      /\.composer\s+\.composer-menu-option\.is-selected\s*\{[^}]*background:\s*var\(--seg-composer-button-surface-strong\);[^}]*color:\s*var\(--seg-composer-button-text-strong\);/s,
    )
    expect(styles).toMatch(
      /\.composer-menu-panel\s*\{[^}]*bottom:\s*calc\(100%\s*\+\s*8px\);[^}]*max-height:\s*min\(320px,\s*calc\(100dvh - 180px\)\);[^}]*overflow:\s*auto;[^}]*background:\s*var\(--seg-dropdown-menu-surface\);/s,
    )
    expect(styles).toMatch(
      /\.canvas-top-menu-selector-panel\s*\{[^}]*top:\s*calc\(100%\s*\+\s*8px\);[^}]*background:\s*var\(--seg-dropdown-menu-surface\);/s,
    )
    expect(styles).toMatch(
      /select option,\s*select optgroup\s*\{[^}]*background:\s*var\(--seg-dropdown-menu-surface\);/s,
    )
    expect(styles).toMatch(
      /\.composer-selector-button\.is-icon-only,\s*\.composer-actions\s+\.primary-button\.is-icon-only\s*\{[^}]*width:\s*var\(--icon-button-size\);[^}]*min-width:\s*var\(--icon-button-size\);/s,
    )
    expect(styles).toMatch(/\.composer\s+\.composer-selector-button\.is-icon-only,\s*\.composer\s+\.composer-actions\s+\.primary-button\.is-icon-only\s*\{[^}]*color:\s*var\(--semantic-accent-icon\);/s)
    expect(styles).toMatch(/\.composer\s+\.composer-selector-button\.is-icon-only:not\(:disabled\):hover,[\s\S]*?\.composer\s+\.composer-actions\s+\.primary-button\.is-icon-only:not\(:disabled\):focus-visible\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--semantic-accent-icon-hover\);[^}]*transform:\s*none;/s)
  })

  it("aligns inline composer tags to the text bottom edge", () => {
    expect(styles).toMatch(
      /\.composer-inline-tag\s*\{[^}]*display:\s*inline-flex;[^}]*box-sizing:\s*border-box;[^}]*line-height:\s*1;[^}]*vertical-align:\s*text-bottom;/s,
    )
    expect(styles).toMatch(
      /\.thread-inline-reference\s*\{[^}]*white-space:\s*nowrap;[^}]*vertical-align:\s*text-bottom;/s,
    )
  })

  it("wraps response markdown code blocks without horizontal scrolling", () => {
    expect(styles).toMatch(/\.thread-markdown pre\s*\{[^}]*overflow:\s*hidden;[^}]*white-space:\s*pre-wrap;/s)
    expect(styles).toMatch(
      /\.thread-markdown pre code\s*\{[^}]*max-width:\s*100%;[^}]*white-space:\s*pre-wrap;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s,
    )
  })

  it("gives composer and user body text a slightly larger size than tag text", () => {
    expect(styles).toMatch(
      /\.composer-editor-input\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.65;/s,
    )
    expect(styles).toMatch(
      /\.composer-editor-placeholder\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.65;/s,
    )
    expect(styles).toMatch(
      /\.user-bubble\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*1\.6;/s,
    )
  })

  it("styles assistant turns as three stacked panels with call separators", () => {
    expect(styles).toMatch(/\.permission-request-card\s*\{[^}]*border-left-color:\s*var\(--seg-warning-strong\);[^}]*background:\s*var\(--mix-seg-warning-surface-84-surface-trace-16\);/s)
    expect(styles).toMatch(/\.ask-user-question-card\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--semantic-question-card-surface\);/s)
    expect(styles).toMatch(/\.assistant-section\.is-response\s+\.ask-user-question-card\s*\{[^}]*border:\s*0;[^}]*background:\s*var\(--semantic-question-card-surface\);/s)
    expect(styles).toMatch(/\.assistant-shell\.is-sectioned\s*\{[^}]*border:\s*0;[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
    expect(styles).toMatch(
      /\.assistant-section\.is-reasoning,\s*\.assistant-section\.is-response,\s*\.assistant-section\.is-tools\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*padding:\s*0;/s,
    )
    expect(styles).toMatch(/\.assistant-reasoning-separator::before,\s*\.assistant-reasoning-separator::after\s*\{[^}]*height:\s*1px;/s)
    expect(styles).toMatch(/\.assistant-section\.is-response\s+\.trace-item-header\s*\{[^}]*display:\s*none;/s)
    expect(styles).toMatch(/\.assistant-response-side-chat\s*\{[^}]*gap:\s*8px;[^}]*margin-top:\s*0;/s)
    expect(styles).toMatch(
      /@media \(hover:\s*hover\) and \(pointer:\s*fine\)\s*\{[\s\S]*\.assistant-response-side-chat:not\(\.is-persistent\) \.assistant-response-actions\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;[\s\S]*\.assistant-section\.is-response:hover \.assistant-response-side-chat \.assistant-response-actions,[\s\S]*\.assistant-response-side-chat\.is-persistent \.assistant-response-actions\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s,
    )
    expect(styles).toMatch(/\.trace-item-toggle\s*\{[^}]*background:\s*transparent;[^}]*text-align:\s*left;[^}]*cursor:\s*pointer;/s)
  })

  it("keeps settings surfaces constrained as centered dialogs", () => {
    expect(styles).toMatch(/\.settings-page-overlay\s*\{[^}]*display:\s*grid;[^}]*place-items:\s*center;[^}]*overflow:\s*auto;/s)
    expect(styles).toMatch(/\.settings-page-overlay\s*\{[^}]*z-index:\s*40;/s)
    expect(styles).toMatch(
      /\.app-shell\.is-settings-open\s+\.preview-webview\s*\{[^}]*visibility:\s*hidden;[^}]*pointer-events:\s*none;/s,
    )
    expect(styles).toMatch(
      /\.settings-page\s*\{[^}]*width:\s*min\(100%,\s*1320px\);[^}]*height:\s*min\(calc\(100dvh - 64px\),\s*860px\);[^}]*max-height:\s*min\(calc\(100dvh - 64px\),\s*860px\);/s,
    )
    expect(styles).toMatch(
      /\.settings-page-body,\s*\.settings-page-shell\s*\{[^}]*grid-template-columns:\s*var\(--settings-nav-width\) minmax\(0,\s*1fr\);/s,
    )
    expect(styles).toMatch(/\.settings-services-layout\s*\{[^}]*grid-template-columns:\s*320px minmax\(0,\s*1fr\);/s)
  })

  it("keeps global skill row menus inside the list column", () => {
    expect(styles).toMatch(
      /\.global-skills-install-menu\.skill-tree-row-menu\s*\{[^}]*left:\s*auto;[^}]*right:\s*0;/s,
    )
  })

  it("keeps the global skills search row pinned to the top of the tree", () => {
    expect(styles).toMatch(/\.skills-tree-search-row\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;/s)
  })

  it("scopes provider scrolling to the column layout", () => {
    expect(styles).toMatch(/\.settings-page-main\.is-services\s*\{[^}]*overflow:\s*hidden;/s)
    expect(styles).toMatch(/\.settings-page-content,\s*\.settings-page-main\s*\{[^}]*scrollbar-gutter:\s*stable both-edges;/s)
    expect(styles).toMatch(/\.settings-toast-region\s*\{[^}]*position:\s*absolute;[^}]*top:\s*18px;[^}]*right:\s*56px;/s)
    expect(styles).toMatch(/\.settings-service-list\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
    expect(styles).toMatch(/\.settings-service-detail-panel\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s)
    expect(styles).toMatch(/\.settings-page-main\.prompt-presets-page-main\s*\{[^}]*height:\s*100%;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/s)
    expect(styles).toMatch(/\.settings-page-main\.prompt-presets-page-main\s*>\s*\.settings-prompts-shell\s*\{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;/s)
    expect(styles).toMatch(/\.settings-prompt-assignment-list\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s)
    expect(styles).toMatch(/\.settings-prompt-assignment-control select\s*\{[^}]*width:\s*clamp\(220px,\s*18vw,\s*360px\);/s)
  })

  it("uses Obsidian-style grouped settings rows for standard settings pages", () => {
    expect(styles).toMatch(
      /\.settings-page-main:not\(\.is-services\):not\(\.prompt-presets-page-main\)\s*\{[^}]*justify-items:\s*start;[^}]*gap:\s*28px;/s,
    )
    expect(styles).toMatch(
      /\.settings-page-main:not\(\.is-services\):not\(\.prompt-presets-page-main\)\s+\.settings-field-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*gap:\s*0;/s,
    )
    expect(styles).toMatch(
      /\.settings-page-main:not\(\.is-services\):not\(\.prompt-presets-page-main\)\s+\.settings-field\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(220px,\s*320px\);[^}]*align-items:\s*center;/s,
    )
    expect(styles).toMatch(
      /\.settings-page-main:not\(\.is-services\):not\(\.prompt-presets-page-main\)\s+\.settings-actions-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;[^}]*align-items:\s*center;/s,
    )
    expect(styles).toMatch(
      /\.settings-page-main:not\(\.is-services\):not\(\.prompt-presets-page-main\)\s+\.provider-model-picker-panel\s*\{[^}]*right:\s*0;[^}]*left:\s*auto;[^}]*width:\s*min\(560px,\s*calc\(100vw - var\(--settings-nav-width\) - 112px\)\);/s,
    )
  })

  it("keeps the settings primary nav grouped and pill-led", () => {
    expect(styles).toMatch(/\.settings-page-close-button\s*\{[^}]*width:\s*32px;[^}]*background:\s*transparent;/s)
    expect(styles).toMatch(
      /\.settings-page-nav,\s*\.settings-page-primary-nav\s*\{[^}]*overflow:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*gap:\s*20px;/s,
    )
    expect(styles).toMatch(
      /\.settings-page-nav,\s*\.settings-page-primary-nav\s*\{[^}]*background:\s*var\(--seg-shell\);[^}]*color:\s*var\(--seg-text-1\);/s,
    )
    expect(styles).toMatch(/\.settings-primary-nav-group-label,[\s\S]*?\.settings-helper-text,[\s\S]*?\.settings-page-copy,[\s\S]*?\.settings-section-header p,[\s\S]*?\.provider-row-copy,[\s\S]*?\.provider-model-empty,[\s\S]*?\.settings-toggle-copy small\s*\{[^}]*color:\s*var\(--seg-text-3\);/s)
    expect(styles).toMatch(
      /\.settings-primary-nav-item\s*\{[^}]*border:\s*1px solid transparent;[^}]*border-radius:\s*12px;[^}]*background:\s*transparent;[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\);/s,
    )
    expect(styles).toMatch(
      /\.settings-primary-nav-item:hover,\s*\.settings-primary-nav-item:focus-visible\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--semantic-sidebar-tree-row-surface-active\);[^}]*color:\s*var\(--semantic-sidebar-tree-row-text-active\);/s,
    )
    expect(styles).toMatch(
      /\.settings-primary-nav-item\.is-active\s*\{[^}]*border-color:\s*transparent;[^}]*background:\s*var\(--semantic-sidebar-tree-row-surface-active\);[^}]*color:\s*var\(--semantic-sidebar-tree-row-text-active\);/s,
    )
  })
})
