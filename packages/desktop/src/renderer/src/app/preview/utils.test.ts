import { describe, expect, it } from "vitest"
import { normalizePreviewUrlInput } from "./utils"

describe("preview utils", () => {
  it("normalizes localhost URLs to http", () => {
    expect(normalizePreviewUrlInput("localhost:3000")).toEqual({
      errorKind: null,
      errorMessage: null,
      normalizedUrl: "http://localhost:3000/",
    })
  })

  it("normalizes non-local URLs to https", () => {
    expect(normalizePreviewUrlInput("example.com")).toEqual({
      errorKind: null,
      errorMessage: null,
      normalizedUrl: "https://example.com/",
    })
  })

  it("returns an empty-url error for blank input", () => {
    expect(normalizePreviewUrlInput(" ")).toMatchObject({
      errorKind: "empty-url",
      normalizedUrl: null,
    })
  })

  it("returns an unsupported-protocol error for non-http URLs", () => {
    expect(normalizePreviewUrlInput("file:///tmp/index.html")).toMatchObject({
      errorKind: "unsupported-protocol",
      normalizedUrl: null,
    })
  })

  it("returns an invalid-url error when parsing fails", () => {
    expect(normalizePreviewUrlInput("http://[")).toMatchObject({
      errorKind: "invalid-url",
      normalizedUrl: null,
    })
  })
})
