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
      parseThreadRichText("浏览器中访问 http://localhost:8000/snake.html。现在游戏已经可以运行了。"),
    ).toEqual([
      {
        type: "text",
        text: "浏览器中访问 ",
      },
      {
        type: "link",
        text: "http://localhost:8000/snake.html",
        href: "http://localhost:8000/snake.html",
      },
      {
        type: "text",
        text: "。现在游戏已经可以运行了。",
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
})
