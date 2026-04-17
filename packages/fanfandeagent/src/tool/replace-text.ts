import z from "zod"
import * as Tool from "#tool/tool.ts"
import {
  prepareWriteTextFile,
  readTextFile,
  writePreparedTextFile,
} from "#tool/shared.ts"

const ReplaceTextParameters = z.object({
  file_path: z.string().min(1).optional().describe("Absolute or project-relative file path."),
  path: z.string().min(1).optional().describe("Deprecated alias for file_path."),
  old_string: z.string().optional().describe("Exact text to replace. Use an empty string only when creating a new file."),
  search: z.string().optional().describe("Deprecated alias for old_string."),
  new_string: z.string().optional().describe("Replacement text. Can be empty to delete the matched text."),
  replace: z.string().optional().describe("Deprecated alias for new_string."),
  replace_all: z.boolean().optional().describe("Replace all matches. When false, the match must be unique."),
  all: z.boolean().optional().describe("Deprecated alias for replace_all."),
}).superRefine((value, ctx) => {
  if (!value.file_path && !value.path) {
    ctx.addIssue({
      code: "custom",
      path: ["file_path"],
      message: "file_path is required.",
    })
  }

  if (value.file_path && value.path && value.file_path !== value.path) {
    ctx.addIssue({
      code: "custom",
      path: ["file_path"],
      message: "file_path and path must match when both are provided.",
    })
  }

  if (value.old_string == null && value.search == null) {
    ctx.addIssue({
      code: "custom",
      path: ["old_string"],
      message: "old_string is required.",
    })
  }

  if (value.old_string != null && value.search != null && value.old_string !== value.search) {
    ctx.addIssue({
      code: "custom",
      path: ["old_string"],
      message: "old_string and search must match when both are provided.",
    })
  }

  if (value.new_string == null && value.replace == null) {
    ctx.addIssue({
      code: "custom",
      path: ["new_string"],
      message: "new_string is required.",
    })
  }

  if (value.new_string != null && value.replace != null && value.new_string !== value.replace) {
    ctx.addIssue({
      code: "custom",
      path: ["new_string"],
      message: "new_string and replace must match when both are provided.",
    })
  }

  if (
    value.replace_all != null &&
    value.all != null &&
    value.replace_all !== value.all
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["replace_all"],
      message: "replace_all and all must match when both are provided.",
    })
  }
})

type ReplaceTextParameters = z.infer<typeof ReplaceTextParameters>

type NormalizedEdit = {
  filePath: string
  oldString: string
  newString: string
  replaceAll: boolean
}

function normalizeParameters(parameters: ReplaceTextParameters): NormalizedEdit {
  return {
    filePath: parameters.file_path ?? parameters.path ?? "",
    oldString: parameters.old_string ?? parameters.search ?? "",
    newString: parameters.new_string ?? parameters.replace ?? "",
    replaceAll: parameters.replace_all ?? parameters.all ?? false,
  }
}

function findActualOldString(file: string, oldString: string): string | undefined {
  if (file.includes(oldString)) return oldString

  if (oldString.includes("\n")) {
    const crlf = oldString.replace(/\r?\n/g, "\r\n")
    if (crlf !== oldString && file.includes(crlf)) return crlf
  }

  if (oldString.includes("\r\n")) {
    const lf = oldString.replace(/\r\n/g, "\n")
    if (lf !== oldString && file.includes(lf)) return lf
  }

  return undefined
}

function normalizeReplacementLineEndings(newString: string, actualOldString: string): string {
  if (!newString.includes("\n") && !newString.includes("\r")) {
    return newString
  }

  if (actualOldString.includes("\r\n")) {
    return newString.replace(/\r?\n/g, "\r\n")
  }

  if (actualOldString.includes("\n")) {
    return newString.replace(/\r\n/g, "\n")
  }

  return newString
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle.length) return 0
  return haystack.split(needle).length - 1
}

export const ReplaceTextTool = Tool.define(
  "replace-text",
  async () => {
    return {
      title: "Replace Text",
      description: "Edit a single text file by replacing an exact string, using Claude-style old_string/new_string semantics.",
      parameters: ReplaceTextParameters,
      validate: (parameters) => {
        const { oldString, newString } = normalizeParameters(parameters)
        if (oldString === newString) {
          return "No changes to make: old_string and new_string are exactly the same."
        }
      },
      describeApproval: async (parameters, ctx) => {
        const { filePath, oldString, replaceAll } = normalizeParameters(parameters)
        const target = await prepareWriteTextFile(filePath)

        let summary: string
        if (!target.exists && oldString === "") {
          summary = `Create ${target.displayPath} with new file contents.`
        } else if (replaceAll) {
          summary = `Replace all occurrences of the selected text in ${target.displayPath}.`
        } else {
          summary = `Edit ${target.displayPath} by replacing one uniquely matched occurrence.`
        }

        return {
          title: `${target.exists ? "Edit" : "Create"} ${target.displayPath}`,
          summary,
          details: {
            paths: [target.displayPath],
            workdir: ctx.cwd,
          },
        }
      },
      execute: async (parameters) => {
        const { filePath, oldString, newString, replaceAll } = normalizeParameters(parameters)
        const target = await prepareWriteTextFile(filePath)

        if (!target.exists) {
          if (oldString !== "") {
            throw new Error(
              `Cannot edit ${target.displayPath} because it does not exist. To create a new file, set old_string to an empty string.`,
            )
          }

          const result = await writePreparedTextFile(target, newString)
          return {
            title: `Created ${target.displayPath}`,
            text: `Created ${target.displayPath} with ${result.bytes} bytes.`,
            data: {
              path: target.path,
              displayPath: target.displayPath,
              replacements: 1,
              created: true,
            },
          }
        }

        const original = await readTextFile(filePath)

        if (oldString === "") {
          if (original.trim() !== "") {
            throw new Error(
              `Cannot create new content in ${target.displayPath} because the file already exists and is not empty.`,
            )
          }

          const updated = newString
          if (updated === original) {
            throw new Error(`No changes were produced for ${target.displayPath}.`)
          }

          await writePreparedTextFile(target, updated)
          return {
            title: `Updated ${target.displayPath}`,
            text: `Updated ${target.displayPath} by replacing an empty file with new contents.`,
            data: {
              path: target.path,
              displayPath: target.displayPath,
              replacements: 1,
              created: false,
            },
          }
        }

        const actualOldString = findActualOldString(original, oldString)
        if (!actualOldString) {
          throw new Error(`String to replace was not found in ${target.displayPath}.`)
        }

        const matches = countOccurrences(original, actualOldString)
        if (matches > 1 && !replaceAll) {
          throw new Error(
            `Found ${matches} matches in ${target.displayPath}, but replace_all is false. Provide a more specific old_string or set replace_all to true.`,
          )
        }

        const replacement = normalizeReplacementLineEndings(newString, actualOldString)
        const updated = replaceAll
          ? original.split(actualOldString).join(replacement)
          : original.replace(actualOldString, replacement)

        if (updated === original) {
          throw new Error(`No changes were produced for ${target.displayPath}.`)
        }

        const replacements = replaceAll ? matches : 1
        await writePreparedTextFile(target, updated)

        return {
          title: `Updated ${target.displayPath}`,
          text: replaceAll
            ? `Replaced ${replacements} occurrence(s) in ${target.displayPath}.`
            : `Updated ${target.displayPath} by replacing one occurrence.`,
          data: {
            path: target.path,
            displayPath: target.displayPath,
            replacements,
            created: false,
          },
        }
      },
    }
  },
  {
    title: "Replace Text",
    capabilities: {
      kind: "write",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
  },
)
