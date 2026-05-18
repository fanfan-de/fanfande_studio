import type { PluginCatalogItem } from "./types"

export function pluginCatalogSignature(items: PluginCatalogItem[]) {
  return JSON.stringify(items)
}

export function arePluginCatalogsEqual(left: PluginCatalogItem[], right: PluginCatalogItem[]) {
  return pluginCatalogSignature(left) === pluginCatalogSignature(right)
}
