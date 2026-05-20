import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path, { join } from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { toLocalImageProtocolUrl } from "../shared/local-image-protocol"
import { getLocalImageMimeType, resolveLocalImageProtocolRequest } from "./local-image-protocol"

const tempDirectories: string[] = []

async function createFixtureDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "desktop-local-image-protocol-"))
  tempDirectories.push(directory)
  return directory
}

function requestUrlForSource(source: string) {
  const url = toLocalImageProtocolUrl(source)
  if (!url) throw new Error(`Invalid fixture source: ${source}`)
  return url
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

describe("local image protocol", () => {
  it("resolves a valid raster image absolute path", async () => {
    const directory = await createFixtureDirectory()
    const imagePath = join(directory, "image.png")
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(imagePath))).resolves.toEqual({
      ok: true,
      filePath: path.resolve(imagePath),
      mimeType: "image/png",
      size: 4,
    })
  })

  it("resolves a valid raster image file URL", async () => {
    const directory = await createFixtureDirectory()
    const imagePath = join(directory, "image.jpg")
    await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff]))

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(pathToFileURL(imagePath).toString()))).resolves.toMatchObject({
      ok: true,
      filePath: path.resolve(imagePath),
      mimeType: "image/jpeg",
    })
  })

  it("rejects unsupported image extensions", async () => {
    const directory = await createFixtureDirectory()
    const imagePath = join(directory, "image.svg")
    await writeFile(imagePath, "<svg />")

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(imagePath))).resolves.toMatchObject({
      ok: false,
      status: 415,
    })
  })

  it("rejects non-image files", async () => {
    const directory = await createFixtureDirectory()
    const textPath = join(directory, "notes.txt")
    await writeFile(textPath, "not an image")

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(textPath))).resolves.toMatchObject({
      ok: false,
      status: 415,
    })
  })

  it("rejects directories", async () => {
    const directory = await createFixtureDirectory()
    const nestedDirectory = join(directory, "image.png")
    await mkdir(nestedDirectory)

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(nestedDirectory))).resolves.toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it("rejects relative sources", async () => {
    await expect(
      resolveLocalImageProtocolRequest("anybox-local-image://image?source=relative%2Fimage.png"),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it("rejects oversized images", async () => {
    const directory = await createFixtureDirectory()
    const imagePath = join(directory, "image.webp")
    await writeFile(imagePath, Buffer.from([1, 2, 3]))

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(imagePath), { maxBytes: 2 })).resolves.toMatchObject({
      ok: false,
      status: 413,
    })
  })

  it("rejects missing files", async () => {
    const directory = await createFixtureDirectory()
    const imagePath = join(directory, "missing.png")

    await expect(resolveLocalImageProtocolRequest(requestUrlForSource(imagePath))).resolves.toMatchObject({
      ok: false,
      status: 404,
    })
  })

  it("maps allowed raster extensions to content types", () => {
    expect(getLocalImageMimeType("a.avif")).toBe("image/avif")
    expect(getLocalImageMimeType("a.bmp")).toBe("image/bmp")
    expect(getLocalImageMimeType("a.gif")).toBe("image/gif")
    expect(getLocalImageMimeType("a.ico")).toBe("image/x-icon")
    expect(getLocalImageMimeType("a.jpeg")).toBe("image/jpeg")
    expect(getLocalImageMimeType("a.jpg")).toBe("image/jpeg")
    expect(getLocalImageMimeType("a.png")).toBe("image/png")
    expect(getLocalImageMimeType("a.webp")).toBe("image/webp")
    expect(getLocalImageMimeType("a.svg")).toBeNull()
  })
})
