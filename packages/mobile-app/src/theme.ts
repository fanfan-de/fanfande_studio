const statusColors = {
  neutral: {
    background: "#ffffff",
    border: "#e5e3dc",
    text: "#4d4d49",
  },
  success: {
    background: "#edf8ef",
    border: "rgba(21, 92, 52, 0.2)",
    text: "#155c34",
  },
  danger: {
    background: "#fff0f0",
    border: "rgba(143, 31, 31, 0.2)",
    text: "#8f1f1f",
  },
} as const

export type ThemeTone = keyof typeof statusColors

export const theme = {
  colors: {
    canvas: "#f7f7f4",
    surface: "#ffffff",
    surfaceSubtle: "#f1f1ed",
    border: "#e5e3dc",
    borderStrong: "#deded8",
    text: "#151515",
    textInverted: "#ffffff",
    textMuted: "#676760",
    textSubtle: "#4d4d49",
    textPlaceholder: "#8b8b84",
    actionPrimary: "#151515",
    actionSecondary: "rgba(21, 21, 21, 0.06)",
    actionDanger: "#9d1c1f",
    status: statusColors,
  },
  radius: {
    indicator: 4,
    sm: 8,
    md: 14,
    lg: 16,
    pill: 999,
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,
    xxl: 14,
    screen: 16,
    screenBottom: 32,
  },
  typography: {
    family: {
      mono: "monospace",
    },
    size: {
      xs: 12,
      sm: 13,
      md: 15,
      lg: 16,
      xl: 18,
    },
    lineHeight: {
      sm: 18,
      md: 20,
      lg: 22,
    },
    weight: {
      medium: "600",
      bold: "700",
      heavy: "800",
    },
    letterSpacing: {
      none: 0,
    },
  },
  opacity: {
    disabled: 0.52,
    pressed: 0.78,
    pressedStrong: 0.82,
  },
  layout: {
    screenMaxWidth: 720,
  },
} as const
