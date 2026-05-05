import { describe, expect, it } from "vitest"
import { enUS, getTranslationDictionary, translateLiteral, zhCN } from "./translations"

describe("i18n translations", () => {
  it("keeps English and Chinese dictionaries aligned", () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it("translates known literals in both directions", () => {
    expect(translateLiteral("zh-CN", "Open settings")).toBe("打开设置")
    expect(translateLiteral("en-US", "关闭设置")).toBe("Close settings")
  })

  it("formats common count literals", () => {
    expect(translateLiteral("zh-CN", "3 of 10 enabled")).toBe("已启用 3 / 10")
    expect(translateLiteral("en-US", "3 of 10 enabled")).toBe("3 of 10 enabled")
  })

  it("exposes dictionaries by locale", () => {
    expect(getTranslationDictionary("zh-CN")["settings.appearance.languageTitle"]).toBe("显示语言")
    expect(getTranslationDictionary("en-US")["settings.appearance.languageTitle"]).toBe("Display Language")
  })
})
