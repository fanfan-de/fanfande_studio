import z from "zod"
import * as Identifier from "#id/id.ts"
import * as Tool from "#tool/tool.ts"

const QuestionOptionSchema = z.object({
  label: z.string().min(1).describe("User-facing option label."),
  value: z.string().optional().describe("Stable value returned when the user picks this option. Defaults to the label."),
  description: z.string().optional().describe("Short explanation shown with the option."),
})

export const AskUserQuestionParameters = z.object({
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

const AskUserQuestionAnswerSchema = z.object({
  selectedOptions: z.array(z.string().min(1)).optional(),
  freeformText: z.string().optional(),
})

type AskUserQuestionParametersValue = z.infer<typeof AskUserQuestionParameters>
type AskUserQuestionAnswerValue = z.infer<typeof AskUserQuestionAnswerSchema> & {
  answerText: string
  answeredAt: number
}
type AskUserQuestionMetadata = {
  kind: "ask-user-question"
  version: 1
  questionID: string
  toolCallID?: string
  header?: string
  question: string
  options: Array<{ label: string; value: string; description?: string }>
  allowFreeform: boolean
  placeholder?: string
  multiple: boolean
  required: boolean
  answered?: boolean
  answerText?: string
  selectedOptions?: string[]
  freeformText?: string
  answeredAt?: number
}

type PendingQuestion = {
  metadata: AskUserQuestionMetadata
  resolve: (answer: AskUserQuestionAnswerValue) => void
  reject: (error: Error) => void
  abortListener?: () => void
}

const pendingQuestions = new Map<string, PendingQuestion>()

function pendingQuestionKey(sessionID: string, questionID: string) {
  return `${sessionID}:${questionID}`
}

function sanitizeQuestionIDPart(value: string) {
  const normalized = value.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
  return normalized || Identifier.ascending("question").slice("que_".length)
}

export function questionIDForToolCallID(toolCallID: string | undefined) {
  return toolCallID ? `que_${sanitizeQuestionIDPart(toolCallID)}` : Identifier.ascending("question")
}

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

function renderAnsweredQuestionText(input: AskUserQuestionMetadata & AskUserQuestionAnswerValue) {
  return [
    renderQuestionText(input),
    "",
    "User answer received:",
    input.answerText,
  ].join("\n")
}

function normalizeAnswerText(answer: z.infer<typeof AskUserQuestionAnswerSchema>) {
  const freeformText = answer.freeformText?.trim()
  if (freeformText) return freeformText

  const selectedOptions = (answer.selectedOptions ?? []).map((value) => value.trim()).filter(Boolean)
  if (selectedOptions.length > 0) return selectedOptions.join(", ")

  return ""
}

function validateAnswer(metadata: AskUserQuestionMetadata, answer: z.infer<typeof AskUserQuestionAnswerSchema>) {
  const selectedOptions = (answer.selectedOptions ?? []).map((value) => value.trim()).filter(Boolean)
  const freeformText = answer.freeformText?.trim() ?? ""
  const allowedValues = new Set(metadata.options.map((option) => option.value))

  if (selectedOptions.length > 0) {
    for (const value of selectedOptions) {
      if (!allowedValues.has(value)) {
        throw new Error(`Answer option "${value}" is not one of the available choices for this question.`)
      }
    }
  }

  if (!metadata.multiple && selectedOptions.length > 1) {
    throw new Error("This question only accepts one predefined option.")
  }

  if (!metadata.allowFreeform && freeformText) {
    throw new Error("This question does not accept a freeform answer.")
  }

  if (metadata.required && selectedOptions.length === 0 && !freeformText) {
    throw new Error("This question requires an answer before continuing.")
  }
}

export function createAskUserQuestionMetadata(
  parameters: AskUserQuestionParametersValue,
  ctx?: Pick<Tool.Context, "toolCallID">,
): AskUserQuestionMetadata {
  const options = normalizeOptions(parameters.options)
  const allowFreeform = parameters.allowFreeform ?? options.length === 0
  const multiple = parameters.multiple ?? false
  const required = parameters.required ?? true

  return {
    kind: "ask-user-question",
    version: 1,
    questionID: questionIDForToolCallID(ctx?.toolCallID),
    toolCallID: ctx?.toolCallID,
    header: parameters.header,
    question: parameters.question,
    options,
    allowFreeform,
    placeholder: parameters.placeholder,
    multiple,
    required,
  }
}

export function createAskUserQuestionMetadataFromInput(
  input: unknown,
  ctx?: Pick<Tool.Context, "toolCallID">,
) {
  const parsed = AskUserQuestionParameters.safeParse(input)
  if (!parsed.success) return undefined
  return createAskUserQuestionMetadata(parsed.data, ctx)
}

function waitForAnswer(metadata: AskUserQuestionMetadata, ctx: Tool.Context) {
  const key = pendingQuestionKey(ctx.sessionID, metadata.questionID)
  const existing = pendingQuestions.get(key)
  if (existing) {
    existing.reject(new Error("This question was replaced by a newer tool call."))
    pendingQuestions.delete(key)
  }

  return new Promise<AskUserQuestionAnswerValue>((resolve, reject) => {
    const pending: PendingQuestion = {
      metadata,
      resolve,
      reject,
    }

    const abortListener = () => {
      pendingQuestions.delete(key)
      reject(new Error("Question was cancelled before the user answered."))
    }

    if (ctx.abort?.aborted) {
      abortListener()
      return
    }

    if (ctx.abort) {
      pending.abortListener = abortListener
      ctx.abort.addEventListener("abort", abortListener, { once: true })
    }

    pendingQuestions.set(key, pending)
  }).finally(() => {
    const pending = pendingQuestions.get(key)
    if (pending?.abortListener && ctx.abort) {
      ctx.abort.removeEventListener("abort", pending.abortListener)
    }
    pendingQuestions.delete(key)
  })
}

export function answerAskUserQuestion(input: {
  sessionID: string
  questionID: string
  selectedOptions?: string[]
  freeformText?: string
}) {
  const questionID = input.questionID.trim()
  const pending = pendingQuestions.get(pendingQuestionKey(input.sessionID, questionID))
  if (!pending) {
    throw new Error(`Question '${questionID}' is not waiting for an answer.`)
  }

  const parsed = AskUserQuestionAnswerSchema.parse({
    selectedOptions: input.selectedOptions,
    freeformText: input.freeformText,
  })
  validateAnswer(pending.metadata, parsed)

  const answerText = normalizeAnswerText(parsed)
  const answer = {
    ...parsed,
    selectedOptions: parsed.selectedOptions?.map((value) => value.trim()).filter(Boolean),
    freeformText: parsed.freeformText?.trim() || undefined,
    answerText,
    answeredAt: Date.now(),
  }

  pending.resolve(answer)
  return {
    sessionID: input.sessionID,
    questionID,
    ...answer,
  }
}

export function isAnsweredAskUserQuestionMetadata(metadata: Record<string, unknown> | undefined) {
  return Boolean(metadata && metadata.kind === "ask-user-question" && metadata.answered === true)
}

export const AskUserQuestionTool = Tool.define(
  "AskUserQuestion",
  async () => {
    return {
      title: "Ask User Question",
      description: "Ask the user a structured clarifying question and wait for their reply before continuing.",
      parameters: AskUserQuestionParameters,
      assessPermission: () => ({
        action: "allow",
        risk: "low",
        reason: "Asking the user a question has no side effects.",
      }),
      execute: async (parameters, ctx) => {
        const metadata = createAskUserQuestionMetadata(parameters, ctx)
        const answer = await waitForAnswer(metadata, ctx)

        return {
          title: parameters.header ?? "Question for user",
          text: renderAnsweredQuestionText({
            ...metadata,
            ...answer,
          }),
          metadata: {
            ...metadata,
            answered: true,
            answerText: answer.answerText,
            selectedOptions: answer.selectedOptions,
            freeformText: answer.freeformText,
            answeredAt: answer.answeredAt,
          },
        }
      },
      toModelOutput: async (result) => {
        const metadata = (result.metadata ?? {}) as Record<string, unknown>
        const answered = metadata.answered === true
        return {
          type: "json" as const,
          value: {
            kind: "ask-user-question",
            shownToUser: true,
            answered,
            questionID: typeof metadata.questionID === "string" ? metadata.questionID : undefined,
            toolCallID: typeof metadata.toolCallID === "string" ? metadata.toolCallID : undefined,
            header: typeof metadata.header === "string" ? metadata.header : undefined,
            question: typeof metadata.question === "string" ? metadata.question : result.text,
            options: Array.isArray(metadata.options) ? metadata.options : [],
            allowFreeform: metadata.allowFreeform === true,
            multiple: metadata.multiple === true,
            required: metadata.required !== false,
            answerText: typeof metadata.answerText === "string" ? metadata.answerText : undefined,
            selectedOptions: Array.isArray(metadata.selectedOptions) ? metadata.selectedOptions : undefined,
            freeformText: typeof metadata.freeformText === "string" ? metadata.freeformText : undefined,
            instruction: answered
              ? "The user answered this question. Continue using the answer."
              : "Stop after this tool call and wait for the user's response before taking any further action.",
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
