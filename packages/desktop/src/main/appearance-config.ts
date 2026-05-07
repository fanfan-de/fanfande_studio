import { app } from "electron"
import fs from "node:fs/promises"
import path from "node:path"
import {
  createDefaultAppearanceConfigDocument,
  normalizeAppearanceConfigDocument,
  type AppearanceConfigDocument,
  type AppearanceConfigSnapshot,
} from "../shared/appearance"

const APPEARANCE_CONFIG_FILE_NAME = "appearance-theme.json"
const APPEARANCE_CONFIG_MIGRATION_FILE_NAME = "appearance-theme.migration.json"
const APPEARANCE_CONFIG_FORCED_DEFAULTS_REVISION = 1

export function getAppearanceConfigPath() {
  return path.join(app.getPath("userData"), APPEARANCE_CONFIG_FILE_NAME)
}

function getAppearanceConfigMigrationPath() {
  return path.join(app.getPath("userData"), APPEARANCE_CONFIG_MIGRATION_FILE_NAME)
}

function createTimestampedAppearanceDocument(input: AppearanceConfigDocument): AppearanceConfigDocument {
  return {
    ...input,
    updatedAt: Date.now(),
  }
}

async function writeAppearanceConfigDocumentToPath(
  configPath: string,
  input: AppearanceConfigDocument,
): Promise<AppearanceConfigDocument> {
  const normalized = normalizeAppearanceConfigDocument(input)
  const document = createTimestampedAppearanceDocument(normalized)
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(document, null, 2)}\n`, "utf8")
  return document
}

async function readAppearanceMigrationRevision(migrationPath: string) {
  try {
    const raw = await fs.readFile(migrationPath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return 0

    const revision = (parsed as { revision?: unknown }).revision
    if (typeof revision !== "number" || !Number.isFinite(revision)) return 0
    return revision
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return 0
    throw error
  }
}

async function writeAppearanceMigrationRevision(migrationPath: string, revision: number) {
  await fs.mkdir(path.dirname(migrationPath), { recursive: true })
  await fs.writeFile(
    migrationPath,
    `${JSON.stringify({ revision, updatedAt: Date.now() }, null, 2)}\n`,
    "utf8",
  )
}

export async function readAppearanceConfigSnapshot(): Promise<AppearanceConfigSnapshot> {
  const configPath = getAppearanceConfigPath()
  const migrationPath = getAppearanceConfigMigrationPath()
  const revision = await readAppearanceMigrationRevision(migrationPath)

  if (revision < APPEARANCE_CONFIG_FORCED_DEFAULTS_REVISION) {
    const forcedDocument = await writeAppearanceConfigDocumentToPath(
      configPath,
      createDefaultAppearanceConfigDocument(),
    )
    await writeAppearanceMigrationRevision(migrationPath, APPEARANCE_CONFIG_FORCED_DEFAULTS_REVISION)

    return {
      path: configPath,
      exists: true,
      document: forcedDocument,
    }
  }

  try {
    const raw = await fs.readFile(configPath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    return {
      path: configPath,
      exists: true,
      document: normalizeAppearanceConfigDocument(parsed),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {
        path: configPath,
        exists: false,
        document: createDefaultAppearanceConfigDocument(),
      }
    }

    throw error
  }
}

export async function writeAppearanceConfigSnapshot(
  input: AppearanceConfigDocument,
): Promise<AppearanceConfigSnapshot> {
  const configPath = getAppearanceConfigPath()
  const migrationPath = getAppearanceConfigMigrationPath()
  const document = await writeAppearanceConfigDocumentToPath(configPath, input)
  await writeAppearanceMigrationRevision(migrationPath, APPEARANCE_CONFIG_FORCED_DEFAULTS_REVISION)

  return {
    path: configPath,
    exists: true,
    document,
  }
}
