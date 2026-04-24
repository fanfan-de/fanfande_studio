import { APPEARANCE_TOKEN_NAMES, type AppearanceTokenMap, type AppearanceTokenName } from "../../../shared/appearance"

const RGB_COLOR_PATTERN =
  /^rgba?\(\s*(?<red>\d{1,3})\s*,\s*(?<green>\d{1,3})\s*,\s*(?<blue>\d{1,3})(?:\s*,\s*(?<alpha>[\d.]+))?\s*\)$/i
const SHORT_HEX_COLOR_PATTERN = /^#(?<r>[0-9a-f])(?<g>[0-9a-f])(?<b>[0-9a-f])$/i
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

function clampRgbChannel(value: number) {
  return Math.max(0, Math.min(255, value))
}

function toHexChannel(value: number) {
  return clampRgbChannel(value).toString(16).padStart(2, "0")
}

export function normalizeAppearanceColorInputValue(value: string, fallback = "#000000") {
  const trimmed = value.trim()
  if (!trimmed) return fallback

  if (HEX_COLOR_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  const shortHexMatch = trimmed.match(SHORT_HEX_COLOR_PATTERN)
  if (shortHexMatch?.groups) {
    const { r, g, b } = shortHexMatch.groups
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  const rgbMatch = trimmed.match(RGB_COLOR_PATTERN)
  if (rgbMatch?.groups) {
    const red = Number.parseInt(rgbMatch.groups.red, 10)
    const green = Number.parseInt(rgbMatch.groups.green, 10)
    const blue = Number.parseInt(rgbMatch.groups.blue, 10)
    return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`
  }

  return fallback
}

export function applyAppearanceOverrides(root: HTMLElement, overrides: AppearanceTokenMap) {
  for (const tokenName of APPEARANCE_TOKEN_NAMES) {
    const nextValue = overrides[tokenName]
    if (nextValue) {
      root.style.setProperty(`--${tokenName}`, nextValue)
      continue
    }

    root.style.removeProperty(`--${tokenName}`)
  }
}

export function readResolvedAppearanceTokenValues(root: HTMLElement): Record<AppearanceTokenName, string> {
  const styles = getComputedStyle(root)
  return Object.fromEntries(
    APPEARANCE_TOKEN_NAMES.map((tokenName) => {
      const value = styles.getPropertyValue(`--${tokenName}`).trim()
      return [tokenName, normalizeAppearanceColorInputValue(value)]
    }),
  ) as Record<AppearanceTokenName, string>
}
