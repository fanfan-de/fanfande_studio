import { describe, expect, it } from "vitest"
import { parseAssistantResponseFormat, stripStreamingResponseFormatMarker } from "./thread-response-format"

describe("assistant response format markers", () => {
  it("parses an HTML response marker from the first line", () => {
    expect(parseAssistantResponseFormat("<!-- fanfande-response-format: html -->\n<p>Hello</p>")).toEqual({
      format: "html",
      marker: "<!-- fanfande-response-format: html -->",
      text: "<p>Hello</p>",
    })
  })

  it("parses a Markdown response marker from the first line", () => {
    expect(parseAssistantResponseFormat("  <!-- fanfande-response-format: markdown -->\r\n## Hello")).toEqual({
      format: "markdown",
      marker: "<!-- fanfande-response-format: markdown -->",
      text: "## Hello",
    })
  })

  it("defaults to Markdown when no marker is present", () => {
    const text = "## Hello\n\nPlain Markdown."

    expect(parseAssistantResponseFormat(text)).toEqual({
      format: "markdown",
      marker: null,
      text,
    })
  })

  it("only recognizes markers at the start of the first line", () => {
    const withLeadingBlank = "\n<!-- fanfande-response-format: html -->\n<p>Hello</p>"
    const inCodeBlock = "```html\n<!-- fanfande-response-format: html -->\n```"

    expect(parseAssistantResponseFormat(withLeadingBlank)).toMatchObject({
      format: "markdown",
      marker: null,
      text: withLeadingBlank,
    })
    expect(parseAssistantResponseFormat(inCodeBlock)).toMatchObject({
      format: "markdown",
      marker: null,
      text: inCodeBlock,
    })
  })

  it("does not recognize marker text followed by same-line body content", () => {
    const text = "<!-- fanfande-response-format: html --><p>Hello</p>"

    expect(parseAssistantResponseFormat(text)).toEqual({
      format: "markdown",
      marker: null,
      text,
    })
  })

  it("strips complete and partial markers while streaming", () => {
    expect(stripStreamingResponseFormatMarker("<!-- fanfande-response-format: html -->\n<p>Hello</p>")).toBe(
      "<p>Hello</p>",
    )
    expect(stripStreamingResponseFormatMarker("<")).toBe("")
    expect(stripStreamingResponseFormatMarker("<!-- fanfande-response-format: h")).toBe("")
    expect(stripStreamingResponseFormatMarker("   <!-- fanfande-response-format: markdown")).toBe("")
  })

  it("keeps non-marker streaming text visible", () => {
    expect(stripStreamingResponseFormatMarker("<p>Hello")).toBe("<p>Hello")
    expect(stripStreamingResponseFormatMarker("<!-- unrelated -->")).toBe("<!-- unrelated -->")
  })
})
