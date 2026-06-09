import z from "zod"

export const EvalModelRef = z.object({
  providerID: z.string().min(1),
  modelID: z.string().min(1),
})
export type EvalModelRef = z.infer<typeof EvalModelRef>

export const EvalCaseInput = z.object({
  prompt: z.string().min(1),
  system: z.string().optional(),
  agent: z.string().optional(),
  skills: z.array(z.string().min(1)).optional(),
  model: EvalModelRef.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
})
export type EvalCaseInput = z.infer<typeof EvalCaseInput>

const AssertionBase = z.object({
  id: z.string().min(1).optional(),
  description: z.string().optional(),
  weight: z.number().min(0).default(1),
})

export const EvalAssertion = z.discriminatedUnion("type", [
  AssertionBase.extend({
    type: z.literal("status"),
    value: z.enum(["completed", "blocked", "failed", "cancelled"]),
  }),
  AssertionBase.extend({
    type: z.literal("output_contains"),
    value: z.string(),
    caseSensitive: z.boolean().default(false),
  }),
  AssertionBase.extend({
    type: z.literal("output_not_contains"),
    value: z.string(),
    caseSensitive: z.boolean().default(false),
  }),
  AssertionBase.extend({
    type: z.literal("output_exact"),
    value: z.string(),
    trim: z.boolean().default(true),
  }),
  AssertionBase.extend({
    type: z.literal("output_regex"),
    pattern: z.string().min(1),
    flags: z.string().optional(),
  }),
  AssertionBase.extend({
    type: z.literal("output_min_length"),
    min: z.number().int().nonnegative(),
  }),
  AssertionBase.extend({
    type: z.literal("output_max_length"),
    max: z.number().int().nonnegative(),
  }),
  AssertionBase.extend({
    type: z.literal("tool_called"),
    name: z.string().min(1),
    minCalls: z.number().int().nonnegative().default(1),
  }),
  AssertionBase.extend({
    type: z.literal("tool_not_called"),
    name: z.string().min(1),
  }),
  AssertionBase.extend({
    type: z.literal("tool_call_count"),
    name: z.string().min(1).optional(),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
  }),
  AssertionBase.extend({
    type: z.literal("metadata_equals"),
    path: z.string().min(1),
    value: z.any(),
  }),
  AssertionBase.extend({
    type: z.literal("latency_under_ms"),
    maxMs: z.number().int().positive(),
  }),
  AssertionBase.extend({
    type: z.literal("token_usage_under"),
    maxTokens: z.number().int().nonnegative(),
  }),
  AssertionBase.extend({
    type: z.literal("cost_under"),
    maxCost: z.number().nonnegative(),
  }),
  AssertionBase.extend({
    type: z.literal("custom"),
    name: z.string().min(1),
    config: z.record(z.string(), z.any()).default({}),
  }),
])
export type EvalAssertion = z.infer<typeof EvalAssertion>

export const EvalCase = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  input: EvalCaseInput,
  assertions: z.array(EvalAssertion).default([]),
  threshold: z.number().min(0).max(1).optional(),
  repetitions: z.number().int().positive().optional(),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
})
export type EvalCase = z.infer<typeof EvalCase>

export const EvalSuite = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  cases: z.array(EvalCase).min(1),
  defaultThreshold: z.number().min(0).max(1).default(1),
  concurrency: z.number().int().positive().default(1),
  repetitions: z.number().int().positive().default(1),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.any()).optional(),
})
export type EvalSuite = z.infer<typeof EvalSuite>
