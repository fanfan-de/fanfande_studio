import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Config from "#config/config.ts"
import { Instance } from "#project/instance.ts"
import * as SkillGitInstall from "#skill/git-install.ts"
import * as Skill from "#skill/skill.ts"
import { LoadSkillTool } from "#tool/load-skill.ts"
import { ReadSkillResourceTool } from "#tool/read-skill-resource.ts"

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
    await mkdir(join(projectRoot, ".anybox", "skills", "review"), { recursive: true })
    await writeFile(
      join(projectRoot, ".anybox", "skills", "review", "SKILL.md"),
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

    await mkdir(join(fakeHome, ".anybox", "skills", "notes"), { recursive: true })
    await writeFile(
      join(fakeHome, ".anybox", "skills", "notes", "SKILL.md"),
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

  test("loadPromptCatalogSections should only include selected skill metadata", async () => {
    await mkdir(join(projectRoot, ".anybox", "skills", "review"), { recursive: true })
    await writeFile(
      join(projectRoot, ".anybox", "skills", "review", "SKILL.md"),
      [
        "---",
        "name: Review Assistant",
        "description: Review regressions carefully",
        "---",
        "",
        "Always review with a regression-first mindset.",
        "",
      ].join("\n"),
    )

    const sections = await Skill.loadPromptCatalogSections(projectRoot, [
      "project:review",
      "project:review",
      "project:missing",
    ])

    expect(sections).toHaveLength(1)
    expect(sections[0]).toContain('<skills progressive="true" mode="selected">')
    expect(sections[0]).toContain('<skill_summary id="project:review" name="Review Assistant" scope="project">')
    expect(sections[0]).toContain("description: Review regressions carefully")
    expect(sections[0]).not.toContain("Always review with a regression-first mindset.")
  })

  test("resolveTurnSkillIDs should fall back to the project selection when the request omits skills", async () => {
    await mkdir(join(projectRoot, ".anybox", "skills", "review"), { recursive: true })
    await writeFile(
      join(projectRoot, ".anybox", "skills", "review", "SKILL.md"),
      [
        "---",
        "name: Review Assistant",
        "description: Review code changes before merge",
        "---",
        "",
        "# Review",
        "",
        "Always review carefully.",
        "",
      ].join("\n"),
    )

    const projectID = `skill-selection-${Date.now()}`
    await Config.setSelectedSkillIDs(projectID, ["project:review", "project:missing", "project:review"])

    await expect(
      Skill.resolveTurnSkillIDs({
        projectID,
        projectRoot,
      }),
    ).resolves.toEqual(["project:review"])

    await expect(
      Skill.resolveTurnSkillIDs({
        projectID,
        projectRoot,
        requestedSkillIDs: [],
      }),
    ).resolves.toEqual([])
  })

  test("skill tools load SKILL.md progressively and gate resource reads", async () => {
    await mkdir(join(projectRoot, ".anybox", "skills", "review", "scripts"), { recursive: true })
    await writeFile(
      join(projectRoot, ".anybox", "skills", "review", "SKILL.md"),
      [
        "---",
        "name: Review Assistant",
        "description: Review code changes before merge",
        "---",
        "",
        "# Review",
        "",
        "Read `scripts/checklist.md` before starting the final review.",
        "",
      ].join("\n"),
    )
    await writeFile(
      join(projectRoot, ".anybox", "skills", "review", "scripts", "checklist.md"),
      [
        "1. Scan the diff.",
        "2. List risks first.",
        "",
      ].join("\n"),
    )

    await Instance.provide({
      directory: projectRoot,
      async fn() {
        const sessionID = "session-skill-tools"
        const ctx = {
          sessionID,
          messageID: "message-skill-tools",
        }
        const loadRuntime = await LoadSkillTool.init()
        const resourceRuntime = await ReadSkillResourceTool.init()

        Skill.configureSessionSkills(sessionID, ["project:review"])

        await expect(
          resourceRuntime.execute(
            {
              id: "project:review",
              relativePath: "scripts/checklist.md",
            },
            ctx,
          ),
        ).rejects.toThrow("Load skill 'project:review' with load-skill before reading its resources.")

        const loadResult = await loadRuntime.execute(
          {
            id: "project:review",
          },
          ctx,
        )

        expect(loadResult.text).toContain('<skill id="project:review" name="Review Assistant" scope="project">')
        expect(loadResult.text).toContain("Read `scripts/checklist.md` before starting the final review.")

        const resourceResult = await resourceRuntime.execute(
          {
            id: "project:review",
            relativePath: "scripts/checklist.md",
          },
          ctx,
        )

        expect(resourceResult.text).toContain("Resource: scripts\\checklist.md")
        expect(resourceResult.text).toContain("1 | 1. Scan the diff.")

        await expect(
          loadRuntime.execute(
            {
              id: "project:missing",
            },
            ctx,
          ),
        ).rejects.toThrow("Skill 'project:missing' was not found or is not available for this turn.")

        await expect(
          resourceRuntime.execute(
            {
              id: "project:review",
              relativePath: "../escape.txt",
            },
            ctx,
          ),
        ).rejects.toThrow("outside the skill directory")
      },
    })
  })
})

