

//import { Ripgrep } from "../file/ripgrep"

import { Instance } from "../project/instance"
import * as Provider from "#provider/provider.ts"
import * as Skill from "#skill/skill.ts"
import type * as Session from "#session/session.ts"
import * as Task from "#session/task.ts"
import * as PromptPresets from "#session/prompt-presets.ts"
//import type { Agent } from "@/agent/agent"
//import { Permission } from "@/permission"
//import { Skill } from "@/skill"

function renderTaskSummaryGroup(label: string, tasks: Task.SessionTaskView[]) {
    if (tasks.length === 0) return undefined
    return `- ${label}: ${tasks.map((task) => `${task.id} ${task.subject} (${task.owner})`).join("; ")}`
}

function renderActiveTasks(session: Session.SessionInfo | null | undefined) {
    if (!session) return undefined

    const state = Task.listSessionTasks(session.id, {
        includeCompleted: false,
    })
    if (state.summary.total === 0) return undefined

    const blocked = state.blocked.map((task) => ({
        ...task,
        subject: `${task.subject} blocked_by=${task.blockedBy.join(",")}`,
    }))

    return [
        "<active-tasks>",
        `completed: ${state.summary.completed}/${Task.listSessionTasks(session.id).summary.total}`,
        renderTaskSummaryGroup("current", state.current),
        renderTaskSummaryGroup("next", state.next),
        renderTaskSummaryGroup("blocked", blocked),
        "</active-tasks>",
    ].filter((line): line is string => typeof line === "string").join("\n")
}

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


    return [PromptPresets.getBundledPromptPresetContent("system-default")]
}

export async function defaultPrompt(input?: {
    agent?: {
        name?: string
    }
    session?: Session.SessionInfo | null
})
{
    const selection = await PromptPresets.getPromptPresetSelection()
    const prompts = [await PromptPresets.getResolvedPromptPresetContent(selection.systemPromptPresetID)]
    if (input?.agent?.name === "plan") {
        prompts.push(await PromptPresets.getResolvedPromptPresetContent(selection.planModePromptPresetID))
    }

    const workflow = input?.session?.workflow
    const approvedPlan = workflow?.mode === "execution"
        ? workflow.plan.approvedMarkdown?.trim()
        : undefined

    if (approvedPlan) {
        prompts.push([
            "<approved-plan>",
            "A plan has already been approved for this session. Unless the user changes scope, execute according to it.",
            approvedPlan,
            "</approved-plan>",
        ].join("\n"))
    }

    const activeTasks = renderActiveTasks(input?.session)
    if (activeTasks) {
        prompts.push(activeTasks)
    }

    return prompts
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
