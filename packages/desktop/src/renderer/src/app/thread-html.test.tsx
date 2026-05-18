import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThreadHtml } from "./thread-html"

describe("ThreadHtml", () => {
  beforeEach(() => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://example.com/",
      }),
    } as unknown as Window["desktop"]
  })

  it("renders allowed semantic HTML fragments", () => {
    const { container } = render(
      <ThreadHtml
        text={[
          "<section>",
          "<h2>Release notes</h2>",
          "<p><strong>Ready</strong> to ship.</p>",
          "<ul><li>HTML</li></ul>",
          "<table><thead><tr><th>File</th></tr></thead><tbody><tr><td>ThreadView.tsx</td></tr></tbody></table>",
          "</section>",
        ].join("")}
      />,
    )

    expect(screen.getByRole("heading", { name: "Release notes" })).toBeInTheDocument()
    expect(container.querySelector("strong")).toHaveTextContent("Ready")
    expect(screen.getByRole("listitem")).toHaveTextContent("HTML")
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("removes unsafe tags and attributes", () => {
    const { container } = render(
      <ThreadHtml
        text={[
          '<p class="custom" style="color:red" onclick="alert(1)">Safe text</p>',
          "<script>window.evil = true</script>",
          "<style>p { color: red; }</style>",
          '<iframe src="https://example.com"></iframe>',
        ].join("")}
      />,
    )

    const paragraph = screen.getByText("Safe text")
    expect(paragraph).not.toHaveAttribute("class")
    expect(paragraph).not.toHaveAttribute("style")
    expect(paragraph).not.toHaveAttribute("onclick")
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("style")).toBeNull()
    expect(container.querySelector("iframe")).toBeNull()
    expect(container).not.toHaveTextContent("window.evil")
  })

  it("blocks unsupported link targets", () => {
    render(
      <ThreadHtml
        text={[
          '<a href="javascript:alert(1)">Bad</a>',
          '<a href="data:text/html;base64,PGgxPkJhZDwvaDE+">Data</a>',
          '<a href="src/app.tsx">Relative</a>',
        ].join(" ")}
      />,
    )

    expect(screen.queryByRole("link", { name: "Bad" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Data" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Relative" })).not.toBeInTheDocument()
    expect(screen.getByText("Bad")).toBeInTheDocument()
    expect(screen.getByText("Data")).toBeInTheDocument()
    expect(screen.getByText("Relative")).toBeInTheDocument()
  })

  it("opens safe external links through the desktop bridge", () => {
    render(<ThreadHtml text='<a href="https://example.com/docs">Docs</a>' />)

    fireEvent.click(screen.getByRole("link", { name: "Docs" }))

    expect(window.desktop?.openExternalUrl).toHaveBeenCalledWith({
      url: "https://example.com/docs",
    })
  })

  it("opens artifact links through the artifact callback", () => {
    const onArtifactLinkOpen = vi.fn()
    render(
      <ThreadHtml
        text='<a href="agent://artifact/report-1">Artifact</a>'
        onArtifactLinkOpen={onArtifactLinkOpen}
      />,
    )

    fireEvent.click(screen.getByRole("link", { name: "Artifact" }))

    expect(onArtifactLinkOpen).toHaveBeenCalledWith({
      href: "agent://artifact/report-1",
      id: "report-1",
    })
    expect(window.desktop?.openExternalUrl).not.toHaveBeenCalled()
  })

  it("opens local file links through the local file callback", () => {
    const onLocalFileLinkOpen = vi.fn()
    render(
      <ThreadHtml
        text='<a href="C:/Projects/fanfande_studio/packages/desktop/src/renderer/src/app/thread/ThreadView.tsx:42">ThreadView.tsx</a>'
        onLocalFileLinkOpen={onLocalFileLinkOpen}
      />,
    )

    fireEvent.click(screen.getByRole("link", { name: "ThreadView.tsx" }))

    expect(onLocalFileLinkOpen).toHaveBeenCalledWith({
      lineRange: {
        startLineNumber: 42,
        endLineNumber: 42,
      },
      path: "C:/Projects/fanfande_studio/packages/desktop/src/renderer/src/app/thread/ThreadView.tsx",
    })
    expect(window.desktop?.openExternalUrl).not.toHaveBeenCalled()
  })
})
