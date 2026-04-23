import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ThreadRichText, parseThreadRichText } from "./thread-rich-text"

describe("parseThreadRichText", () => {
  it("supports markdown links and bare URLs in the same string", () => {
    expect(
      parseThreadRichText("Docs: [OpenAI](https://openai.com/docs(test)) and https://example.com/plan."),
    ).toEqual([
      {
        type: "text",
        text: "Docs: ",
      },
      {
        type: "link",
        text: "OpenAI",
        href: "https://openai.com/docs(test)",
      },
      {
        type: "text",
        text: " and ",
      },
      {
        type: "link",
        text: "https://example.com/plan",
        href: "https://example.com/plan",
      },
      {
        type: "text",
        text: ".",
      },
    ])
  })

  it("stops bare URLs before adjacent Chinese punctuation and text", () => {
    expect(
      parseThreadRichText("Visit http://localhost:8000/snake.html\u3002Next"),
    ).toEqual([
      {
        type: "text",
        text: "Visit ",
      },
      {
        type: "link",
        text: "http://localhost:8000/snake.html",
        href: "http://localhost:8000/snake.html",
      },
      {
        type: "text",
        text: "\u3002Next",
      },
    ])
  })

  it("promotes matching user references into inline tag segments", () => {
    expect(
      parseThreadRichText("Check @src/angry-birds.js and https://example.com/plan.", [
        {
          id: "file:C:\\Projects\\Atlas\\frontend\\src\\angry-birds.js",
          kind: "file",
          label: "src/angry-birds.js",
          title: "C:\\Projects\\Atlas\\frontend\\src\\angry-birds.js",
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "Check ",
      },
      {
        type: "reference",
        text: "@src/angry-birds.js",
        reference: {
          id: "file:C:\\Projects\\Atlas\\frontend\\src\\angry-birds.js",
          kind: "file",
          label: "src/angry-birds.js",
          title: "C:\\Projects\\Atlas\\frontend\\src\\angry-birds.js",
        },
      },
      {
        type: "text",
        text: " and ",
      },
      {
        type: "link",
        text: "https://example.com/plan",
        href: "https://example.com/plan",
      },
      {
        type: "text",
        text: ".",
      },
    ])
  })
})

describe("ThreadRichText", () => {
  beforeEach(() => {
    window.desktop = {
      openExternalUrl: vi.fn().mockResolvedValue({
        ok: true,
        url: "https://openai.com/",
      }),
    } as unknown as Window["desktop"]
  })

  it("renders clickable links and routes clicks through the desktop bridge", () => {
    render(
      <ThreadRichText
        className="trace-item-text"
        text="Visit [OpenAI](https://openai.com) or https://example.com/plan."
      />,
    )

    const markdownLink = screen.getByRole("link", { name: "OpenAI" })
    const bareUrlLink = screen.getByRole("link", { name: "https://example.com/plan" })

    expect(markdownLink).toHaveAttribute("href", "https://openai.com/")
    expect(bareUrlLink).toHaveAttribute("href", "https://example.com/plan")

    fireEvent.click(markdownLink)
    fireEvent.click(bareUrlLink)

    expect(window.desktop?.openExternalUrl).toHaveBeenNthCalledWith(1, {
      url: "https://openai.com/",
    })
    expect(window.desktop?.openExternalUrl).toHaveBeenNthCalledWith(2, {
      url: "https://example.com/plan",
    })
  })

  it("renders user references as inline pills using composer tag styling", () => {
    render(
      <ThreadRichText
        className="user-bubble-text"
        references={[
          {
            id: "comment-1",
            kind: "comment",
            label: "focus-files.tsx:L2-L3",
            title: "src/focus-files.tsx (lines 2-3)",
          },
        ]}
        text="Review @focus-files.tsx:L2-L3 next."
      />,
    )

    const inlineReference = screen.getByText("@focus-files.tsx:L2-L3")

    expect(inlineReference).toHaveClass("composer-inline-tag", "thread-inline-reference", "is-comment")
    expect(inlineReference).toHaveAttribute("title", "src/focus-files.tsx (lines 2-3)")
  })
})
