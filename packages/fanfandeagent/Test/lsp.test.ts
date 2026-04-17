import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import * as Env from "#env/env.ts"
import type { LocationQueryResult, WorkspaceSymbolQueryResult } from "#lsp/manager.ts"
import { Instance } from "#project/instance.ts"
import * as Tool from "#tool/tool.ts"
import {
  LspDefinitionTool,
  LspHoverTool,
  LspReferencesTool,
  LspWorkspaceSymbolsTool,
} from "#tool/lsp.ts"

async function createGitRepo(root: string, seed: string) {
  await mkdir(root, { recursive: true })
  await writeFile(path.join(root, "README.md"), `# ${seed}\n`)
  await $`git init`.cwd(root).quiet()
  await $`git config user.email test@example.com`.cwd(root).quiet()
  await $`git config user.name fanfande-test`.cwd(root).quiet()
  await $`git add README.md`.cwd(root).quiet()
  await $`git commit -m init`.cwd(root).quiet()
}

async function writeFakeLspServer(root: string) {
  const script = path.join(root, "fake-lsp-server.js")
  await writeFile(
    script,
    [
      "const docs = new Map()",
      "let buffer = Buffer.alloc(0)",
      "let contentLength = null",
      "function send(message) {",
      "  const payload = JSON.stringify(message)",
      "  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, 'utf8')}\\r\\n\\r\\n${payload}`)",
      "}",
      "function escapeRegExp(value) {",
      "  return value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')",
      "}",
      "function offsetAt(text, position) {",
      "  let line = 0",
      "  let character = 0",
      "  for (let index = 0; index < text.length; index += 1) {",
      "    if (line === position.line && character === position.character) return index",
      "    if (text[index] === '\\n') {",
      "      line += 1",
      "      character = 0",
      "      continue",
      "    }",
      "    character += 1",
      "  }",
      "  return text.length",
      "}",
      "function positionAt(text, offset) {",
      "  let line = 0",
      "  let character = 0",
      "  for (let index = 0; index < Math.min(offset, text.length); index += 1) {",
      "    if (text[index] === '\\n') {",
      "      line += 1",
      "      character = 0",
      "      continue",
      "    }",
      "    character += 1",
      "  }",
      "  return { line, character }",
      "}",
      "function wordAt(text, position) {",
      "  const offset = offsetAt(text, position)",
      "  let start = offset",
      "  let end = offset",
      "  while (start > 0 && /[A-Za-z0-9_$]/.test(text[start - 1])) start -= 1",
      "  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end += 1",
      "  return text.slice(start, end)",
      "}",
      "function declarationRange(text, word) {",
      "  if (!word) return null",
      "  const patterns = [",
      "    new RegExp(`\\\\bfunction\\\\s+${escapeRegExp(word)}\\\\b`),",
      "    new RegExp(`\\\\bdef\\\\s+${escapeRegExp(word)}\\\\b`),",
      "  ]",
      "  for (const regex of patterns) {",
      "    const match = regex.exec(text)",
      "    if (!match || match.index === undefined) continue",
      "    const start = match.index + match[0].lastIndexOf(word)",
      "    const end = start + word.length",
      "    return { start: positionAt(text, start), end: positionAt(text, end) }",
      "  }",
      "  return null",
      "}",
      "function references(text, word) {",
      "  if (!word) return []",
      "  const regex = new RegExp(`\\\\b${escapeRegExp(word)}\\\\b`, 'g')",
      "  const matches = []",
      "  for (const match of text.matchAll(regex)) {",
      "    if (match.index === undefined) continue",
      "    matches.push({",
      "      start: positionAt(text, match.index),",
      "      end: positionAt(text, match.index + word.length),",
      "    })",
      "  }",
      "  return matches",
      "}",
      "function workspaceSymbols(text, query) {",
      "  const results = []",
      "  const patterns = [",
      "    /\\bfunction\\s+([A-Za-z0-9_$]+)\\b/g,",
      "    /\\bdef\\s+([A-Za-z0-9_$]+)\\b/g,",
      "  ]",
      "  for (const regex of patterns) {",
      "    for (const match of text.matchAll(regex)) {",
      "      const name = match[1]",
      "      if (!name || !name.toLowerCase().includes(query.toLowerCase()) || match.index === undefined) continue",
      "      const start = match.index + match[0].lastIndexOf(name)",
      "      const end = start + name.length",
      "      results.push({ name, range: { start: positionAt(text, start), end: positionAt(text, end) } })",
      "    }",
      "  }",
      "  return results",
      "}",
      "function readMessage() {",
      "  while (true) {",
      "    if (contentLength == null) {",
      "      const separator = buffer.indexOf('\\r\\n\\r\\n')",
      "      if (separator === -1) return",
      "      const headerText = buffer.subarray(0, separator).toString('utf8')",
      "      buffer = buffer.subarray(separator + 4)",
      "      const headers = new Map()",
      "      for (const line of headerText.split('\\r\\n')) {",
      "        const index = line.indexOf(':')",
      "        if (index === -1) continue",
      "        headers.set(line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim())",
      "      }",
      "      contentLength = Number.parseInt(headers.get('content-length') || '', 10)",
      "    }",
      "    if (!Number.isInteger(contentLength) || buffer.length < contentLength) return",
      "    const payload = buffer.subarray(0, contentLength).toString('utf8')",
      "    buffer = buffer.subarray(contentLength)",
      "    contentLength = null",
      "    handle(JSON.parse(payload))",
      "  }",
      "}",
      "function handle(message) {",
      "  if (message.method === 'initialize') {",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: {",
      "        capabilities: {",
      "          textDocumentSync: 1,",
      "          definitionProvider: true,",
      "          referencesProvider: true,",
      "          hoverProvider: true,",
      "          workspaceSymbolProvider: true,",
      "        },",
      "        serverInfo: { name: 'fake-lsp', version: '1.0.0' },",
      "      },",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'shutdown') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: null })",
      "    return",
      "  }",
      "  if (message.method === 'exit') {",
      "    process.exit(0)",
      "    return",
      "  }",
      "  if (message.method === 'textDocument/didOpen') {",
      "    const doc = message.params.textDocument",
      "    docs.set(doc.uri, { text: doc.text, version: doc.version })",
      "    return",
      "  }",
      "  if (message.method === 'textDocument/didChange') {",
      "    const current = docs.get(message.params.textDocument.uri)",
      "    const nextText = message.params.contentChanges[0]?.text ?? current?.text ?? ''",
      "    docs.set(message.params.textDocument.uri, {",
      "      text: nextText,",
      "      version: message.params.textDocument.version ?? (current?.version ?? 0) + 1,",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'workspace/configuration') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: [] })",
      "    return",
      "  }",
      "  if (message.method === 'workspace/workspaceFolders') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: [] })",
      "    return",
      "  }",
      "  if (message.method === 'textDocument/definition') {",
      "    const doc = docs.get(message.params.textDocument.uri)",
      "    const word = doc ? wordAt(doc.text, message.params.position) : ''",
      "    const range = doc ? declarationRange(doc.text, word) : null",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: doc && range ? { uri: message.params.textDocument.uri, range } : null,",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'textDocument/references') {",
      "    const doc = docs.get(message.params.textDocument.uri)",
      "    const word = doc ? wordAt(doc.text, message.params.position) : ''",
      "    const ranges = doc ? references(doc.text, word) : []",
      "    const includeDeclaration = Boolean(message.params.context?.includeDeclaration)",
      "    const declaration = doc ? declarationRange(doc.text, word) : null",
      "    const filtered = ranges.filter((range) => includeDeclaration || !declaration || range.start.line !== declaration.start.line || range.start.character !== declaration.start.character)",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: filtered.map((range) => ({ uri: message.params.textDocument.uri, range })),",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'textDocument/hover') {",
      "    const doc = docs.get(message.params.textDocument.uri)",
      "    const word = doc ? wordAt(doc.text, message.params.position) : ''",
      "    send({",
      "      jsonrpc: '2.0',",
      "      id: message.id,",
      "      result: doc ? { contents: { kind: 'markdown', value: `\\`\\`\\`ts\\n${word} (version ${doc.version})\\n\\`\\`\\`` } } : null,",
      "    })",
      "    return",
      "  }",
      "  if (message.method === 'workspace/symbol') {",
      "    const [uri, doc] = Array.from(docs.entries())[0] || []",
      "    const result = doc ? workspaceSymbols(doc.text, message.params.query).map((item) => ({",
      "      name: item.name,",
      "      kind: 12,",
      "      location: { uri, range: item.range },",
      "    })) : []",
      "    send({ jsonrpc: '2.0', id: message.id, result })",
      "    return",
      "  }",
      "  if (typeof message.id !== 'undefined') {",
      "    send({ jsonrpc: '2.0', id: message.id, result: null })",
      "  }",
      "}",
      "process.stdin.on('data', (chunk) => {",
      "  buffer = Buffer.concat([buffer, chunk])",
      "  readMessage()",
      "})",
    ].join("\n"),
    "utf8",
  )

  return script
}

