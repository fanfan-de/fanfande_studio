import * as LLM from "#session/llm.ts"
import * as  Agent  from "#agent/agent.ts"
import { tool } from "#tool/registry.ts"
import { Provider } from "#config/config.ts"


LLM.stream({
    user: {
        id: "id test",
        sessionID: "sesqwe",
        role: "user",
        created: Date.now(),
        agent: Agent.get("plan"),
        model: {
            providerID: string;
            modelID: string;
        };
        summary?: {
            diffs: {
                file: string;
                before: string;
                after: string;
                additions: number;
                deletions: number;
            }[];
            title?: string | undefined;
            body?: string | undefined;
        } | undefined;
        system?: string | undefined;
        tools?: Record<string, boolean> | undefined;
        variant?: string | undefined;
    },
    sessionID: "sestest",
    model: Provider.deepseekreasoningmodel,
    agent: await Agent.get("plan"),
    system: ["你是一个助手"],
    abort: AbortSignal,
    messages: [],
    tools: tool.,
    retries?: number;
})