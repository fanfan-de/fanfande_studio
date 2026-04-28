import z from "zod"
import * as Identifier from "#id/id.ts"
import * as Tool from "#tool/tool.ts"

const QuestionOptionSchema = z.object({
  label: z.string().min(1).describe("User-facing option label."),
  value: z.string().optional().describe("Stable value returned when the user picks this option. Defaults to the label."),
  description: z.string().optional().describe("Short explanation shown with the option."),
})

const Parameters = z.object({
  header: z.string().min(1).max(80).optional().describe("Short title shown above the question."),
  question: z.string().min(1).describe("The question the user should answer."),
  options: z.array(QuestionOptionSchema).max(6).optional().describe("Optional suggested answers."),
  allowFreeform: z.boolean().optional().describe("Whether the user may enter a custom answer."),
  placeholder: z.string().optional().describe("Optional placeholder for a freeform answer field."),
  multiple: z.boolean().optional().describe("Whether multiple predefined options may be selected."),
  required: z.boolean().optional().describe("Whether an answer is required before continuing."),
}).superRefine((value, ctx) => {
  const optionCount = value.options?.length ?? 0
  const allowFreeform = value.allowFreeform ?? optionCount === 0

  if (optionCount === 0 && !allowFreeform) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message: "Provide at least one option or allow a freeform answer.",
    })
  }

  if (value.multiple && optionCount === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["multiple"],
      message: "multiple=true requires predefined options.",
    })
  }
})

function normalizeOptions(options: z.infer<typeof QuestionOptionSchema>[] | undefined) {
  return (options ?? []).map((option) => ({
    label: option.label,
    value: option.value ?? option.label,
    description: option.description,
  }))
}

function renderQuestionText(input: {
  header?: string
  question: string
  options: Array<{ label: string; value: string; description?: string }>
  allowFreeform: boolean
  multiple: boolean
  required: boolean
  placeholder?: string
}) {
  const lines = [
    input.header ? `Title: ${input.header}` : undefined,
    `Question: ${input.question}`,
    input.required ? "Answer required: yes" : "Answer required: no",
    input.multiple ? "Selection mode: multiple choice" : undefined,
  ].filter(Boolean) as string[]

  if (input.options.length > 0) {
    lines.push("", "Suggested options:")
    for (const option of input.options) {
      const suffix = option.description ? ` - ${option.description}` : ""
      lines.push(`- ${option.label}${option.value !== option.label ? ` (${option.value})` : ""}${suffix}`)
    }
  }

  if (input.allowFreeform) {
    lines.push("", `Freeform answer: allowed${input.placeholder ? ` (${input.placeholder})` : ""}`)
  }

  lines.push("", "The question has been shown to the user. Wait for their response before continuing.")
  return lines.join("\n")
}

export const AskUserQuestionTool = Tool.define(
  "AskUserQuestion",
  async () => {
    return {
      title: "Ask User Question",
      description: "Ask the user a structured clarifying question and wait for their reply before continuing.",
      parameters: Parameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Asking the user a question has no side effects.",
      }),
      execute: async (parameters, ctx) => {
        const options = normalizeOptions(parameters.options)
        const allowFreeform = parameters.allowFreeform ?? options.length === 0
        const multiple = parameters.multiple ?? false
        const required = parameters.required ?? true
        const questionID = Identifier.ascending("question")

        return {
          title: parameters.header ?? "Question for user",
          text: renderQuestionText({
            header: parameters.header,
            question: parameters.question,
            options,
            allowFreeform,
            multiple,
            required,
            placeholder: parameters.placeholder,
          }),
          metadata: {
            kind: "ask-user-question",
            version: 1,
            questionID,
            toolCallID: ctx.toolCallID,
            header: parameters.header,
            question: parameters.question,
            options,
            allowFreeform,
            placeholder: parameters.placeholder,
            multiple,
            required,
          },
        }
      },
      toModelOutput: async (result) => {
        const metadata = (result.metadata ?? {}) as Record<string, unknown>
        return {
          type: "json" as const,
          value: {
            kind: "ask-user-question",
            shownToUser: true,
            questionID: typeof metadata.questionID === "string" ? metadata.questionID : undefined,
            toolCallID: typeof metadata.toolCallID === "string" ? metadata.toolCallID : undefined,
            header: typeof metadata.header === "string" ? metadata.header : undefined,
            question: typeof metadata.question === "string" ? metadata.question : result.text,
            options: Array.isArray(metadata.options) ? metadata.options : [],
            allowFreeform: metadata.allowFreeform === true,
            multiple: metadata.multiple === true,
            required: metadata.required !== false,
            instruction: "Stop after this tool call and wait for the user's response before taking any further action.",
          },
        }
      },
    }
  },
  {
    title: "Ask User Question",
    aliases: ["ask-user-question", "question-tool", "question"],
    capabilities: {
      kind: "interaction",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
