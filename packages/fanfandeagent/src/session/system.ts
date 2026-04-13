

//import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"

import PROMPT_ANTHROPIC from "./prompt/anthropic.txt"
import PROMPT_DEFAULT from "./prompt/default.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_GEMINI from "./prompt/gemini.txt"
import PROMPT_GPT from "./prompt/gpt.txt"
import PROMPT_KIMI from "./prompt/kimi.txt"

import PROMPT_CODEX from "./prompt/codex.txt"
import PROMPT_TRINITY from "./prompt/trinity.txt"
import * as Provider from "#provider/provider.ts"
import * as Skill from "#skill/skill.ts"
//import type { Agent } from "@/agent/agent"
//import { Permission } from "@/permission"
//import { Skill } from "@/skill"

export function provider(model: Provider.Model): string[] {
    // if (model.api.id.includes("gpt-4") || model.api.id.includes("o1") || model.api.id.includes("o3"))
    //   return [PROMPT_BEAST]
    // if (model.api.id.includes("gpt")) {
    //   if (model.api.id.includes("codex")) {
    //     return [PROMPT_CODEX]
    //   }
    //   return [PROMPT_GPT]
    // }
    // if (model.api.id.includes("gemini-")) return [PROMPT_GEMINI]
    // if (model.api.id.includes("claude")) return [PROMPT_ANTHROPIC]
    // if (model.api.id.toLowerCase().includes("trinity")) return [PROMPT_TRINITY]
    // if (model.api.id.toLowerCase().includes("kimi")) return [PROMPT_KIMI]
    // return [PROMPT_DEFAULT]


    return [PROMPT_DEFAULT]
}

export function defaultPrompt ()
{
    return [PROMPT_DEFAULT]
}

export async function environment(model: Provider.Model) {
    const project = Instance.project
    const modelName = model.api?.id ?? model.id
    return [
        [
            `You are powered by the model named ${modelName}. The exact model ID is ${model.providerID}/${modelName}`,
            `Here is some useful information about the environment you are running in:`,
            `<env>`,
            `  Working directory: ${Instance.directory}`,
            `  Workspace root folder: ${Instance.worktree}`,
            `  Is directory a git repo: ${project.vcs === "git" ? "yes" : "no"}`,
            `  Platform: ${process.platform}`,
            `  Today's date: ${new Date().toDateString()}`,
            `</env>`,
            `<directories>`,
            //todo:缺少依赖，临时注释掉
            // `  ${
            //   project.vcs === "git" && false
            //     ? await Ripgrep.tree({
            //         cwd: Instance.directory,
            //         limit: 50,
            //       })
            //     : ""
            // }`,
            `</directories>`,
        ].join("\n"),
    ]
}

export async function skills(sessionID: string, skillIDs: string[]) {
    Skill.configureSessionSkills(sessionID, skillIDs)
    return await Skill.loadPromptCatalogSections(Instance.worktree, skillIDs)
}

//   export async function skills(agent: Agent.Info) {
//     if (Permission.disabled(["skill"], agent.permission).has("skill")) return

//     const list = await Skill.available(agent)

//     return [
//       "Skills provide specialized instructions and workflows for specific tasks.",
//       "Use the skill tool to load a skill when a task matches its description.",
//       // the agents seem to ingest the information about skills a bit better if we present a more verbose
//       // version of them here and a less verbose version in tool description, rather than vice versa.
//       Skill.fmt(list, { verbose: true }),
//     ].join("\n")
//   }
