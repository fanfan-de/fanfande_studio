import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Skill from "#skill/skill.ts"

const ENV_KEYS = ["HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH"] as const

describe("skill discovery", () => {
  let projectRoot = ""
  let fakeHome = ""
  const envBackup = new Map<string, string | undefined>()

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), "fanfande-skill-project-"))
    fakeHome = await mkdtemp(join(tmpdir(), "fanfande-skill-home-"))

    for (const key of ENV_KEYS) {
      envBackup.set(key, process.env[key])
    }

    process.env.HOME = fakeHome
    process.env.USERPROFILE = fakeHome
    delete process.env.HOMEDRIVE
    delete process.env.HOMEPATH
  })

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      const value = envBackup.get(key)
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }

    await rm(projectRoot, { recursive: true, force: true })
    await rm(fakeHome, { recursive: true, force: true })
  })

  test("list should discover project and user skills", async () => {
    await mkdir(join(projectRoot, ".codex", "skills", "review"), { recursive: true })
    await writeFile(
      join(projectRoot, ".codex", "skills", "review", "SKILL.md"),
      [
        "---",
        "name: Review Assistant",
        "description: Review diffs for regressions",
        "---",
        "",
        "# Review",
        "",
        "Look for regressions.",
        "",
      ].join("\n"),
    )

    await mkdir(join(fakeHome, ".codex", "skills", "notes"), { recursive: true })
    await writeFile(
      join(fakeHome, ".codex", "skills", "notes", "SKILL.md"),
      [
        "# Notes",
        "",
        "Write release notes from recent changes.",
        "",
      ].join("\n"),
    )

    const skills = await Skill.list(projectRoot)

    expect(skills).toHaveLength(2)
    expect(skills.find((item) => item.id === "project:review")).toMatchObject({
      name: "Review Assistant",
      description: "Review diffs for regressions",
      scope: "project",
    })
    expect(skills.find((item) => item.id === "user:notes")).toMatchObject({
      name: "notes",
      description: "Notes",
      scope: "user",
    })
  })

  test("loadPromptSections should only include selected skills once", async () => {
    await mkdir(join(projectRoot, ".codex", "skills", "review"), { recursive: true })
    await writeFile(
      join(projectRoot, ".codex", "skills", "review", "SKILL.md"),
      [
        "---",
        "name: Review Assistant",
        "---",
        "",
        "Always review with a regression-first mindset.",
        "",
      ].join("\n"),
    )

    const sections = await Skill.loadPromptSections(projectRoot, [
      "project:review",
      "project:review",
      "project:missing",
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toContain('<skill id="project:review" name="Review Assistant" scope="project">')
    expect(sections[0]).toContain("Always review with a regression-first mindset.")
  })
})
