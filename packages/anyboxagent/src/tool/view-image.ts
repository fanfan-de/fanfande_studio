import type { JSONValue } from "@ai-sdk/provider"
import z from "zod"
import * as Tool from "#tool/tool.ts"
import * as ImageAssets from "#session/support/image-assets.ts"

const ViewImageParameters = z.object({
  path: z.string().min(1).describe("Absolute or project-relative path to a local image file."),
})

export const ViewImageTool = Tool.define(
  "view_image",
  async () => {
    return {
      title: "View Image",
      description: "Load a local image file and return display metadata for the thread view. This does not perform OCR or image understanding.",
      parameters: ViewImageParameters,
      execute: async (parameters, ctx): Promise<Tool.ToolOutput<Record<string, unknown>, Record<string, unknown>>> => {
        const local = await ImageAssets.readLocalImage(parameters.path)
        const asset = await ImageAssets.saveImageAsset({
          sessionID: ctx.sessionID,
          bytes: local.bytes,
          mime: local.mime,
          filename: local.filename,
          sourceTool: "view_image",
          originalPath: local.path,
        })
        const image = {
          path: local.path,
          url: asset.url,
          width: asset.width ?? local.width,
          height: asset.height ?? local.height,
          mimeType: asset.mime,
          sourceTool: "view_image",
        }

        return {
          title: `View ${asset.filename}`,
          text: [
            `Image: ${asset.filename}`,
            `Path: ${local.path}`,
            `MIME: ${asset.mime}`,
            image.width && image.height ? `Size: ${image.width}x${image.height}` : undefined,
            `URL: ${asset.url}`,
          ].filter(Boolean).join("\n"),
          metadata: {
            kind: "view-image",
            sourceTool: "view_image",
            image,
          },
          data: {
            image,
            images: [image],
          },
          attachments: [
            {
              url: asset.url,
              mime: asset.mime,
              filename: asset.filename,
              metadata: {
                kind: "image-asset",
                sourceTool: "view_image",
                width: image.width,
                height: image.height,
                mimeType: asset.mime,
                originalPath: local.path,
              },
            },
          ],
        }
      },
      toModelOutput: (result) => ({
        type: "json" as const,
        value: (result.data ?? result.metadata ?? { text: result.text }) as JSONValue,
      }),
    }
  },
  {
    title: "View Image",
    capabilities: {
      kind: "read",
      readOnly: true,
      destructive: false,
      concurrency: "safe",
    },
  },
)
