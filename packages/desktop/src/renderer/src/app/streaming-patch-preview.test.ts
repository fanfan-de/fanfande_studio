import { describe, expect, it } from "vitest"
import {
  extractStreamingPatchInput,
  parseStreamingBeginPatch,
  toDraftPatchPreview,
} from "./streaming-patch-preview"

describe("streaming patch preview", () => {
  it("extracts a partial escaped patch string from streamed JSON input", () => {
    const input = "{\"patch\":\"*** Begin Patch\\n*** Update File: src/app.ts\\n@@ label\\n-old\\n+new"
    const extracted = extractStreamingPatchInput(input)

    expect(extracted.complete).toBe(false)
    expect(extracted.patch).toContain("*** Begin Patch\n*** Update File: src/app.ts")
    expect(extracted.patch).toContain("-old\n+new")
  })

  it("decodes JSON escapes while extracting the patch field", () => {
    const input = JSON.stringify({
      patch: [
        "*** Begin Patch",
        "*** Add File: src/quoted.ts",
        "+const value = \"\\\\u2713\"",
        "*** End Patch",
      ].join("\n"),
    })
    const extracted = extractStreamingPatchInput(input)

    expect(extracted.complete).toBe(true)
    expect(extracted.patch).toContain("const value = \"\\\\u2713\"")
  })

  it("falls back to a bare Begin Patch payload", () => {
    const extracted = extractStreamingPatchInput([
      "*** Begin Patch",
      "*** Add File: notes.txt",
      "+hello",
    ].join("\n"))

    expect(extracted.complete).toBe(false)
    expect(extracted.patch).toContain("*** Add File: notes.txt")
  })

  it("extracts partial top-level JSON string tool inputs", () => {
    const input = "\"*** Begin Patch\\n*** Add File: src/freeform.ts\\n+hello"
    const extracted = extractStreamingPatchInput(input)

    expect(extracted.complete).toBe(false)
    expect(extracted.patch).toContain("*** Begin Patch\n*** Add File: src/freeform.ts")
    expect(extracted.patch).toContain("+hello")
  })

  it("extracts Begin Patch content from non-patch string fields", () => {
    const extracted = extractStreamingPatchInput(JSON.stringify({
      command: [
        "*** Begin Patch",
        "*** Add File: src/command.ts",
        "+hello",
        "*** End Patch",
      ].join("\n"),
    }))

    expect(extracted.complete).toBe(true)
    expect(extracted.patch).toContain("*** Add File: src/command.ts")
  })

  it("parses add, update, delete, and move directives without throwing", () => {
    const preview = parseStreamingBeginPatch([
      "*** Begin Patch",
      "*** Add File: src/new.ts",
      "+new line",
      "*** Update File: src/edit.ts",
      "*** Move to: src/moved.ts",
      "@@ render",
      " old",
      "-remove",
      "+add",
      "*** Delete File: src/old.ts",
      "*** End Patch",
      "",
    ].join("\n"))

    expect(preview.status).toBe("complete")
    expect(preview.files).toEqual([
      expect.objectContaining({
        additions: 1,
        deletions: 0,
        file: "src/new.ts",
        operation: "add",
        previewState: "complete",
      }),
      expect.objectContaining({
        additions: 1,
        deletions: 1,
        file: "src/moved.ts",
        fromFile: "src/edit.ts",
        operation: "move",
      }),
      expect.objectContaining({
        additions: 0,
        deletions: 0,
        file: "src/old.ts",
        operation: "delete",
      }),
    ])
    expect(preview.files[1]?.previewHunks?.[0]?.rows).toEqual([
      { content: "old", tone: "context" },
      { content: "remove", tone: "remove" },
      { content: "add", tone: "add" },
    ])
  })

  it("keeps the final incomplete line out of the rendered preview", () => {
    const preview = parseStreamingBeginPatch([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-old",
      "+new",
      "+partial",
    ].join("\n"))

    expect(preview.status).toBe("streaming")
    expect(preview.pendingLine).toBe("+partial")
    expect(preview.files[0]?.additions).toBe(1)
    expect(preview.files[0]?.previewHunks?.[0]?.rows).toEqual([
      { content: "old", tone: "remove" },
      { content: "new", tone: "add" },
    ])
  })

  it("returns invalid previews for malformed Begin Patch content", () => {
    const preview = parseStreamingBeginPatch([
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "raw line",
      "",
    ].join("\n"))

    expect(preview.status).toBe("invalid")
    expect(preview.files[0]?.file).toBe("src/app.ts")
  })

  it("builds a draft patch preview from streamed apply_patch input", () => {
    const preview = toDraftPatchPreview({
      rawToolInput: JSON.stringify({
        patch: [
          "*** Begin Patch",
          "*** Update File: src/app.ts",
          "@@",
          "-old",
          "+new",
          "*** End Patch",
        ].join("\n"),
      }),
    })

    expect(preview).toMatchObject({
      status: "running",
      fileChanges: [
        expect.objectContaining({
          additions: 1,
          deletions: 1,
          file: "src/app.ts",
          operation: "update",
          previewState: "complete",
        }),
      ],
    })
  })
})
