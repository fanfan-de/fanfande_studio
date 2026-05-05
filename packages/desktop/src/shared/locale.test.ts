import { describe, expect, it } from "vitest"
import {
  createDefaultLocaleConfigDocument,
  normalizeAppLocale,
  normalizeLocaleConfigDocument,
} from "./locale"

describe("locale settings", () => {
  it("defaults to Chinese when no preference exists", () => {
    expect(createDefaultLocaleConfigDocument()).toEqual({
      version: 1,
      locale: "zh-CN",
      updatedAt: 0,
    })
  })

  it("normalizes supported and unsupported locale values", () => {
    expect(normalizeAppLocale("en-US")).toBe("en-US")
    expect(normalizeAppLocale("zh-CN")).toBe("zh-CN")
    expect(normalizeAppLocale("fr-FR")).toBe("zh-CN")
  })

  it("normalizes persisted locale documents", () => {
    expect(normalizeLocaleConfigDocument({
      version: 1,
      locale: "en-US",
      updatedAt: 42,
    })).toEqual({
      version: 1,
      locale: "en-US",
      updatedAt: 42,
    })

    expect(normalizeLocaleConfigDocument({
      locale: "de-DE",
      updatedAt: Number.NaN,
    })).toEqual({
      version: 1,
      locale: "zh-CN",
      updatedAt: 0,
    })
  })
})
