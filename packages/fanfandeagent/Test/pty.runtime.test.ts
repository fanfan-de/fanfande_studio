import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  ensureMacOSNodePtySpawnHelperExecutable,
  isPtyRuntimeError,
  resolveDefaultPtyShell,
  shouldUseNodePtySidecar,
  toPtyCreateError,
} from "#pty/runtime.ts"

const tempRoots: string[] = []

async function makeTempRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "fanfande-pty-runtime-"))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe("pty runtime", () => {
  test("makes the macOS node-pty spawn helper executable", async () => {
    const packageRoot = await makeTempRoot()
    const helperPath = path.join(packageRoot, "prebuilds", "darwin-arm64", "spawn-helper")
    await mkdir(path.dirname(helperPath), { recursive: true })
    await writeFile(helperPath, "")
    await chmod(helperPath, 0o644)

    await expect(
      ensureMacOSNodePtySpawnHelperExecutable({
        arch: "arm64",
        packageRoot,
        platform: "darwin",
      }),
    ).resolves.toBe(helperPath)

    const helperStat = await stat(helperPath)
    expect(helperStat.mode & 0o111).not.toBe(0)
  })

  test("rejects an explicit terminal shell that does not exist", async () => {
    const packageRoot = await makeTempRoot()
    const missingShell = path.join(packageRoot, "missing-shell")

    try {
      await resolveDefaultPtyShell(missingShell)
      throw new Error("resolveDefaultPtyShell unexpectedly succeeded")
    } catch (error) {
      expect(isPtyRuntimeError(error)).toBe(true)
      if (isPtyRuntimeError(error)) {
        expect(error.code).toBe("PTY_CREATE_FAILED")
        expect(error.message).toContain(missingShell)
      }
    }
  })

  test("maps spawn failures to PTY_CREATE_FAILED", () => {
    const error = toPtyCreateError(new Error("posix_spawnp failed"), "/bin/zsh")

    expect(error.code).toBe("PTY_CREATE_FAILED")
    expect(error.message).toContain("/bin/zsh")
    expect(error.message).toContain("posix_spawnp failed")
  })

  test("uses the Node PTY sidecar whenever the server runs on Bun", () => {
    expect(shouldUseNodePtySidecar({ isBun: true })).toBe(true)
    expect(shouldUseNodePtySidecar({ isBun: false })).toBe(false)
  })
})
