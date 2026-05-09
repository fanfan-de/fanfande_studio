import { z } from "zod"

export const DesktopIpcSchemas = {
  openPath: {
    input: z.object({
      targetPath: z.string().min(1),
    }),
    output: z.object({
      ok: z.literal(true),
      targetPath: z.string().min(1),
    }),
  },
  getInfo: {
    output: z.object({
      platform: z.string(),
      electron: z.string(),
      chrome: z.string(),
      node: z.string(),
    }),
  },
} as const

export type DesktopOpenPathInput = z.infer<typeof DesktopIpcSchemas.openPath.input>
export type DesktopOpenPathResult = z.infer<typeof DesktopIpcSchemas.openPath.output>
