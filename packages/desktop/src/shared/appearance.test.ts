import { describe, expect, it } from "vitest"
import { APPEARANCE_TOKEN_GROUPS, normalizeAppearanceConfigDocument } from "./appearance"

describe("appearance proposed plan card tokens", () => {
  it("registers the proposed plan card token group", () => {
    expect(APPEARANCE_TOKEN_GROUPS).toContainEqual({
      id: "component-proposed-plan-card",
      label: "Proposed Plan",
      description: "Dedicated semantic color for proposed plan cards.",
      rows: [
        {
          id: "semantic-proposed-plan-card-surface",
          label: "Card Surface",
          description: "Background fill for proposed plan cards shown in assistant responses.",
          lightToken: "semantic-proposed-plan-card-surface-light",
          darkToken: "semantic-proposed-plan-card-surface-dark",
        },
      ],
    })
  })

  it("normalizes proposed plan card overrides", () => {
    const document = normalizeAppearanceConfigDocument({
      overrides: {
        "semantic-proposed-plan-card-surface-light": " #123456 ",
        "semantic-proposed-plan-card-surface-dark": "#abcdef",
        "semantic-proposed-plan-card-surface": "#000000",
      },
      resolvedTokens: {
        "semantic-proposed-plan-card-surface-light": " #654321 ",
      },
    })

    expect(document.overrides).toEqual({
      "semantic-proposed-plan-card-surface-light": "#123456",
      "semantic-proposed-plan-card-surface-dark": "#abcdef",
    })
    expect(document.resolvedTokens).toEqual({
      "semantic-proposed-plan-card-surface-light": "#654321",
    })
  })
})

describe("appearance sidebar tree row tokens", () => {
  it("registers the sidebar tree row token group", () => {
    expect(APPEARANCE_TOKEN_GROUPS).toContainEqual({
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
    })
  })

  it("normalizes sidebar tree row overrides", () => {
    const document = normalizeAppearanceConfigDocument({
      brandTheme: "terra",
      colorMode: "dark",
      updatedAt: 42,
      overrides: {
        "semantic-sidebar-tree-row-text-light": " #123456 ",
        "semantic-sidebar-tree-row-surface-active-dark": "#abcdef",
        "semantic-sidebar-tree-row-leading-active-light": "",
        "not-a-token": "#000000",
      },
      resolvedTokens: {
        "semantic-sidebar-tree-row-text-hover-dark": " #654321 ",
      },
    })

    expect(document.overrides).toEqual({
      "semantic-sidebar-tree-row-text-light": "#123456",
      "semantic-sidebar-tree-row-surface-active-dark": "#abcdef",
    })
    expect(document.resolvedTokens).toEqual({
      "semantic-sidebar-tree-row-text-hover-dark": "#654321",
    })
    expect(document.colorMode).toBe("dark")
    expect(document.updatedAt).toBe(42)
  })
})
