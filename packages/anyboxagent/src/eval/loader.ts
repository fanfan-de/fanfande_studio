import { readFile } from "node:fs/promises"
import { basename, extname } from "node:path"
import { EvalCase, EvalSuite } from "#eval/schema.ts"

function suiteIDFromPath(filePath: string) {
  const extension = extname(filePath)
  return basename(filePath, extension).replace(/[^a-zA-Z0-9_.-]+/g, "-") || "eval-suite"
}

function parseJsonl(text: string) {
  return text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

export async function loadEvalSuite(filePath: string): Promise<EvalSuite> {
  const text = await readFile(filePath, "utf8")
  const extension = extname(filePath).toLowerCase()

  if (extension === ".jsonl" || extension === ".ndjson") {
    return EvalSuite.parse({
      id: suiteIDFromPath(filePath),
      cases: parseJsonl(text).map((item) => EvalCase.parse(item)),
    })
  }

  const parsed = JSON.parse(text)
  if (Array.isArray(parsed)) {
    return EvalSuite.parse({
      id: suiteIDFromPath(filePath),
      cases: parsed.map((item) => EvalCase.parse(item)),
    })
  }

  return EvalSuite.parse(parsed)
}
