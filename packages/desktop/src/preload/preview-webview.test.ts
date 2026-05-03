import { beforeEach, describe, expect, it, vi } from "vitest"

const electronMock = vi.hoisted(() => ({
  modeListener: null as null | ((_event: unknown, payload?: { mode?: "browse" | "comment" }) => void),
  on: vi.fn((channel: string, listener: (_event: unknown, payload?: { mode?: "browse" | "comment" }) => void) => {
    if (channel === "preview:set-mode") {
      electronMock.modeListener = listener
    }
  }),
  sendToHost: vi.fn(),
}))

vi.mock("electron", () => ({
  ipcRenderer: {
    on: electronMock.on,
    sendToHost: electronMock.sendToHost,
  },
}))

await import("./preview-webview")

class MockResizeObserver {
  disconnect() {}
  observe() {}
}

function initializePreviewGuest() {
  vi.stubGlobal("ResizeObserver", MockResizeObserver)
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 500,
  })
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 400,
  })
  window.dispatchEvent(new Event("DOMContentLoaded"))
  electronMock.modeListener?.({}, { mode: "comment" })
  electronMock.sendToHost.mockClear()
}

describe("preview webview preload", () => {
  beforeEach(() => {
    document.head.innerHTML = ""
    document.body.innerHTML = ""
    initializePreviewGuest()
  })

  it("falls back to a coordinate comment target when no element can be resolved", () => {
    const click = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 125,
      clientY: 100,
    })

    document.dispatchEvent(click)

    expect(electronMock.sendToHost).toHaveBeenCalledWith("preview:comment-target", {
      anchor: {
        type: "coordinate",
      },
      x: 25,
      y: 25,
    })
  })

  it("resolves text-node click targets to their parent element", () => {
    document.body.innerHTML = `<main><p><span>Hero copy</span></p></main>`
    const textNode = document.querySelector("span")?.firstChild
    expect(textNode).toBeInstanceOf(Text)

    textNode?.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 80,
    }))

    expect(electronMock.sendToHost).toHaveBeenCalledWith(
      "preview:comment-target",
      expect.objectContaining({
        anchor: expect.objectContaining({
          label: `span "Hero copy"`,
          tagName: "span",
          text: "Hero copy",
          type: "element",
        }),
      }),
    )
  })

  it("shows an element highlight and inspector tooltip while hovering in comment mode", () => {
    document.body.innerHTML = `<p style="color: rgb(17, 34, 51); font-size: 16px; font-family: Inter, sans-serif;">Preview text</p>`
    const paragraph = document.querySelector("p")!
    Object.defineProperty(paragraph, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 45,
        height: 25,
        left: 10,
        right: 445,
        top: 20,
        width: 435,
        x: 10,
        y: 20,
        toJSON: () => ({}),
      }),
    })

    paragraph.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 24,
      clientY: 30,
    }))

    const highlight = document.getElementById("__desktop-preview-highlight__")
    const tooltip = document.getElementById("__desktop-preview-inspector-tooltip__")

    expect(highlight).toHaveStyle({
      display: "block",
      height: "25px",
      width: "435px",
    })
    expect(tooltip).toHaveStyle({
      display: "block",
      left: "36px",
      top: "42px",
    })
    expect(tooltip?.textContent).toContain("p")
    expect(tooltip?.textContent).toContain("435x25")
    expect(tooltip?.textContent).toContain("#112233")
  })
})
