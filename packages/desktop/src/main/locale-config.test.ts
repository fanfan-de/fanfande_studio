import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const userDataPathMock = vi.hoisted(() => ({
  value: "",
}))

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => userDataPathMock.value),
  },
}))

import { readLocaleConfigSnapshot, writeLocaleConfigSnapshot } from "./locale-config"

let tempDirectory = ""

beforeEach(async () => {
  tempDirectory = await mkdtemp(path.join(os.tmpdir(), "anybox-locale-"))
  userDataPathMock.value = tempDirectory
})

afterEach(async () => {
  await rm(tempDirectory, { force: true, recursive: true })
})

describe("locale config persistence", () => {
  it("returns the Chinese default when no persisted file exists", async () => {
    await expect(readLocaleConfigSnapshot()).resolves.toMatchObject({
      exists: false,
      document: {
        version: 1,
        locale: "zh-CN",
        updatedAt: 0,
      },
    })
  })

  it("writes and reads normalized locale settings", async () => {
    const saved = await writeLocaleConfigSnapshot({
      version: 1,
      locale: "en-US",
      updatedAt: 0,
    })

    expect(saved.exists).toBe(true)
    expect(saved.document.locale).toBe("en-US")

    await expect(readLocaleConfigSnapshot()).resolves.toMatchObject({
      exists: true,
      document: {
        version: 1,
        locale: "en-US",
      },
    })
  })
})
