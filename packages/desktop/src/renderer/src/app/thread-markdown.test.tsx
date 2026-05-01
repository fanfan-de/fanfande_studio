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

  it("renders images as alt text instead of loading remote resources", () => {
    const { container } = render(<ThreadMarkdown text="![Diagram](https://example.com/diagram.png)" />)

    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("Diagram")).toHaveClass("thread-markdown-image-alt")
  })
})
