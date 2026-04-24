export type AppearanceColorMode = "system" | "light" | "dark"
export type AppearanceBrandTheme = "terra" | "sage"

export const APPEARANCE_TOKEN_GROUPS = [
  {
    id: "light-foundation",
    label: "Light Foundation",
    description: "Primary surfaces, text, and borders used in light mode.",
    tokens: [
      "surface-app-light",
      "surface-shell-light",
      "surface-panel-light",
      "surface-panel-muted-light",
      "surface-sidebar-light",
      "surface-sidebar-strong-light",
      "text-primary-light",
      "text-secondary-light",
      "text-tertiary-light",
      "border-default-light",
      "border-strong-light",
    ],
  },
  {
    id: "dark-foundation",
    label: "Dark Foundation",
    description: "Primary surfaces, text, and borders used in dark mode.",
    tokens: [
      "surface-app-dark",
      "surface-shell-dark",
      "surface-panel-dark",
      "surface-panel-muted-dark",
      "surface-sidebar-dark",
      "surface-sidebar-strong-dark",
      "text-primary-dark",
      "text-secondary-dark",
      "text-tertiary-dark",
      "border-default-dark",
      "border-strong-dark",
    ],
  },
  {
    id: "accent",
    label: "Accent States",
    description: "Interactive brand tones that drive button, hover, and active emphasis.",
    tokens: [
      "brand-primary",
      "brand-primary-hover",
      "brand-accent-highlight",
      "brand-primary-dark",
      "brand-primary-hover-dark",
      "brand-accent-highlight-dark",
    ],
  },
  {
    id: "code",
    label: "Code And Terminal",
    description: "Dedicated backgrounds for code blocks and terminal surfaces.",
    tokens: [
      "surface-code-light",
      "surface-code-strong-light",
      "surface-code-dark",
      "surface-code-strong-dark",
    ],
  },
  {
    id: "status",
    label: "Status Colors",
    description: "Semantic tones for success, warning, error, and info states.",
    tokens: [
      "semantic-success",
      "semantic-warning",
      "semantic-error",
      "semantic-info",
    ],
  },
] as const

export const APPEARANCE_TOKEN_NAMES = [
  "surface-app-light",
  "surface-shell-light",
  "surface-panel-light",
  "surface-panel-muted-light",
  "surface-sidebar-light",
  "surface-sidebar-strong-light",
  "text-primary-light",
  "text-secondary-light",
  "text-tertiary-light",
  "border-default-light",
  "border-strong-light",
  "surface-app-dark",
  "surface-shell-dark",
  "surface-panel-dark",
  "surface-panel-muted-dark",
  "surface-sidebar-dark",
  "surface-sidebar-strong-dark",
  "text-primary-dark",
  "text-secondary-dark",
  "text-tertiary-dark",
  "border-default-dark",
  "border-strong-dark",
  "brand-primary",
  "brand-primary-hover",
  "brand-accent-highlight",
  "brand-primary-dark",
  "brand-primary-hover-dark",
  "brand-accent-highlight-dark",
  "surface-code-light",
  "surface-code-strong-light",
  "surface-code-dark",
  "surface-code-strong-dark",
  "semantic-success",
  "semantic-warning",
  "semantic-error",
  "semantic-info",
] as const

export type AppearanceTokenName = (typeof APPEARANCE_TOKEN_NAMES)[number]

export type AppearanceTokenMap = Partial<Record<AppearanceTokenName, string>>

export interface AppearanceConfigDocument {
  version: 1
  brandTheme: AppearanceBrandTheme
  colorMode: AppearanceColorMode
  overrides: AppearanceTokenMap
  resolvedTokens: AppearanceTokenMap
  updatedAt: number
}

export interface AppearanceConfigSnapshot {
  path: string
  exists: boolean
  document: AppearanceConfigDocument
}

type AppearanceTokenMetadata = {
  label: string
  description: string
}