describe("lsp tools", () => {
  test("definition, references, hover, and workspace symbols use the fake server", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fanfande-lsp-tools-"))

    try {
      await createGitRepo(root, "lsp-tools")
      await mkdir(path.join(root, "src"), { recursive: true })
      await writeFile(
        path.join(root, "src", "sample.ts"),
        [
          "export function greet(name: string) {",
          "  return `hello ${name}`",
          "}",
          "",
          "export function run() {",
          "  return greet(\"fan\")",
          "}",
          "",
          "const alias = greet",
          "",
        ].join("\n"),
        "utf8",
      )
      const serverScript = await writeFakeLspServer(root)

      await Instance.provide({
        directory: root,
        async fn() {
          Env.set("FanFande_LSP_TYPESCRIPT_SERVER_COMMAND", process.execPath)
          Env.set("FanFande_LSP_TYPESCRIPT_SERVER_ARGS", JSON.stringify([serverScript]))

          const ctx = {
            sessionID: "session-lsp",
            messageID: "message-lsp",
          }

          const definitionRuntime = await LspDefinitionTool.init()
          const definition = Tool.normalizeToolOutput(await definitionRuntime.execute(
            {
              path: "src/sample.ts",
              line: 6,
              character: 12,
            },
            ctx,
          ))
          expect(definition.text).toContain("Matches: 1")
          expect(definition.text).toContain(`${path.join("src", "sample.ts")}:1:17`)
          expect((definition.data as LocationQueryResult).items).toHaveLength(1)

          const referencesRuntime = await LspReferencesTool.init()
          const references = Tool.normalizeToolOutput(await referencesRuntime.execute(
            {
              path: "src/sample.ts",
              line: 6,
              character: 12,
              includeDeclaration: true,
            },
            ctx,
          ))
          expect(references.text).toContain("Matches: 3")
          expect((references.data as LocationQueryResult).items).toHaveLength(3)

          const hoverRuntime = await LspHoverTool.init()
          const hover = Tool.normalizeToolOutput(await hoverRuntime.execute(
            {
              path: "src/sample.ts",
              line: 6,
              character: 12,
            },
            ctx,
          ))
          expect(hover.text).toContain("greet (version 1)")

          const workspaceRuntime = await LspWorkspaceSymbolsTool.init()
          const workspaceSymbols = Tool.normalizeToolOutput(await workspaceRuntime.execute(
            {
              query: "gre",
              path: "src",
            },
            ctx,
          ))
          expect(workspaceSymbols.text).toContain("Function greet")
          expect((workspaceSymbols.data as WorkspaceSymbolQueryResult).items).toHaveLength(1)
        },
      })
    } finally {
      await Instance.disposeAll()
      await rm(root, { recursive: true, force: true })
    }
  }, 120000)

  test("hover syncs document changes through didChange", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fanfande-lsp-sync-"))

    try {
      await createGitRepo(root, "lsp-sync")
      await mkdir(path.join(root, "src"), { recursive: true })
      const filePath = path.join(root, "src", "sample.ts")
      await writeFile(
        filePath,
        [
          "export function greet(name: string) {",
          "  return `hello ${name}`",
          "}",
          "",
          "export function run() {",
          "  return greet(\"fan\")",
          "}",
          "",
        ].join("\n"),
        "utf8",
      )
      const serverScript = await writeFakeLspServer(root)

      await Instance.provide({
        directory: root,
        async fn() {
          Env.set("FanFande_LSP_TYPESCRIPT_SERVER_COMMAND", process.execPath)
          Env.set("FanFande_LSP_TYPESCRIPT_SERVER_ARGS", JSON.stringify([serverScript]))

          const runtime = await LspHoverTool.init()
          const ctx = {
            sessionID: "session-lsp-sync",
            messageID: "message-lsp-sync",
          }

          const first = Tool.normalizeToolOutput(await runtime.execute(
            {
              path: "src/sample.ts",
              line: 6,
              character: 12,
            },
            ctx,
          ))
          expect(first.text).toContain("greet (version 1)")

          await writeFile(
            filePath,
            [
              "export function welcome(name: string) {",
              "  return `hello ${name}`",
              "}",
              "",
              "export function run() {",
              "  return welcome(\"fan\")",
              "}",
              "",
            ].join("\n"),
            "utf8",
          )

          const second = Tool.normalizeToolOutput(await runtime.execute(
            {
              path: "src/sample.ts",
              line: 6,
              character: 12,
            },
            ctx,
          ))
          expect(second.text).toContain("welcome (version 2)")
        },
      })
    } finally {
      await Instance.disposeAll()
      await rm(root, { recursive: true, force: true })
    }
  }, 120000)

  test("python files use the pyright language-server configuration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "fanfande-lsp-python-"))

    try {
      await createGitRepo(root, "lsp-python")
      await mkdir(path.join(root, "src"), { recursive: true })
      await writeFile(path.join(root, "pyproject.toml"), "[project]\nname='lsp-python'\n", "utf8")
      await writeFile(
        path.join(root, "src", "sample.py"),
        [
          "def greet(name: str):",
          "    return f'hello {name}'",
          "",
          "def run():",
          "    return greet('fan')",
          "",
        ].join("\n"),
        "utf8",
      )
      const serverScript = await writeFakeLspServer(root)

      await Instance.provide({
        directory: root,
        async fn() {
          Env.set("FanFande_LSP_PYTHON_SERVER_COMMAND", process.execPath)
          Env.set("FanFande_LSP_PYTHON_SERVER_ARGS", JSON.stringify([serverScript]))

          const ctx = {
            sessionID: "session-lsp-python",
            messageID: "message-lsp-python",
          }

          const definitionRuntime = await LspDefinitionTool.init()
          const definition = Tool.normalizeToolOutput(await definitionRuntime.execute(
            {
              path: "src/sample.py",
              line: 5,
              character: 13,
            },
            ctx,
          ))
          expect(definition.text).toContain("Matches: 1")
          expect(definition.text).toContain(`${path.join("src", "sample.py")}:1:5`)

          const hoverRuntime = await LspHoverTool.init()
          const hover = Tool.normalizeToolOutput(await hoverRuntime.execute(
            {
              path: "src/sample.py",
              line: 5,
              character: 13,
            },
            ctx,
          ))
          expect(hover.text).toContain("greet (version 1)")

          const workspaceRuntime = await LspWorkspaceSymbolsTool.init()
          const workspaceSymbols = Tool.normalizeToolOutput(await workspaceRuntime.execute(
            {
              query: "gre",
              path: "src",
            },
            ctx,
          ))
          expect(workspaceSymbols.text).toContain("Function greet")
          expect((workspaceSymbols.data as WorkspaceSymbolQueryResult).items).toHaveLength(1)
        },
      })
    } finally {
      await Instance.disposeAll()
      await rm(root, { recursive: true, force: true })
    }
  }, 120000)
})
