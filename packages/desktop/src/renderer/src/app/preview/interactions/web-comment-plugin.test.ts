import { describe, expect, it } from "vitest"
import type { PreviewInteractionRecord, ResolvedPreviewTarget } from "../../types"
import { webCommentPlugin } from "./web-comment-plugin"

function createTarget(renderer: ResolvedPreviewTarget["renderer"]): ResolvedPreviewTarget {
  return {
    externalOpenTarget: {
      kind: "url",
      value: "http://localhost:5173/",
    },
    input: "http://localhost:5173",
    kind: "url",
    mime: "text/html",
    normalizedInput: "http://localhost:5173/",
    renderer,
    safePreviewUrl: "http://localhost:5173/",
    textReadable: false,
    title: "localhost:5173",
  }
}

function createRecord(payload: PreviewInteractionRecord["payload"]): PreviewInteractionRecord {
  return {
    createdAt: 1,
    id: "interaction-1",
    pluginID: "web.comment",
    renderer: "url-webview",
    targetKey: "http://localhost:5173/",
    payload,
  }
}

describe("web comment preview interaction plugin", () => {
  it("applies only to URL and HTML preview renderers", () => {
    expect(webCommentPlugin.appliesTo(createTarget("url-webview"))).toBe(true)
    expect(webCommentPlugin.appliesTo({ ...createTarget("html-preview"), kind: "file" })).toBe(true)
    expect(webCommentPlugin.appliesTo(createTarget("markdown-preview"))).toBe(false)
    expect(webCommentPlugin.appliesTo(createTarget("image-preview"))).toBe(false)
    expect(webCommentPlugin.appliesTo(createTarget("table-preview"))).toBe(false)
  })

  it("formats DOM anchors into stable prompt context", () => {
    const context = webCommentPlugin.formatContext([
      createRecord({
        kind: "web-comment",
        pageUrl: "http://localhost:5173/",
        x: 42,
        y: 35,
        text: "The CTA overlaps the header.",
        frame: "iframe",
        nodePosition: "42%, 35%; target rect 120, 80, 240x48",
        screenshotPath: "C:\\Users\\codex\\preview-comment-screenshots\\marker.png",
        anchor: {
          type: "element",
          label: "button.cta",
          selector: "button.cta",
          path: "html > body > main > button:nth-of-type(1)",
          tagName: "button",
          text: "Launch",
        },
      }),
    ], "Please fix it.")

    expect(context).toContain("Node position: 42%, 35%; target rect 120, 80, 240x48")
    expect(context).toContain("Target selector: button.cta")
    expect(context).toContain("Target path: html > body > main > button:nth-of-type(1)")
    expect(context).toContain("Comment:\nThe CTA overlaps the header.")
  })

  it("formats coordinate fallback comments", () => {
    const context = webCommentPlugin.formatContext([
      createRecord({
        kind: "web-comment",
        pageUrl: "http://localhost:5173/",
        x: 12,
        y: 34,
        text: "This blank area is too large.",
        anchor: { type: "coordinate" },
      }),
    ], "Please fix it.")

    expect(context).toContain("Node position: 12%, 34%")
    expect(context).toContain("Target selector: Unavailable")
    expect(context).toContain("Comment:\nThis blank area is too large.")
  })
})
