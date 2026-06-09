import { writeFile } from "node:fs/promises"
import { loadEvalSuite } from "#eval/loader.ts"
import { createPromptExecutor } from "#eval/executor.ts"
import { runEvalSuite } from "#eval/runner.ts"
import { createJsonReport, createMarkdownReport } from "#eval/report.ts"

type CliOptions = {
  suitePath?: string
  directory: string
  format: "markdown" | "json"
  output?: string
  tags?: string[]
  caseIDs?: string[]
  concurrency?: number
  repetitions?: number
}

function readOption(args: string[], name: string) {
  const prefix = `--${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(`--${name}`)
  if (index >= 0) return args[index + 1]
  return undefined
}

function readNumberOption(args: string[], name: string) {
  const value = readOption(args, name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function readListOption(args: string[], name: string) {
  const value = readOption(args, name)
  return value?.split(",").map((item) => item.trim()).filter(Boolean)
}

function printHelp() {
  console.log([
    "Usage: bun run src/eval/cli.ts <suite.json|suite.jsonl> [options]",
    "",
    "Options:",
    "  --directory <path>       Workspace directory for real Agent runs. Defaults to cwd.",
    "  --format markdown|json   Report format. Defaults to markdown.",
    "  --output <path>          Write report to a file instead of stdout.",
    "  --tags a,b               Run cases matching any tag.",
    "  --cases id1,id2          Run selected case ids.",
    "  --concurrency <n>        Override suite concurrency.",
    "  --repetitions <n>        Override suite repetitions unless a case sets its own.",
  ].join("\n"))
}

function parseArgs(args: string[]): CliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    process.exit(0)
  }

  const positional = args.filter((arg) => !arg.startsWith("--"))
  const suitePath = readOption(args, "suite") ?? positional[0]
  const format = readOption(args, "format") ?? "markdown"
  if (format !== "markdown" && format !== "json") {
    throw new Error("--format must be 'markdown' or 'json'.")
  }

  return {
    suitePath,
    directory: readOption(args, "directory") ?? process.cwd(),
    format,
    output: readOption(args, "output"),
    tags: readListOption(args, "tags"),
    caseIDs: readListOption(args, "cases"),
    concurrency: readNumberOption(args, "concurrency"),
    repetitions: readNumberOption(args, "repetitions"),
  }
}

const options = parseArgs(process.argv.slice(2))
if (!options.suitePath) {
  printHelp()
  process.exit(1)
}

const suite = await loadEvalSuite(options.suitePath)
const result = await runEvalSuite(suite, createPromptExecutor({ directory: options.directory }), {
  tags: options.tags,
  caseIDs: options.caseIDs,
  concurrency: options.concurrency,
  repetitions: options.repetitions,
})
const report = options.format === "json"
  ? createJsonReport(result)
  : createMarkdownReport(result)

if (options.output) {
  await writeFile(options.output, report, "utf8")
} else {
  console.log(report)
}

if (!result.passed) {
  process.exitCode = 1
}
