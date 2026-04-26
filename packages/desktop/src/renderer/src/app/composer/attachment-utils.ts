import type { ComposerAttachment, ProviderModel } from "../types"

export interface ComposerAttachmentCapabilities {
  image: boolean
  pdf: boolean
}

export type ComposerAttachmentKind = "image" | "pdf" | "unsupported"

const IMAGE_ATTACHMENT_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"])

export function getComposerAttachmentName(path: string) {
  return path.split(/[\\/]/).pop() ?? path
}

export function buildComposerAttachment(path: string): ComposerAttachment {
  return {
    name: getComposerAttachmentName(path),
    path,
  }
}

export function getComposerAttachmentKind(path: string): ComposerAttachmentKind {
  const normalizedPath = path.trim().toLowerCase()
  const extension = normalizedPath.split(".").pop() ?? ""
  if (IMAGE_ATTACHMENT_EXTENSIONS.has(extension)) return "image"
  if (extension === "pdf") return "pdf"
  return "unsupported"
}

export function getComposerAttachmentCapabilities(model: ProviderModel | null): ComposerAttachmentCapabilities {
  return {
    image: Boolean(model?.capabilities.input.image),
    pdf: Boolean(model?.capabilities.attachment && model?.capabilities.input.pdf),
  }
}

export function isComposerAttachmentSupported(path: string, capabilities: ComposerAttachmentCapabilities) {
  const kind = getComposerAttachmentKind(path)
  if (kind === "image") return capabilities.image
  if (kind === "pdf") return capabilities.pdf
  return false
}

export function describeComposerAttachmentSupport(capabilities: ComposerAttachmentCapabilities) {
  if (capabilities.image && capabilities.pdf) return "images and PDFs"
  if (capabilities.image) return "images"
  if (capabilities.pdf) return "PDFs"
  return null
}

export function getComposerAttachmentDisabledReason(
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
  isLoading: boolean,
) {
  if (describeComposerAttachmentSupport(capabilities)) return null
  if (isLoading) return "Loading model capabilities..."
  if (!model) return "No available model for this project supports image or PDF input."
  return `${model.name} does not support image or PDF input.`
}

export function getComposerAttachmentError(
  attachmentPaths: string[],
  model: ProviderModel | null,
  capabilities: ComposerAttachmentCapabilities,
) {
  const unsupportedAttachments = attachmentPaths.filter((path) => !isComposerAttachmentSupported(path, capabilities))
  if (unsupportedAttachments.length === 0) return null

  const unsupportedKinds = new Set(unsupportedAttachments.map((path) => getComposerAttachmentKind(path)))
  if (unsupportedKinds.has("unsupported")) {
    return "Desktop composer attachments currently support images and PDFs only."
  }

  const supportedDescription = describeComposerAttachmentSupport(capabilities)
  if (!supportedDescription) {
    if (!model) return "Attachments are unavailable until a compatible model is available."
    return `${model.name} does not support image or PDF input. Remove attachments or switch models.`
  }

  return `${model?.name ?? "The current model"} only accepts ${supportedDescription}. Remove incompatible attachments or switch models.`
}
