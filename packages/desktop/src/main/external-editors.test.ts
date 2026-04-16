import { describe, expect, it, vi } from "vitest"
import {
  buildExternalEditorLaunchSpec,
  listAvailableExternalEditors,
  openInExternalEditor,
  type ExternalEditorSummary,
} from "./external-editors"

describe("external editor helpers", () => {
  it("prefers command resolution before scanning common install paths", () => {
    const result = listAvailableExternalEditors({
      platform: "win32",
      env: {
        LOCALAPPDATA: "C:\\Users\\demo\\AppData\\Local",
        ProgramFiles: "C:\\Program Files",
        "ProgramFiles(x86)": "C:\\Program Files (x86)",
      },
      existsSync: (targetPath) => targetPath === "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
      resolveCommand: (commandName) => (commandName === "code" ? "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd" : undefined),
    })

    expect(result).toEqual([
      {
        id: "vscode",
        label: "VS Code",
        executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
      },
      {
        id: "cursor",
        label: "Cursor",
        executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
      },
    ])
  })

  it("normalizes extensionless Windows editor shims to launchable command files", () => {
    const result = listAvailableExternalEditors({
      platform: "win32",
      existsSync: (targetPath) => targetPath === "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
      resolveCommand: (commandName) => (commandName === "code" ? "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code" : undefined),
    })

    expect(result).toEqual([
      {
        id: "vscode",
        label: "VS Code",
        executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
      },
    ])
  })

  it("includes File Explorer from the Windows system path", () => {
    const result = listAvailableExternalEditors({
      platform: "win32",
      env: {
        SystemRoot: "C:\\Windows",
      },
      existsSync: (targetPath) => targetPath === "C:\\Windows\\explorer.exe",
      resolveCommand: () => undefined,
    })

    expect(result).toEqual([
      {
        id: "explorer",
        label: "File Explorer",
        executablePath: "C:\\Windows\\explorer.exe",
      },
    ])
  })

  it("wraps cmd launchers in a shell while leaving executables direct", () => {
    const commandLineEditor = {
      id: "vscode",
      label: "VS Code",
      executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
    } satisfies ExternalEditorSummary

    const guiEditor = {
      id: "cursor",
      label: "Cursor",
      executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
    } satisfies ExternalEditorSummary

    expect(buildExternalEditorLaunchSpec(commandLineEditor, "C:\\Projects\\Atlas", { env: { SystemRoot: "C:\\Windows" } })).toEqual({
      command: "C:\\Windows\\System32\\cmd.exe",
      args: ["/d", "/s", "/c", "\"\"C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd\" \"C:\\Projects\\Atlas\""],
      shell: false,
      waitForExit: true,
      windowsVerbatimArguments: true,
    })
    expect(buildExternalEditorLaunchSpec(guiEditor, "C:\\Projects\\Atlas", { env: { SystemRoot: "C:\\Windows" } })).toEqual({
      command: guiEditor.executablePath,
      args: ["C:\\Projects\\Atlas"],
      shell: false,
      waitForExit: false,
      windowsVerbatimArguments: false,
    })
  })

  it("launches the selected editor for an existing workspace directory", async () => {
    const unref = vi.fn()
    const spawnProcess = vi.fn(() => ({
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (event === "spawn") {
          listener()
        }
      }),
      removeListener: vi.fn(),
      unref,
    }))

    const result = await openInExternalEditor(
      {
        editorID: "cursor",
        targetPath: "C:\\Projects\\Atlas",
      },
      {
        platform: "win32",
        resolveCommand: (commandName) => (commandName === "cursor" ? "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe" : undefined),
        spawnProcess: spawnProcess as unknown as typeof import("node:child_process").spawn,
        statSync: ((_targetPath: string) =>
          ({
            isDirectory: () => true,
          }) as import("node:fs").Stats) as typeof import("node:fs").statSync,
      },
    )

    expect(result).toEqual({
      ok: true,
      editor: {
        id: "cursor",
        label: "Cursor",
        executablePath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
      },
      targetPath: "C:\\Projects\\Atlas",
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      "C:\\Users\\demo\\AppData\\Local\\Programs\\Cursor\\Cursor.exe",
      ["C:\\Projects\\Atlas"],
      expect.objectContaining({
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
        windowsVerbatimArguments: false,
      }),
    )
    expect(unref).toHaveBeenCalled()
  })

  it("launches File Explorer directly for an existing workspace directory", async () => {
    const unref = vi.fn()
    const spawnProcess = vi.fn(() => ({
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (event === "spawn") {
          listener()
        }
      }),
      removeListener: vi.fn(),
      unref,
    }))

    const result = await openInExternalEditor(
      {
        editorID: "explorer",
        targetPath: "C:\\Projects\\Atlas",
      },
      {
        platform: "win32",
        env: {
          SystemRoot: "C:\\Windows",
        },
        existsSync: (targetPath) => targetPath === "C:\\Windows\\explorer.exe",
        resolveCommand: () => undefined,
        spawnProcess: spawnProcess as unknown as typeof import("node:child_process").spawn,
        statSync: ((_targetPath: string) =>
          ({
            isDirectory: () => true,
          }) as import("node:fs").Stats) as typeof import("node:fs").statSync,
      },
    )

    expect(result).toEqual({
      ok: true,
      editor: {
        id: "explorer",
        label: "File Explorer",
        executablePath: "C:\\Windows\\explorer.exe",
      },
      targetPath: "C:\\Projects\\Atlas",
    })
    expect(spawnProcess).toHaveBeenCalledWith(
      "C:\\Windows\\explorer.exe",
      ["C:\\Projects\\Atlas"],
      expect.objectContaining({
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
        windowsVerbatimArguments: false,
      }),
    )
    expect(unref).toHaveBeenCalled()
  })

  it("rejects when the spawned editor process fails to launch", async () => {
    const spawnProcess = vi.fn(() => ({
      once: vi.fn((event: string, listener: (error?: Error) => void) => {
        if (event === "error") {
          listener(new Error("spawn C:\\\\Users\\\\demo\\\\AppData\\\\Local\\\\Programs\\\\Microsoft VS Code\\\\bin\\\\code ENOENT"))
        }
      }),
      removeListener: vi.fn(),
      unref: vi.fn(),
    }))

    await expect(
      openInExternalEditor(
        {
          editorID: "vscode",
          targetPath: "C:\\Projects\\Atlas",
        },
        {
          platform: "win32",
          existsSync: (targetPath) => targetPath === "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
          resolveCommand: (commandName) => (commandName === "code" ? "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code" : undefined),
          spawnProcess: spawnProcess as unknown as typeof import("node:child_process").spawn,
          statSync: ((_targetPath: string) =>
            ({
              isDirectory: () => true,
            }) as import("node:fs").Stats) as typeof import("node:fs").statSync,
        },
      ),
    ).rejects.toThrow("Failed to launch VS Code")
  })

  it("waits for cmd launchers to exit cleanly before reporting success", async () => {
    const unref = vi.fn()
    const spawnProcess = vi.fn(() => ({
      once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (event === "spawn") {
          listener()
        }
        if (event === "close") {
          listener(0)
        }
      }),
      removeListener: vi.fn(),
      unref,
    }))

    const result = await openInExternalEditor(
      {
        editorID: "vscode",
        targetPath: "C:\\Projects\\Atlas",
      },
      {
        platform: "win32",
        env: {
          ComSpec: "C:\\Windows\\System32\\cmd.exe",
        },
        existsSync: (targetPath) => targetPath === "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd",
        resolveCommand: (commandName) => (commandName === "code" ? "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code" : undefined),
        spawnProcess: spawnProcess as unknown as typeof import("node:child_process").spawn,
        statSync: ((_targetPath: string) =>
          ({
            isDirectory: () => true,
          }) as import("node:fs").Stats) as typeof import("node:fs").statSync,
      },
    )

    expect(result.ok).toBe(true)
    expect(spawnProcess).toHaveBeenCalledWith(
      "C:\\Windows\\System32\\cmd.exe",
      ["/d", "/s", "/c", "\"\"C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd\" \"C:\\Projects\\Atlas\""],
      expect.objectContaining({
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
        windowsVerbatimArguments: true,
      }),
    )
    expect(unref).toHaveBeenCalled()
  })
})
