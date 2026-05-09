import { z } from "zod"

export const RequestIdSchema = z.string().min(1)

export const ApiErrorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string(),
})

export const ApiSuccessEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
  requestId: RequestIdSchema.optional(),
})

export const ApiFailureEnvelopeSchema = z.object({
  success: z.literal(false),
  error: ApiErrorBodySchema,
  requestId: RequestIdSchema.optional(),
})

export const ApiEnvelopeSchema = z.discriminatedUnion("success", [
  ApiSuccessEnvelopeSchema,
  ApiFailureEnvelopeSchema,
])

export function apiSuccessEnvelopeSchema<DataSchema extends z.ZodType>(data: DataSchema) {
  return z.object({
    success: z.literal(true),
    data,
    requestId: RequestIdSchema.optional(),
  })
}

export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>
export type ApiEnvelope<T = unknown> =
  | {
      success: true
      data: T
      requestId?: string
    }
  | {
      success: false
      error: ApiErrorBody
      requestId?: string
    }
