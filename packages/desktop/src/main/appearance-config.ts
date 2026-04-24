import fs from "node:fs/promises"
import path from "node:path"
import { app } from "electron"
import {
  createDefaultAppearanceConfigDocument,
  normalizeAppearanceConfigDocument,
  type AppearanceConfigDocument,
  type AppearanceConfigSnapshot,
} from "../shared/appearance"

const APPEARANCE_CONFIG_FILE_NAME = "appearance-theme.json"

export function getAppearanceConfigPath() {
  return path.join(app.getPath("userData"), APPEARANCE_CONFIG_FILE_NAME)
}

export async function readAppearanceConfigSnapshot(): Promise<AppearanceConfigSnapshot> {
  const configPath = getAppearanceConfigPath()

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
  const normalized = normalizeAppearanceConfigDocument(input)
  const document: AppearanceConfigDocument = {
    ...normalized,
    updatedAt: Date.now(),
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, `${JSON.stringify(document, null, 2)}\n`, "utf8")

  return {
    path: configPath,
    exists: true,
    document,
  }
}
