import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThreadMarkdown } from "./thread-markdown"

describe("ThreadMarkdown", () => {
  beforeEach(() => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
      }),
    } as unknown as Window["desktop"]
  })

  it("renders GFM markdown blocks and inline formatting", () => {
    render(
      <ThreadMarkdown
        text={[
          "## Release notes",
          "",
          "**Ready** to ship.",
          "",
          "- [x] Markdown",
          "- Tables",
          "",
          "> Reviewed",
          "",
          "| File | Status |",
          "| --- | --- |",
          "| `ThreadView.tsx` | done |",
          "",
          "```ts",
          "const enabled = true",
          "```",
        ].join("\n")}
      />,
    )

    expect(screen.getByRole("heading", { name: "Release notes" })).toBeInTheDocument()
    expect(screen.getByText("Ready")).toBeInTheDocument()
    expect(screen.getByRole("checkbox")).toBeChecked()
    expect(screen.getByText("Reviewed")).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByText("ThreadView.tsx")).toBeInTheDocument()
    expect(screen.getByText("const enabled = true")).toBeInTheDocument()
  })

  it("skips raw HTML and blocks unsafe links", () => {
    render(
      <ThreadMarkdown
        text={'Before <span data-testid="raw-html">raw</span> [bad](javascript:alert(1)) [ftp](ftp://example.com).'}
      />,
    )

    expect(screen.queryByTestId("raw-html")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "bad" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "ftp" })).not.toBeInTheDocument()
    expect(screen.getByText(/bad/)).toBeInTheDocument()
    expect(screen.getByText(/ftp/)).toBeInTheDocument()
  })

  it("opens safe links through the desktop bridge", () => {
    render(<ThreadMarkdown text="[Docs](https://example.com/docs)" />)

    fireEvent.click(screen.getByRole("link", { name: "Docs" }))

    expect(window.desktop?.openExternalUrl).toHaveBeenCalledWith({
      url: "https://example.com/docs",
    })
  })

  it("renders http markdown images directly", () => {
    render(<ThreadMarkdown text="![Diagram](https://example.com/diagram.png)" />)

    const image = screen.getByRole("img", { name: "Diagram" })
    expect(image).toHaveClass("thread-markdown-image")
    expect(image).toHaveAttribute("src", "https://example.com/diagram.png")
  })

  it("rewrites local absolute image paths to the internal image protocol", () => {
    render(<ThreadMarkdown text={String.raw`![Local](C:\Users\19128\AppData\Local\Temp\a.png)`} />)

    const image = screen.getByRole("img", { name: "Local" })
    expect(image).toHaveAttribute(
      "src",
      `fanfande-local-image://image?source=${encodeURIComponent(String.raw`C:\Users\19128\AppData\Local\Temp\a.png`)}`,
    )
  })

  it("rewrites file URL images to the internal image protocol", () => {
    render(<ThreadMarkdown text="![Local](file:///C:/Users/19128/AppData/Local/Temp/a.png)" />)

    const image = screen.getByRole("img", { name: "Local" })
    expect(image).toHaveAttribute(
      "src",
      `fanfande-local-image://image?source=${encodeURIComponent("file:///C:/Users/19128/AppData/Local/Temp/a.png")}`,
    )
  })

  it("renders unsafe and relative image sources as alt text", () => {
    const { container } = render(
      <ThreadMarkdown text="![Bad](javascript:alert(1)) ![Ftp](ftp://example.com/a.png) ![Relative](images/a.png)" />,
    )

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("Bad")).toHaveClass("thread-markdown-image-alt")
    expect(screen.getByText("Ftp")).toHaveClass("thread-markdown-image-alt")
    expect(screen.getByText("Relative")).toHaveClass("thread-markdown-image-alt")
  })
})
