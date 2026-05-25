import z from "zod"
import * as Tool from "#tool/tool.ts"
import {
  prepareWriteTextFile,
  readTextFile,
  writePreparedTextFile,
} from "#tool/shared.ts"

const ReplaceTextParameters = z.object({
  file_path: z.string().min(1).describe("Single target text file to edit, using an absolute or project-relative path."),
  old_string: z.string().describe("Exact text to replace in one file. Use an empty string only to create one new text file or fill an empty file."),
  new_string: z.string().describe("Replacement text, or the complete contents when creating one new text file. Can be empty to delete the matched text."),
  replace_all: z.boolean().optional().describe("Replace all exact matches in the single target file. When false, the match must be unique."),
}).superRefine((value, ctx) => {
  if (!value.file_path) {
    ctx.addIssue({
      code: "custom",
      path: ["file_path"],
      message: "file_path is required.",
    })
  }

  if (value.old_string == null) {
    ctx.addIssue({
      code: "custom",
      path: ["old_string"],
      message: "old_string is required.",
    })
  }

  if (value.new_string == null) {
    ctx.addIssue({
      code: "custom",
      path: ["new_string"],
      message: "new_string is required.",
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
    filePath: parameters.file_path,
    oldString: parameters.old_string,
    newString: parameters.new_string,
    replaceAll: parameters.replace_all ?? false,
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
  "replace_text",
  async () => {
    return {
      title: "Replace Text",
      description: "Use for focused single-file text edits when you can provide an exact old_string/new_string, or to create one new text file with old_string empty. Prefer apply_patch for coordinated multi-file edits, file moves/deletes, broad structural changes, or when a unified diff is clearer.",
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
    aliases: ["replace-text"],
    capabilities: {
      kind: "write",
      readOnly: false,
      destructive: true,
      concurrency: "exclusive",
    },
  },
)
