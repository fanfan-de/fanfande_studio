import { app } from "electron"
import fs from "node:fs/promises"
import path from "node:path"
import {
  createDefaultLocaleConfigDocument,
  normalizeLocaleConfigDocument,
  type LocaleConfigDocument,
  type LocaleConfigSnapshot,
} from "../shared/locale"

const LOCALE_CONFIG_FILE_NAME = "locale-settings.json"

export function getLocaleConfigPath() {
  return path.join(app.getPath("userData"), LOCALE_CONFIG_FILE_NAME)
}

export async function readLocaleConfigSnapshot(): Promise<LocaleConfigSnapshot> {
  const configPath = getLocaleConfigPath()

  try {
    const raw = await fs.readFile(configPath, "utf8")
    const parsed = JSON.parse(raw) as unknown
    return {
      path: configPath,
      exists: true,
      document: normalizeLocaleConfigDocument(parsed),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return {
        path: configPath,
        exists: false,
        document: createDefaultLocaleConfigDocument(),
      }
    }

    throw error
  }
}

export async function writeLocaleConfigSnapshot(input: LocaleConfigDocument): Promise<LocaleConfigSnapshot> {
  const configPath = getLocaleConfigPath()
  const document: LocaleConfigDocument = {
    ...normalizeLocaleConfigDocument(input),
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
