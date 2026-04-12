import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import matter from "gray-matter"
import z from "zod"
import * as Filesystem from "#util/filesystem.ts"
import * as Log from "#util/log.ts"

const log = Log.create({ service: "skill" })
const SKILL_FILENAME = "SKILL.md"

export const SkillScope = z.enum(["project", "user"]).meta({
  ref: "SkillScope",
})
export type SkillScope = z.infer<typeof SkillScope>

export const SkillInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    path: z.string(),
    scope: SkillScope,
  })
  .meta({
    ref: "SkillInfo",
  })
export type SkillInfo = z.infer<typeof SkillInfo>

export interface SkillDocument extends SkillInfo {
  body: string
}

const SkillFrontmatter = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough()

function buildSkillID(scope: SkillScope, directoryName: string) {
  return `${scope}:${directoryName}`
}

function firstParagraph(markdown: string) {
  for (const section of markdown.split(/\r?\n\s*\r?\n/)) {
    const collapsed = section
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^#+\s*/, "")
      .trim()
    if (collapsed) return collapsed
  }

  return ""
}

function skillRoots(projectRoot: string) {
  return [
    {
      scope: "project" as const,
      root: join(projectRoot, ".anybox", "skills"),
    },
    {
      scope: "user" as const,
      root: join(homedir(), ".anybox", "skills"),
    },
  ]
}

async function readSkillDocument(scope: SkillScope, directoryPath: string): Promise<SkillDocument | undefined> {
  const path = join(directoryPath, SKILL_FILENAME)
  if (!(await Filesystem.exists(path))) return undefined

  const raw = await Filesystem.readText(path)
  const parsed = matter(raw)
  const frontmatter = SkillFrontmatter.parse(parsed.data ?? {})
  const directoryName = basename(directoryPath)
  const body = parsed.content.trim()
  const description = (frontmatter.description?.trim() || firstParagraph(body) || directoryName).trim()

  return {
    id: buildSkillID(scope, directoryName),
    name: (frontmatter.name?.trim() || directoryName).trim(),
    description,
    path,
    scope,
    body,
  }
}

async function discoverInRoot(scope: SkillScope, root: string): Promise<SkillDocument[]> {
  if (!(await Filesystem.isDir(root))) return []

  const entries = await readdir(root, { withFileTypes: true })
  const documents = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readSkillDocument(scope, join(root, entry.name))),
  )

  return documents.filter((item): item is SkillDocument => Boolean(item))
}

async function discoverDocuments(projectRoot: string): Promise<SkillDocument[]> {
  const roots = skillRoots(projectRoot)
  const items = await Promise.all(roots.map((item) => discoverInRoot(item.scope, item.root)))

  return items
    .flat()
    .toSorted((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export async function list(projectRoot: string): Promise<SkillInfo[]> {
  return (await discoverDocuments(projectRoot)).map(({ body: _body, ...info }) => info)
}

export async function getSelected(projectRoot: string, skillIDs: string[]): Promise<SkillDocument[]> {
  if (skillIDs.length === 0) return []

  const all = await discoverDocuments(projectRoot)
  const byID = new Map(all.map((item) => [item.id, item] as const))
  const result: SkillDocument[] = []
  const seen = new Set<string>()

  for (const id of skillIDs) {
    if (seen.has(id)) continue
    seen.add(id)

    const item = byID.get(id)
    if (!item) {
      log.warn("selected skill not found", {
        projectRoot,
        skillID: id,
      })
      continue
    }

    result.push(item)
  }

  return result
}

export async function loadPromptSections(projectRoot: string, skillIDs: string[]): Promise<string[]> {
  const selected = await getSelected(projectRoot, skillIDs)

  return selected.map((skill) =>
    [
      `<skill id="${skill.id}" name="${skill.name}" scope="${skill.scope}">`,
      skill.body,
      `</skill>`,
    ].join("\n"),
  )
}
