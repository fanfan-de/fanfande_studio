export const APP_LOCALES = ["zh-CN", "en-US"] as const

export type AppLocale = (typeof APP_LOCALES)[number]

export interface LocaleConfigDocument {
  version: 1
  locale: AppLocale
  updatedAt: number
}

export interface LocaleConfigSnapshot {
  path: string
  exists: boolean
  document: LocaleConfigDocument
}

export const DEFAULT_APP_LOCALE: AppLocale = "zh-CN"

const APP_LOCALE_SET = new Set<string>(APP_LOCALES)

export function isAppLocale(value: string): value is AppLocale {
  return APP_LOCALE_SET.has(value)
}

export function normalizeAppLocale(value: unknown): AppLocale {
  return typeof value === "string" && isAppLocale(value) ? value : DEFAULT_APP_LOCALE
}

export function createDefaultLocaleConfigDocument(): LocaleConfigDocument {
  return {
    version: 1,
    locale: DEFAULT_APP_LOCALE,
    updatedAt: 0,
  }
}

export function normalizeLocaleConfigDocument(input: unknown): LocaleConfigDocument {
  const defaults = createDefaultLocaleConfigDocument()
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaults
  }

  const partial = input as Partial<LocaleConfigDocument>
  const updatedAt = typeof partial.updatedAt === "number" && Number.isFinite(partial.updatedAt)
    ? partial.updatedAt
    : 0

  return {
    version: 1,
    locale: normalizeAppLocale(partial.locale),
    updatedAt,
  }
}