export const APPEARANCE_TOKEN_METADATA: Record<AppearanceTokenName, AppearanceTokenMetadata> = {
  "surface-app-light": {
    label: "App Background",
    description: "The farthest canvas background in light mode.",
  },
  "surface-shell-light": {
    label: "Shell Background",
    description: "Main chrome and shell containers in light mode.",
  },
  "surface-panel-light": {
    label: "Panel Surface",
    description: "Primary cards and panel bodies in light mode.",
  },
  "surface-panel-muted-light": {
    label: "Muted Panel",
    description: "Secondary panel fills in light mode.",
  },
  "surface-sidebar-light": {
    label: "Sidebar Surface",
    description: "Left and right sidebar backgrounds in light mode.",
  },
  "surface-sidebar-strong-light": {
    label: "Sidebar Strong",
    description: "Stronger sidebar accents and selected rails in light mode.",
  },
  "text-primary-light": {
    label: "Primary Text",
    description: "Highest-emphasis copy in light mode.",
  },
  "text-secondary-light": {
    label: "Secondary Text",
    description: "Supporting copy and labels in light mode.",
  },
  "text-tertiary-light": {
    label: "Muted Text",
    description: "Low-emphasis helper text in light mode.",
  },
  "border-default-light": {
    label: "Default Border",
    description: "Standard border color in light mode.",
  },
  "border-strong-light": {
    label: "Strong Border",
    description: "Higher-emphasis borders in light mode.",
  },
  "surface-app-dark": {
    label: "App Background",
    description: "The farthest canvas background in dark mode.",
  },
  "surface-shell-dark": {
    label: "Shell Background",
    description: "Main chrome and shell containers in dark mode.",
  },
  "surface-panel-dark": {
    label: "Panel Surface",
    description: "Primary cards and panel bodies in dark mode.",
  },
  "surface-panel-muted-dark": {
    label: "Muted Panel",
    description: "Secondary panel fills in dark mode.",
  },
  "surface-sidebar-dark": {
    label: "Sidebar Surface",
    description: "Left and right sidebar backgrounds in dark mode.",
  },
  "surface-sidebar-strong-dark": {
    label: "Sidebar Strong",
    description: "Stronger sidebar accents and selected rails in dark mode.",
  },
  "text-primary-dark": {
    label: "Primary Text",
    description: "Highest-emphasis copy in dark mode.",
  },
  "text-secondary-dark": {
    label: "Secondary Text",
    description: "Supporting copy and labels in dark mode.",
  },
  "text-tertiary-dark": {
    label: "Muted Text",
    description: "Low-emphasis helper text in dark mode.",
  },
  "border-default-dark": {
    label: "Default Border",
    description: "Standard border color in dark mode.",
  },
  "border-strong-dark": {
    label: "Strong Border",
    description: "Higher-emphasis borders in dark mode.",
  },
  "brand-primary": {
    label: "Accent Base",
    description: "Primary accent in light mode.",
  },
  "brand-primary-hover": {
    label: "Accent Hover",
    description: "Accent hover color in light mode.",
  },
  "brand-accent-highlight": {
    label: "Accent Active",
    description: "Accent active and highlight tone in light mode.",
  },
  "brand-primary-dark": {
    label: "Accent Base",
    description: "Primary accent in dark mode.",
  },
  "brand-primary-hover-dark": {
    label: "Accent Hover",
    description: "Accent hover color in dark mode.",
  },
  "brand-accent-highlight-dark": {
    label: "Accent Active",
    description: "Accent active and highlight tone in dark mode.",
  },
  "surface-code-light": {
    label: "Code Surface",
    description: "Light-mode background for code blocks and terminals.",
  },
  "surface-code-strong-light": {
    label: "Code Surface Strong",
    description: "Deeper light-mode background for code emphasis.",
  },
  "surface-code-dark": {
    label: "Code Surface",
    description: "Dark-mode background for code blocks and terminals.",
  },
  "surface-code-strong-dark": {
    label: "Code Surface Strong",
    description: "Deeper dark-mode background for code emphasis.",
  },
  "semantic-success": {
    label: "Success",
    description: "Success badges and affirmative feedback.",
  },
  "semantic-warning": {
    label: "Warning",
    description: "Warning badges and cautionary feedback.",
  },
  "semantic-error": {
    label: "Error",
    description: "Danger actions and error feedback.",
  },
  "semantic-info": {
    label: "Info",
    description: "Informational accents and status markers.",
  },
}

const APPEARANCE_TOKEN_NAME_SET = new Set<string>(APPEARANCE_TOKEN_NAMES)

export function isAppearanceTokenName(value: string): value is AppearanceTokenName {
  return APPEARANCE_TOKEN_NAME_SET.has(value)
}

export function createDefaultAppearanceConfigDocument(): AppearanceConfigDocument {
  return {
    version: 1,
    brandTheme: "terra",
    colorMode: "system",
    overrides: {},
    resolvedTokens: {},
    updatedAt: 0,
  }
}

function normalizeAppearanceTokenMap(input: unknown): AppearanceTokenMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }

  const normalizedEntries = Object.entries(input).flatMap(([key, value]) => {
    if (!isAppearanceTokenName(key)) return []
    if (typeof value !== "string") return []

    const trimmed = value.trim()
    if (!trimmed) return []

    return [[key, trimmed] as const]
  })

  return Object.fromEntries(normalizedEntries)
}

export function normalizeAppearanceConfigDocument(input: unknown): AppearanceConfigDocument {
  const defaults = createDefaultAppearanceConfigDocument()
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return defaults
  }

  const partial = input as Partial<AppearanceConfigDocument>
  const brandTheme = partial.brandTheme === "sage" ? "sage" : "terra"
  const colorMode =
    partial.colorMode === "light" || partial.colorMode === "dark" || partial.colorMode === "system"
      ? partial.colorMode
      : "system"
  const updatedAt = typeof partial.updatedAt === "number" && Number.isFinite(partial.updatedAt)
    ? partial.updatedAt
    : 0

  return {
    version: 1,
    brandTheme,
    colorMode,
    overrides: normalizeAppearanceTokenMap(partial.overrides),
    resolvedTokens: normalizeAppearanceTokenMap(partial.resolvedTokens),
    updatedAt,
  }
}
