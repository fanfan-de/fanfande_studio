import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const pluginRoot = path.resolve(import.meta.dirname, "..");

describe("presentation scripts", () => {
  it("renders, checks, and builds the sample deck", async () => {
    const workspace = "workspaces/sample-basic";
    await execNode("scripts/render_slide.mjs", ["--workspace", workspace, "--slide", "slides/slide-01.mjs"]);
    await execNode("scripts/check_layout_quality.mjs", ["--workspace", workspace]);
    await execNode("scripts/build_deck.mjs", ["--workspace", workspace]);

    const pptx = path.resolve(pluginRoot, workspace, "output/final.pptx");
    const contactSheet = path.resolve(pluginRoot, workspace, "preview/contact-sheet.png");
    const layout = JSON.parse(await fs.readFile(path.resolve(pluginRoot, workspace, "layout/deck.json"), "utf8"));
    expect((await fs.stat(pptx)).size).toBeGreaterThan(0);
    expect((await fs.stat(contactSheet)).size).toBeGreaterThan(0);
    expect(layout.slides).toHaveLength(3);
  }, 60000);

  it("rejects non-whitelisted imports in slide modules", async () => {
    const workspaceRoot = path.resolve(pluginRoot, "workspaces", `.tmp-sandbox-${Date.now()}`);
    try {
      await fs.mkdir(path.resolve(workspaceRoot, "slides"), { recursive: true });
      await fs.writeFile(path.resolve(workspaceRoot, "slides/slide-01.mjs"), [
        'import fs from "node:fs";',
        "export async function slide01() { return fs; }",
        "",
      ].join("\n"));

      await expect(execNode("scripts/render_slide.mjs", [
        "--workspace",
        path.relative(pluginRoot, workspaceRoot),
        "--slide",
        "slides/slide-01.mjs",
      ])).rejects.toThrow(/Import not allowed/);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

async function execNode(script, args) {
  return execFileAsync(process.execPath, [script, ...args], {
    cwd: pluginRoot,
    timeout: 60000,
    maxBuffer: 1024 * 1024 * 8,
  });
}
