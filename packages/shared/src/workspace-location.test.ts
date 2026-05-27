import { describe, expect, it } from "vitest"
import {
  containsWorkspaceLocation,
  createSshWorkspaceUri,
  getWorkspaceBasename,
  parseWorkspaceLocation,
  relativeSshRemotePath,
  resolveWorkspaceChildUri,
} from "./workspace-location"

describe("workspace-location", () => {
  it("parses and formats SSH workspace URIs", () => {
    const uri = createSshWorkspaceUri("prod", "/home/ubuntu/app with space")
    expect(uri).toBe("ssh://prod/home/ubuntu/app%20with%20space")
    expect(parseWorkspaceLocation(uri)).toMatchObject({
      kind: "ssh",
      profileID: "prod",
      remotePath: "/home/ubuntu/app with space",
    })
  })

  it("normalizes remote child paths without escaping the root", () => {
    const root = createSshWorkspaceUri("prod", "/home/ubuntu/app")
    expect(resolveWorkspaceChildUri(root, "src/../package.json")).toBe("ssh://prod/home/ubuntu/app/package.json")
    expect(() => resolveWorkspaceChildUri(root, "../../etc/passwd")).toThrow(/escapes/)
  })

  it("checks containment per SSH profile", () => {
    const root = createSshWorkspaceUri("prod", "/home/ubuntu/app")
    expect(containsWorkspaceLocation(root, createSshWorkspaceUri("prod", "/home/ubuntu/app/src/index.ts"))).toBe(true)
    expect(containsWorkspaceLocation(root, createSshWorkspaceUri("prod", "/home/ubuntu/other"))).toBe(false)
    expect(containsWorkspaceLocation(root, createSshWorkspaceUri("staging", "/home/ubuntu/app/src/index.ts"))).toBe(false)
  })

  it("returns display-oriented basename and relative paths", () => {
    expect(getWorkspaceBasename("ssh://prod/home/ubuntu/app")).toBe("app")
    expect(relativeSshRemotePath("/home/ubuntu/app", "/home/ubuntu/app/src/index.ts")).toBe("src/index.ts")
  })
})