describe("git skill install", () => {
  let fakeHome = ""
  let previewRoot = ""
  let repoRoot = ""
  const envBackup = new Map<string, string | undefined>()

  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), "fanfande-skill-git-home-"))
    previewRoot = await mkdtemp(join(tmpdir(), "fanfande-skill-git-preview-"))
    repoRoot = join(previewRoot, "repo")
    await mkdir(repoRoot, { recursive: true })

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

    await rm(fakeHome, { recursive: true, force: true })
    await rm(previewRoot, { recursive: true, force: true })
  })

  test("parseGitSkillSource supports shorthand, HTTPS, tree paths, and SSH", () => {
    expect(SkillGitInstall.parseGitSkillSource("owner/repo")).toMatchObject({
      cloneUrl: "https://github.com/owner/repo.git",
      repoName: "repo",
    })
    expect(SkillGitInstall.parseGitSkillSource("https://github.com/owner/repo")).toMatchObject({
      cloneUrl: "https://github.com/owner/repo.git",
      repoName: "repo",
    })
    expect(SkillGitInstall.parseGitSkillSource("https://github.com/owner/repo/tree/main/skills/review")).toMatchObject({
      cloneUrl: "https://github.com/owner/repo.git",
      repoName: "repo",
      ref: "main",
      subpath: "skills/review",
    })
    expect(SkillGitInstall.parseGitSkillSource("git@github.com:owner/repo.git")).toMatchObject({
      cloneUrl: "git@github.com:owner/repo.git",
      repoName: "repo",
    })
  })

  test("discovers root and skills directory candidates", async () => {
    await writeFile(
      join(repoRoot, "SKILL.md"),
      ["---", "name: Root Skill", "description: Root workflow", "---", "", "# Root"].join("\n"),
    )
    await mkdir(join(repoRoot, "skills", "review"), { recursive: true })
    await writeFile(
      join(repoRoot, "skills", "review", "SKILL.md"),
      ["---", "name: Review Skill", "description: Review workflow", "---", "", "# Review"].join("\n"),
    )

    const parsed = SkillGitInstall.parseGitSkillSource("owner/repo")
    const candidates = await SkillGitInstall.discoverSkillInstallCandidates(parsed, repoRoot)

    expect(candidates.map((item) => item.id)).toEqual([".", "skills/review"])
    expect(candidates.find((item) => item.id === ".")).toMatchObject({
      name: "Root Skill",
      directoryName: "repo",
      available: true,
    })
    expect(candidates.find((item) => item.id === "skills/review")).toMatchObject({
      name: "Review Skill",
      directoryName: "review",
      available: true,
    })
  })

  test("marks existing target directories unavailable and rejects installation", async () => {
    await mkdir(join(fakeHome, ".anybox", "skills", "review"), { recursive: true })
    await mkdir(join(repoRoot, "skills", "review"), { recursive: true })
    await writeFile(
      join(repoRoot, "skills", "review", "SKILL.md"),
      ["---", "name: Review Skill", "description: Review workflow", "---", "", "# Review"].join("\n"),
    )

    const parsed = SkillGitInstall.parseGitSkillSource("owner/repo")
    const preview = await SkillGitInstall.registerGlobalSkillGitInstallPreview(parsed, repoRoot, previewRoot)

    expect(preview.skills[0]).toMatchObject({
      id: "skills/review",
      available: false,
    })
    await expect(
      SkillGitInstall.installGlobalSkillsFromGitPreview({
        previewID: preview.previewID,
        skillIDs: ["skills/review"],
      }),
    ).rejects.toThrow("already exists")
  })

  test("installs selected skills with resources and skips git metadata", async () => {
    await mkdir(join(repoRoot, "skills", "review", "scripts"), { recursive: true })
    await mkdir(join(repoRoot, "skills", "review", ".git"), { recursive: true })
    await writeFile(
      join(repoRoot, "skills", "review", "SKILL.md"),
      ["---", "name: Review Skill", "description: Review workflow", "---", "", "# Review"].join("\n"),
    )
    await writeFile(join(repoRoot, "skills", "review", "scripts", "checklist.md"), "Check carefully.\n")
    await writeFile(join(repoRoot, "skills", "review", ".git", "config"), "[core]\n")

    const parsed = SkillGitInstall.parseGitSkillSource("owner/repo")
    const preview = await SkillGitInstall.registerGlobalSkillGitInstallPreview(parsed, repoRoot, previewRoot)
    const result = await SkillGitInstall.installGlobalSkillsFromGitPreview({
      previewID: preview.previewID,
      skillIDs: ["skills/review"],
    })

    const installed = result.installed[0]
    expect(installed).toMatchObject({
      name: "Review Skill",
      filePath: join(fakeHome, ".anybox", "skills", "review", "SKILL.md"),
    })
    await expect(readFile(join(fakeHome, ".anybox", "skills", "review", "scripts", "checklist.md"), "utf8")).resolves.toContain(
      "Check carefully.",
    )
    await expect(stat(join(fakeHome, ".anybox", "skills", "review", ".git")).catch(() => null)).resolves.toBeNull()
  })
})
