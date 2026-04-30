export type AppearanceColorMode = "system" | "light" | "dark"
export type AppearanceBrandTheme = "terra" | "sage"

export const APPEARANCE_TOKEN_NAMES = [
  "surface-app-light",
  "surface-app-dark",
  "surface-shell-light",
  "surface-shell-dark",
  "surface-panel-light",
  "surface-panel-dark",
  "surface-panel-muted-light",
  "surface-panel-muted-dark",
  "surface-sidebar-light",
  "surface-sidebar-dark",
  "surface-sidebar-strong-light",
  "surface-sidebar-strong-dark",
  "surface-user-bubble-light",
  "surface-user-bubble-dark",
  "surface-trace-light",
  "surface-trace-dark",
  "surface-elevated-light",
  "surface-elevated-dark",
  "surface-overlay-light",
  "surface-overlay-dark",
  "surface-code-light",
  "surface-code-dark",
  "surface-code-strong-light",
  "surface-code-strong-dark",
  "text-primary-light",
  "text-primary-dark",
  "text-secondary-light",
  "text-secondary-dark",
  "text-tertiary-light",
  "text-tertiary-dark",
  "text-on-dark-light",
  "text-on-dark-dark",
  "border-subtle-light",
  "border-subtle-dark",
  "border-default-light",
  "border-default-dark",
  "brand-primary",
  "brand-primary-dark",
  "brand-primary-hover",
  "brand-primary-hover-dark",
  "brand-accent-highlight",
  "brand-accent-highlight-dark",
  "brand-primary-soft",
  "brand-primary-soft-dark",
  "brand-primary-soft-strong",
  "brand-primary-soft-strong-dark",
  "semantic-accent-icon-light",
  "semantic-accent-icon-dark",
  "semantic-accent-icon-hover-light",
  "semantic-accent-icon-hover-dark",
  "semantic-accent-icon-active-light",
  "semantic-accent-icon-active-dark",
  "semantic-success-light",
  "semantic-success-dark",
  "semantic-success-strong-light",
  "semantic-success-strong-dark",
  "semantic-success-text-light",
  "semantic-success-text-dark",
  "semantic-success-border-light",
  "semantic-success-border-dark",
  "semantic-success-surface-light",
  "semantic-success-surface-dark",
  "semantic-success-surface-strong-light",
  "semantic-success-surface-strong-dark",
  "semantic-warning-light",
  "semantic-warning-dark",
  "semantic-warning-strong-light",
  "semantic-warning-strong-dark",
  "semantic-warning-text-light",
  "semantic-warning-text-dark",
  "semantic-warning-border-light",
  "semantic-warning-border-dark",
  "semantic-warning-surface-light",
  "semantic-warning-surface-dark",
  "semantic-warning-surface-strong-light",
  "semantic-warning-surface-strong-dark",
  "semantic-error-light",
  "semantic-error-dark",
  "semantic-error-strong-light",
  "semantic-error-strong-dark",
  "semantic-error-text-light",
  "semantic-error-text-dark",
  "semantic-error-border-light",
  "semantic-error-border-dark",
  "semantic-error-surface-light",
  "semantic-error-surface-dark",
  "semantic-error-surface-strong-light",
  "semantic-error-surface-strong-dark",
  "semantic-info-light",
  "semantic-info-dark",
  "semantic-info-strong-light",
  "semantic-info-strong-dark",
  "semantic-info-text-light",
  "semantic-info-text-dark",
  "semantic-info-border-light",
  "semantic-info-border-dark",
  "semantic-info-surface-light",
  "semantic-info-surface-dark",
  "semantic-info-surface-strong-light",
  "semantic-info-surface-strong-dark",
  "semantic-pane-tab-bar-surface-light",
  "semantic-pane-tab-bar-surface-dark",
  "semantic-left-sidebar-top-menu-surface-light",
  "semantic-left-sidebar-top-menu-surface-dark",
  "semantic-right-sidebar-top-menu-surface-light",
  "semantic-right-sidebar-top-menu-surface-dark",
  "semantic-question-card-surface-light",
  "semantic-question-card-surface-dark",
  "semantic-sidebar-tree-row-text-light",
  "semantic-sidebar-tree-row-text-dark",
  "semantic-sidebar-tree-row-text-hover-light",
  "semantic-sidebar-tree-row-text-hover-dark",
  "semantic-sidebar-tree-row-text-active-light",
  "semantic-sidebar-tree-row-text-active-dark",
  "semantic-sidebar-tree-row-surface-hover-light",
  "semantic-sidebar-tree-row-surface-hover-dark",
  "semantic-sidebar-tree-row-surface-active-light",
  "semantic-sidebar-tree-row-surface-active-dark",
  "semantic-sidebar-tree-row-leading-active-light",
  "semantic-sidebar-tree-row-leading-active-dark",
  "semantic-composer-surface-light",
  "semantic-composer-surface-dark",
  "semantic-dropdown-menu-surface-light",
  "semantic-dropdown-menu-surface-dark",
  "semantic-composer-button-surface-light",
  "semantic-composer-button-surface-dark",
  "semantic-composer-button-surface-strong-light",
  "semantic-composer-button-surface-strong-dark",
  "semantic-composer-button-text-light",
  "semantic-composer-button-text-dark",
  "semantic-composer-button-text-strong-light",
  "semantic-composer-button-text-strong-dark",
  "focus-outline-color-light",
  "focus-outline-color-dark",
  "selection-background-light",
  "selection-background-dark",
  "ui-panel-light",
  "ui-panel-dark",
  "ui-panel-subtle-light",
  "ui-panel-subtle-dark",
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

export interface AppearanceTokenRow {
  id: string
  label: string
  description: string
  lightToken: AppearanceTokenName
  darkToken: AppearanceTokenName
}

export interface AppearanceTokenGroup {
  id: string
  label: string
  description: string
  rows: readonly AppearanceTokenRow[]
}

export const APPEARANCE_TOKEN_GROUPS = [
  {
    id: "foundation-surfaces",
    label: "Foundation / Surfaces",
    description: "Primary app, shell, panel, sidebar, trace, overlay, and code surfaces.",
    rows: [
      {
        id: "surface-app",
        label: "App Background",
        description: "The farthest canvas background.",
        lightToken: "surface-app-light",
        darkToken: "surface-app-dark",
      },
      {
        id: "surface-shell",
        label: "Shell Background",
        description: "Main chrome and shell containers.",
        lightToken: "surface-shell-light",
        darkToken: "surface-shell-dark",
      },
      {
        id: "surface-panel",
        label: "Panel Surface",
        description: "Primary cards and panel bodies.",
        lightToken: "surface-panel-light",
        darkToken: "surface-panel-dark",
      },
      {
        id: "surface-panel-muted",
        label: "Muted Panel",
        description: "Secondary panel fills and low-emphasis rows.",
        lightToken: "surface-panel-muted-light",
        darkToken: "surface-panel-muted-dark",
      },
      {
        id: "surface-sidebar",
        label: "Sidebar Surface",
        description: "Left and right sidebar backgrounds.",
        lightToken: "surface-sidebar-light",
        darkToken: "surface-sidebar-dark",
      },
      {
        id: "surface-sidebar-strong",
        label: "Sidebar Strong",
        description: "Stronger sidebar accents and selected rails.",
        lightToken: "surface-sidebar-strong-light",
        darkToken: "surface-sidebar-strong-dark",
      },
      {
        id: "surface-user-bubble",
        label: "User Bubble",
        description: "User message bubble background.",
        lightToken: "surface-user-bubble-light",
        darkToken: "surface-user-bubble-dark",
      },
      {
        id: "surface-trace",
        label: "Trace Surface",
        description: "Trace and tool-call background surface.",
        lightToken: "surface-trace-light",
        darkToken: "surface-trace-dark",
      },
      {
        id: "surface-elevated",
        label: "Elevated Surface",
        description: "Floating panels, menus, and elevated sheets.",
        lightToken: "surface-elevated-light",
        darkToken: "surface-elevated-dark",
      },
      {
        id: "surface-overlay",
        label: "Overlay",
        description: "Modal and drag-overlay scrims.",
        lightToken: "surface-overlay-light",
        darkToken: "surface-overlay-dark",
      },
      {
        id: "surface-code",
        label: "Code Surface",
        description: "Code block and terminal background.",
        lightToken: "surface-code-light",
        darkToken: "surface-code-dark",
      },
      {
        id: "surface-code-strong",
        label: "Code Surface Strong",
        description: "Deeper code and terminal emphasis surface.",
        lightToken: "surface-code-strong-light",
        darkToken: "surface-code-strong-dark",
      },
    ],
  },
  {
    id: "foundation-content",
    label: "Foundation / Content",
    description: "Text and border tokens that define the base contrast system.",
    rows: [
      {
        id: "text-primary",
        label: "Primary Text",
        description: "Highest-emphasis copy.",
        lightToken: "text-primary-light",
        darkToken: "text-primary-dark",
      },
      {
        id: "text-secondary",
        label: "Secondary Text",
        description: "Supporting copy and labels.",
        lightToken: "text-secondary-light",
        darkToken: "text-secondary-dark",
      },
      {
        id: "text-tertiary",
        label: "Muted Text",
        description: "Low-emphasis helper text.",
        lightToken: "text-tertiary-light",
        darkToken: "text-tertiary-dark",
      },
      {
        id: "text-on-dark",
        label: "Text On Dark",
        description: "Text placed on dark or brand-heavy fills.",
        lightToken: "text-on-dark-light",
        darkToken: "text-on-dark-dark",
      },
      {
        id: "border-subtle",
        label: "Subtle Border",
        description: "Low-emphasis separators.",
        lightToken: "border-subtle-light",
        darkToken: "border-subtle-dark",
      },
      {
        id: "border-default",
        label: "Default Border",
        description: "Standard border color.",
        lightToken: "border-default-light",
        darkToken: "border-default-dark",
      },
    ],
  },
  {
    id: "accent",
    label: "Accent States",
    description: "Interactive brand tones that drive button, hover, and active emphasis.",
    rows: [
      {
        id: "brand-primary",
        label: "Accent Base",
        description: "Primary accent color.",
        lightToken: "brand-primary",
        darkToken: "brand-primary-dark",
      },
      {
        id: "brand-primary-hover",
        label: "Accent Hover",
        description: "Hover and stronger accent color.",
        lightToken: "brand-primary-hover",
        darkToken: "brand-primary-hover-dark",
      },
      {
        id: "brand-accent-highlight",
        label: "Accent Active",
        description: "Active and highlight tone.",
        lightToken: "brand-accent-highlight",
        darkToken: "brand-accent-highlight-dark",
      },
      {
        id: "semantic-accent-icon",
        label: "Icon Rest",
        description: "Default icon color for accent-driven icon buttons.",
        lightToken: "semantic-accent-icon-light",
        darkToken: "semantic-accent-icon-dark",
      },
      {
        id: "semantic-accent-icon-hover",
        label: "Icon Hover",
        description: "Hover and focus icon color for accent-driven icon buttons.",
        lightToken: "semantic-accent-icon-hover-light",
        darkToken: "semantic-accent-icon-hover-dark",
      },
      {
        id: "semantic-accent-icon-active",
        label: "Icon Active",
        description: "Selected and active icon color for accent-driven icon buttons.",
        lightToken: "semantic-accent-icon-active-light",
        darkToken: "semantic-accent-icon-active-dark",
      },
      {
        id: "brand-primary-soft",
        label: "Accent Soft",
        description: "Soft accent surface used behind active controls.",
        lightToken: "brand-primary-soft",
        darkToken: "brand-primary-soft-dark",
      },
      {
        id: "brand-primary-soft-strong",
        label: "Accent Soft Strong",
        description: "Stronger soft accent surface.",
        lightToken: "brand-primary-soft-strong",
        darkToken: "brand-primary-soft-strong-dark",
      },
    ],
  },
  {
    id: "status-success",
    label: "Status / Success",
    description: "Success tones from base hue to text, border, and surface treatments.",
    rows: [
      {
        id: "semantic-success",
        label: "Base",
        description: "Primary success hue.",
        lightToken: "semantic-success-light",
        darkToken: "semantic-success-dark",
      },
      {
        id: "semantic-success-strong",
        label: "Strong",
        description: "Higher-emphasis success accent.",
        lightToken: "semantic-success-strong-light",
        darkToken: "semantic-success-strong-dark",
      },
      {
        id: "semantic-success-text",
        label: "Text",
        description: "Success text and icons on neutral surfaces.",
        lightToken: "semantic-success-text-light",
        darkToken: "semantic-success-text-dark",
      },
      {
        id: "semantic-success-border",
        label: "Border",
        description: "Success outlines and separators.",
        lightToken: "semantic-success-border-light",
        darkToken: "semantic-success-border-dark",
      },
      {
        id: "semantic-success-surface",
        label: "Surface",
        description: "Soft success fill.",
        lightToken: "semantic-success-surface-light",
        darkToken: "semantic-success-surface-dark",
      },
      {
        id: "semantic-success-surface-strong",
        label: "Surface Strong",
        description: "Stronger success fill.",
        lightToken: "semantic-success-surface-strong-light",
        darkToken: "semantic-success-surface-strong-dark",
      },
    ],
  },
  {
    id: "status-warning",
    label: "Status / Warning",
    description: "Warning tones from base hue to text, border, and surface treatments.",
    rows: [
      {
        id: "semantic-warning",
        label: "Base",
        description: "Primary warning hue.",
        lightToken: "semantic-warning-light",
        darkToken: "semantic-warning-dark",
      },
      {
        id: "semantic-warning-strong",
        label: "Strong",
        description: "Higher-emphasis warning accent.",
        lightToken: "semantic-warning-strong-light",
        darkToken: "semantic-warning-strong-dark",
      },
      {
        id: "semantic-warning-text",
        label: "Text",
        description: "Warning text and icons on neutral surfaces.",
        lightToken: "semantic-warning-text-light",
        darkToken: "semantic-warning-text-dark",
      },
      {
        id: "semantic-warning-border",
        label: "Border",
        description: "Warning outlines and separators.",
        lightToken: "semantic-warning-border-light",
        darkToken: "semantic-warning-border-dark",
      },
      {
        id: "semantic-warning-surface",
        label: "Surface",
        description: "Soft warning fill.",
        lightToken: "semantic-warning-surface-light",
        darkToken: "semantic-warning-surface-dark",
      },
      {
        id: "semantic-warning-surface-strong",
        label: "Surface Strong",
        description: "Stronger warning fill.",
        lightToken: "semantic-warning-surface-strong-light",
        darkToken: "semantic-warning-surface-strong-dark",
      },
    ],
  },
  {
    id: "status-error",
    label: "Status / Error",
    description: "Error tones from base hue to text, border, and surface treatments.",
    rows: [
      {
        id: "semantic-error",
        label: "Base",
        description: "Primary error hue.",
        lightToken: "semantic-error-light",
        darkToken: "semantic-error-dark",
      },
      {
        id: "semantic-error-strong",
        label: "Strong",
        description: "Higher-emphasis error accent.",
        lightToken: "semantic-error-strong-light",
        darkToken: "semantic-error-strong-dark",
      },
      {
        id: "semantic-error-text",
        label: "Text",
        description: "Error text and icons on neutral surfaces.",
        lightToken: "semantic-error-text-light",
        darkToken: "semantic-error-text-dark",
      },
      {
        id: "semantic-error-border",
        label: "Border",
        description: "Error outlines and separators.",
        lightToken: "semantic-error-border-light",
        darkToken: "semantic-error-border-dark",
      },
      {
        id: "semantic-error-surface",
        label: "Surface",
        description: "Soft error fill.",
        lightToken: "semantic-error-surface-light",
        darkToken: "semantic-error-surface-dark",
      },
      {
        id: "semantic-error-surface-strong",
        label: "Surface Strong",
        description: "Stronger error fill.",
        lightToken: "semantic-error-surface-strong-light",
        darkToken: "semantic-error-surface-strong-dark",
      },
    ],
  },
  {
    id: "status-info",
    label: "Status / Info",
    description: "Informational tones from base hue to text, border, and surface treatments.",
    rows: [
      {
        id: "semantic-info",
        label: "Base",
        description: "Primary info hue.",
        lightToken: "semantic-info-light",
        darkToken: "semantic-info-dark",
      },
      {
        id: "semantic-info-strong",
        label: "Strong",
        description: "Higher-emphasis informational accent.",
        lightToken: "semantic-info-strong-light",
        darkToken: "semantic-info-strong-dark",
      },
      {
        id: "semantic-info-text",
        label: "Text",
        description: "Informational text and icons on neutral surfaces.",
        lightToken: "semantic-info-text-light",
        darkToken: "semantic-info-text-dark",
      },
      {
        id: "semantic-info-border",
        label: "Border",
        description: "Informational outlines and separators.",
        lightToken: "semantic-info-border-light",
        darkToken: "semantic-info-border-dark",
      },
      {
        id: "semantic-info-surface",
        label: "Surface",
        description: "Soft informational fill.",
        lightToken: "semantic-info-surface-light",
        darkToken: "semantic-info-surface-dark",
      },
      {
        id: "semantic-info-surface-strong",
        label: "Surface Strong",
        description: "Stronger informational fill.",
        lightToken: "semantic-info-surface-strong-light",
        darkToken: "semantic-info-surface-strong-dark",
      },
    ],
  },
  {
    id: "component-shell-chrome",
    label: "Shell Chrome",
    description: "Dedicated semantic surfaces for shell-level navigation and menu bars.",
    rows: [
      {
        id: "semantic-pane-tab-bar-surface",
        label: "Pane Tab Bar Surface",
        description: "Background fill for the workbench pane tab bar.",
        lightToken: "semantic-pane-tab-bar-surface-light",
        darkToken: "semantic-pane-tab-bar-surface-dark",
      },
      {
        id: "semantic-left-sidebar-top-menu-surface",
        label: "Left Sidebar Top Menu Surface",
        description: "Background fill for the left sidebar top menu.",
        lightToken: "semantic-left-sidebar-top-menu-surface-light",
        darkToken: "semantic-left-sidebar-top-menu-surface-dark",
      },
      {
        id: "semantic-right-sidebar-top-menu-surface",
        label: "Right Sidebar Top Menu Surface",
        description: "Background fill for the right sidebar top menu.",
        lightToken: "semantic-right-sidebar-top-menu-surface-light",
        darkToken: "semantic-right-sidebar-top-menu-surface-dark",
      },
    ],
  },
  {
    id: "component-dropdown-select",
    label: "Dropdown Select",
    description: "Dedicated semantic color for expanded dropdown and select menus.",
    rows: [
      {
        id: "semantic-dropdown-menu-surface",
        label: "Menu Surface",
        description: "Background fill for expanded dropdown and select menus.",
        lightToken: "semantic-dropdown-menu-surface-light",
        darkToken: "semantic-dropdown-menu-surface-dark",
      },
    ],
  },
  {
    id: "component-question-card",
    label: "Question Card",
    description: "Dedicated semantic color for agent question cards.",
    rows: [
      {
        id: "semantic-question-card-surface",
        label: "Surface",
        description: "Background fill for question cards shown by the agent.",
        lightToken: "semantic-question-card-surface-light",
        darkToken: "semantic-question-card-surface-dark",
      },
    ],
  },
  {
    id: "component-sidebar-tree-rows",
    label: "Sidebar Tree Rows",
    description: "Dedicated row tokens for the left sidebar workspace and skills trees.",
    rows: [
      {
        id: "semantic-sidebar-tree-row-text",
        label: "Row Text",
        description: "Default text and icon color for sidebar tree rows.",
        lightToken: "semantic-sidebar-tree-row-text-light",
        darkToken: "semantic-sidebar-tree-row-text-dark",
      },
      {
        id: "semantic-sidebar-tree-row-text-hover",
        label: "Row Text Hover",
        description: "Hover and focus text color for sidebar tree rows.",
        lightToken: "semantic-sidebar-tree-row-text-hover-light",
        darkToken: "semantic-sidebar-tree-row-text-hover-dark",
      },
      {
        id: "semantic-sidebar-tree-row-text-active",
        label: "Row Text Active",
        description: "Selected-row text color for sidebar tree rows.",
        lightToken: "semantic-sidebar-tree-row-text-active-light",
        darkToken: "semantic-sidebar-tree-row-text-active-dark",
      },
      {
        id: "semantic-sidebar-tree-row-surface-hover",
        label: "Row Surface Hover",
        description: "Hover and focus background for sidebar tree rows.",
        lightToken: "semantic-sidebar-tree-row-surface-hover-light",
        darkToken: "semantic-sidebar-tree-row-surface-hover-dark",
      },
      {
        id: "semantic-sidebar-tree-row-surface-active",
        label: "Row Surface Active",
        description: "Selected-row background for sidebar tree rows.",
        lightToken: "semantic-sidebar-tree-row-surface-active-light",
        darkToken: "semantic-sidebar-tree-row-surface-active-dark",
      },
      {
        id: "semantic-sidebar-tree-row-leading-active",
        label: "Leading Icon Active",
        description: "Selected-row leading icon color for sidebar project rows.",
        lightToken: "semantic-sidebar-tree-row-leading-active-light",
        darkToken: "semantic-sidebar-tree-row-leading-active-dark",
      },
    ],
  },
  {
    id: "component-composer",
    label: "Composer",
    description: "Dedicated semantic colors for the task composer surface and controls.",
    rows: [
      {
        id: "semantic-composer-surface",
        label: "Composer Surface",
        description: "Dedicated background fill for composer input surfaces.",
        lightToken: "semantic-composer-surface-light",
        darkToken: "semantic-composer-surface-dark",
      },
      {
        id: "semantic-composer-button-surface",
        label: "Button Surface",
        description: "Hover fill for buttons inside the composer.",
        lightToken: "semantic-composer-button-surface-light",
        darkToken: "semantic-composer-button-surface-dark",
      },
      {
        id: "semantic-composer-button-surface-strong",
        label: "Button Surface Strong",
        description: "Selected-state fill for menus and controls inside the composer.",
        lightToken: "semantic-composer-button-surface-strong-light",
        darkToken: "semantic-composer-button-surface-strong-dark",
      },
      {
        id: "semantic-composer-button-text",
        label: "Button Text",
        description: "Hover text and icon color for buttons inside the composer.",
        lightToken: "semantic-composer-button-text-light",
        darkToken: "semantic-composer-button-text-dark",
      },
      {
        id: "semantic-composer-button-text-strong",
        label: "Button Text Strong",
        description: "Selected-state text and icon color for buttons inside the composer.",
        lightToken: "semantic-composer-button-text-strong-light",
        darkToken: "semantic-composer-button-text-strong-dark",
      },
    ],
  },
  {
    id: "global-interaction",
    label: "Global Interaction",
    description: "Focus, selection, and translucent panel tokens used across multiple components.",
    rows: [
      {
        id: "focus-outline-color",
        label: "Focus Ring",
        description: "Global focus outline color.",
        lightToken: "focus-outline-color-light",
        darkToken: "focus-outline-color-dark",
      },
      {
        id: "selection-background",
        label: "Selection Background",
        description: "Text selection and lightweight selection fill.",
        lightToken: "selection-background-light",
        darkToken: "selection-background-dark",
      },
      {
        id: "ui-panel",
        label: "Translucent Panel",
        description: "Default translucent panel fill.",
        lightToken: "ui-panel-light",
        darkToken: "ui-panel-dark",
      },
      {
        id: "ui-panel-subtle",
        label: "Translucent Panel Subtle",
        description: "Lower-emphasis translucent panel fill.",
        lightToken: "ui-panel-subtle-light",
        darkToken: "ui-panel-subtle-dark",
      },
    ],
  },
] as const satisfies readonly AppearanceTokenGroup[]

type AppearanceTokenMetadata = {
  label: string
  description: string
  rowID: string
  mode: "light" | "dark"
}

export const APPEARANCE_TOKEN_METADATA = Object.fromEntries(
  APPEARANCE_TOKEN_GROUPS.flatMap((group) =>
    group.rows.flatMap((row) => [
      [
        row.lightToken,
        {
          label: row.label,
          description: row.description,
          rowID: row.id,
          mode: "light" as const,
        },
      ],
      [
        row.darkToken,
        {
          label: row.label,
          description: row.description,
          rowID: row.id,
          mode: "dark" as const,
        },
      ],
    ]),
  ),
) as Record<AppearanceTokenName, AppearanceTokenMetadata>

const APPEARANCE_TOKEN_NAME_SET = new Set<string>(APPEARANCE_TOKEN_NAMES)

const LEGACY_APPEARANCE_TOKEN_MIGRATIONS: Record<string, readonly AppearanceTokenName[]> = {
  "semantic-accent-icon": ["semantic-accent-icon-light", "semantic-accent-icon-dark"],
  "semantic-accent-icon-hover": ["semantic-accent-icon-hover-light", "semantic-accent-icon-hover-dark"],
  "semantic-accent-icon-active": ["semantic-accent-icon-active-light", "semantic-accent-icon-active-dark"],
  "semantic-success": ["semantic-success-light", "semantic-success-dark"],
  "semantic-success-strong": ["semantic-success-strong-light", "semantic-success-strong-dark"],
  "semantic-success-text": ["semantic-success-text-light", "semantic-success-text-dark"],
  "semantic-success-border": ["semantic-success-border-light", "semantic-success-border-dark"],
  "semantic-success-surface": ["semantic-success-surface-light", "semantic-success-surface-dark"],
  "semantic-success-surface-strong": [
    "semantic-success-surface-strong-light",
    "semantic-success-surface-strong-dark",
  ],
  "semantic-warning": ["semantic-warning-light", "semantic-warning-dark"],
  "semantic-warning-strong": ["semantic-warning-strong-light", "semantic-warning-strong-dark"],
  "semantic-warning-text": ["semantic-warning-text-light", "semantic-warning-text-dark"],
  "semantic-warning-border": ["semantic-warning-border-light", "semantic-warning-border-dark"],
  "semantic-warning-surface": ["semantic-warning-surface-light", "semantic-warning-surface-dark"],
  "semantic-warning-surface-strong": [
    "semantic-warning-surface-strong-light",
    "semantic-warning-surface-strong-dark",
  ],
  "semantic-error": ["semantic-error-light", "semantic-error-dark"],
  "semantic-error-strong": ["semantic-error-strong-light", "semantic-error-strong-dark"],
  "semantic-error-text": ["semantic-error-text-light", "semantic-error-text-dark"],
  "semantic-error-border": ["semantic-error-border-light", "semantic-error-border-dark"],
  "semantic-error-surface": ["semantic-error-surface-light", "semantic-error-surface-dark"],
  "semantic-error-surface-strong": ["semantic-error-surface-strong-light", "semantic-error-surface-strong-dark"],
  "semantic-info": ["semantic-info-light", "semantic-info-dark"],
  "semantic-info-strong": ["semantic-info-strong-light", "semantic-info-strong-dark"],
  "semantic-info-text": ["semantic-info-text-light", "semantic-info-text-dark"],
  "semantic-info-border": ["semantic-info-border-light", "semantic-info-border-dark"],
  "semantic-info-surface": ["semantic-info-surface-light", "semantic-info-surface-dark"],
  "semantic-info-surface-strong": ["semantic-info-surface-strong-light", "semantic-info-surface-strong-dark"],
  "semantic-composer-surface": ["semantic-composer-surface-light", "semantic-composer-surface-dark"],
  "semantic-dropdown-menu-surface": [
    "semantic-dropdown-menu-surface-light",
    "semantic-dropdown-menu-surface-dark",
  ],
  "semantic-question-card-surface": [
    "semantic-question-card-surface-light",
    "semantic-question-card-surface-dark",
  ],
  "semantic-composer-button-surface": [
    "semantic-composer-button-surface-light",
    "semantic-composer-button-surface-dark",
  ],
  "semantic-composer-button-surface-strong": [
    "semantic-composer-button-surface-strong-light",
    "semantic-composer-button-surface-strong-dark",
  ],
  "semantic-composer-button-text": ["semantic-composer-button-text-light", "semantic-composer-button-text-dark"],
  "semantic-composer-button-text-strong": [
    "semantic-composer-button-text-strong-light",
    "semantic-composer-button-text-strong-dark",
  ],
}

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

function normalizeAppearanceColorTokenValue(value: unknown) {
  if (typeof value !== "string") return null

  const trimmed = value.trim()
  return trimmed || null
}

function normalizeAppearanceTokenMap(input: unknown): AppearanceTokenMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {}
  }

  const normalized: AppearanceTokenMap = {}

  for (const [key, value] of Object.entries(input)) {
    if (!isAppearanceTokenName(key)) continue

    const trimmed = normalizeAppearanceColorTokenValue(value)
    if (trimmed) {
      normalized[key] = trimmed
    }
  }

  for (const [key, value] of Object.entries(input)) {
    if (isAppearanceTokenName(key)) continue

    const migratedTokenNames = LEGACY_APPEARANCE_TOKEN_MIGRATIONS[key]
    if (!migratedTokenNames) continue

    const trimmed = normalizeAppearanceColorTokenValue(value)
    if (!trimmed) continue

    for (const tokenName of migratedTokenNames) {
      normalized[tokenName] ??= trimmed
    }
  }

  return normalized
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
