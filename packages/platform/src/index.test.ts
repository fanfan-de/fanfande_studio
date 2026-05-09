import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  createPlatformAdapter,
  getBundledBunName,
  getPythonExecutable,
  normalizeComparablePath,
} from "./index"

describe("platform adapter", () => {
  it("normalizes comparable paths by platform", () => {
    expect(normalizeComparablePath("C:\\Projects\\App\\", "win32")).toBe("c:/projects/app")
    expect(normalizeComparablePath("/Users/Fan/App/", "darwin")).toBe("/Users/Fan/App")
  })

  it("resolves platform executable names", () => {
    expect(getBundledBunName("win32")).toBe("bun.exe")
    expect(getBundledBunName("darwin")).toBe("bun")
    expect(getPythonExecutable("runtime", "win32")).toBe(path.join("runtime", "python.exe"))
  })

  it("supports semantic openPath injection", async () => {
    const opened: string[] = []
    const adapter = createPlatformAdapter({
      platform: "darwin",
      openPath: async (targetPath) => {
        opened.push(targetPath)
      },
    })

    await adapter.openPath("/tmp/project")
    expect(opened).toEqual(["/tmp/project"])
  })
})
