import type { PreviewInteractionPluginID, PreviewInteractionRecord, ResolvedPreviewTarget } from "../../types"
import type { PreviewInteractionPlugin } from "./types"
import { isWebCommentInteraction, webCommentPlugin } from "./web-comment-plugin"

const PREVIEW_INTERACTION_PLUGINS: PreviewInteractionPlugin[] = [
  webCommentPlugin,
]

export function getPreviewInteractionPlugins(target: ResolvedPreviewTarget | null | undefined) {
  if (!target) return []
  return PREVIEW_INTERACTION_PLUGINS.filter((plugin) => plugin.appliesTo(target))
}

export function getPreviewInteractionPlugin(pluginID: PreviewInteractionPluginID | null | undefined) {
  if (!pluginID) return null
  return PREVIEW_INTERACTION_PLUGINS.find((plugin) => plugin.id === pluginID) ?? null
}

export function formatPreviewInteractionReferenceLabel(record: PreviewInteractionRecord, recordIndex: number) {
  return getPreviewInteractionPlugin(record.pluginID)?.formatRecordLabel(record, recordIndex) ?? `preview:${recordIndex}`
}

export function formatPreviewInteractionReferenceTitle(record: PreviewInteractionRecord) {
  return getPreviewInteractionPlugin(record.pluginID)?.formatRecordTitle(record) ?? record.snapshot?.title ?? record.targetKey
}

export function formatPreviewInteractionContext(records: PreviewInteractionRecord[], requestText: string) {
  const sections: string[] = []
  for (const plugin of PREVIEW_INTERACTION_PLUGINS) {
    const pluginRecords = records.filter((record) => record.pluginID === plugin.id)
    const section = plugin.formatContext(pluginRecords, requestText)
    if (section) sections.push(section)
  }
  return sections.join("\n\n").trim()
}

export function getPreviewInteractionPageUrl(record: PreviewInteractionRecord) {
  if (isWebCommentInteraction(record)) return record.payload.pageUrl
  return record.snapshot?.url ?? record.targetKey
}
