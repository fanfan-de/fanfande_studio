import { spawn as spawnChild } from "node:child_process"

export function terminateProcessTree(input: { pid: number | null; kill: (signal?: NodeJS.Signals | number) => boolean }) {
  if (!input.pid) return

  if (process.platform === "win32") {
    try {
      const killer = spawnChild("taskkill", ["/pid", String(input.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      })
      killer.unref?.()
      return
    } catch {
      // Fall through to a normal kill attempt when taskkill is unavailable.
    }
  }

  try {
    input.kill("SIGTERM")
  } catch {
    // Ignore termination races.
  }
}
