function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

export namespace Flag {
  export const FanFande_AUTO_SHARE = truthy("FanFande_AUTO_SHARE")
  export const FanFande_GIT_BASH_PATH = process.env["FanFande_GIT_BASH_PATH"]
  export const FanFande_CONFIG = process.env["FanFande_CONFIG"]
  export declare const FanFande_CONFIG_DIR: string | undefined
  export const FanFande_CONFIG_CONTENT = process.env["FanFande_CONFIG_CONTENT"]
  export const FanFande_DISABLE_AUTOUPDATE = truthy("FanFande_DISABLE_AUTOUPDATE")
  export const FanFande_DISABLE_PRUNE = truthy("FanFande_DISABLE_PRUNE")
  export const FanFande_DISABLE_TERMINAL_TITLE = truthy("FanFande_DISABLE_TERMINAL_TITLE")
  export const FanFande_PERMISSION = process.env["FanFande_PERMISSION"]
  export const FanFande_DISABLE_DEFAULT_PLUGINS = truthy("FanFande_DISABLE_DEFAULT_PLUGINS")
  export const FanFande_DISABLE_LSP_DOWNLOAD = truthy("FanFande_DISABLE_LSP_DOWNLOAD")
  export const FanFande_ENABLE_EXPERIMENTAL_MODELS = truthy("FanFande_ENABLE_EXPERIMENTAL_MODELS")
  export const FanFande_DISABLE_AUTOCOMPACT = truthy("FanFande_DISABLE_AUTOCOMPACT")
  export const FanFande_DISABLE_MODELS_FETCH = truthy("FanFande_DISABLE_MODELS_FETCH")
  export const FanFande_DISABLE_CLAUDE_CODE = truthy("FanFande_DISABLE_CLAUDE_CODE")
  export const FanFande_DISABLE_CLAUDE_CODE_PROMPT =
    FanFande_DISABLE_CLAUDE_CODE || truthy("FanFande_DISABLE_CLAUDE_CODE_PROMPT")
  export const FanFande_DISABLE_CLAUDE_CODE_SKILLS =
    FanFande_DISABLE_CLAUDE_CODE || truthy("FanFande_DISABLE_CLAUDE_CODE_SKILLS")
  export declare const FanFande_DISABLE_PROJECT_CONFIG: boolean
  export const FanFande_FAKE_VCS = process.env["FanFande_FAKE_VCS"]
  export const FanFande_CLIENT = process.env["FanFande_CLIENT"] ?? "cli"
  export const FanFande_SERVER_PASSWORD = process.env["FanFande_SERVER_PASSWORD"]
  export const FanFande_SERVER_USERNAME = process.env["FanFande_SERVER_USERNAME"]

  // Experimental
  export const FanFande_EXPERIMENTAL = truthy("FanFande_EXPERIMENTAL")
  export const FanFande_EXPERIMENTAL_FILEWATCHER = truthy("FanFande_EXPERIMENTAL_FILEWATCHER")
  export const FanFande_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("FanFande_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const FanFande_EXPERIMENTAL_ICON_DISCOVERY =
    FanFande_EXPERIMENTAL || truthy("FanFande_EXPERIMENTAL_ICON_DISCOVERY")
  export const FanFande_EXPERIMENTAL_DISABLE_COPY_ON_SELECT = truthy("FanFande_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const FanFande_ENABLE_EXA =
    truthy("FanFande_ENABLE_EXA") || FanFande_EXPERIMENTAL || truthy("FanFande_EXPERIMENTAL_EXA")
  export const FanFande_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH = number("FanFande_EXPERIMENTAL_BASH_MAX_OUTPUT_LENGTH")
  export const FanFande_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("FanFande_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const FanFande_EXPERIMENTAL_AGENT_LOOP_LIMIT = number("FanFande_EXPERIMENTAL_AGENT_LOOP_LIMIT")
  export const FanFande_EXPERIMENTAL_LLM_TOTAL_TIMEOUT_MS = number("FanFande_EXPERIMENTAL_LLM_TOTAL_TIMEOUT_MS")
  export const FanFande_EXPERIMENTAL_LLM_STEP_TIMEOUT_MS = number("FanFande_EXPERIMENTAL_LLM_STEP_TIMEOUT_MS")
  export const FanFande_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("FanFande_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const FanFande_EXPERIMENTAL_OXFMT = FanFande_EXPERIMENTAL || truthy("FanFande_EXPERIMENTAL_OXFMT")
  export const FanFande_EXPERIMENTAL_LSP_TY = truthy("FanFande_EXPERIMENTAL_LSP_TY")
  export const FanFande_EXPERIMENTAL_LSP_TOOL = FanFande_EXPERIMENTAL || truthy("FanFande_EXPERIMENTAL_LSP_TOOL")
  export const FanFande_DEBUG_STREAM_STDOUT = truthy("FanFande_DEBUG_STREAM_STDOUT")
  export const FanFande_DISABLE_FILETIME_CHECK = truthy("FanFande_DISABLE_FILETIME_CHECK")
  export const FanFande_EXPERIMENTAL_PLAN_MODE = FanFande_EXPERIMENTAL || truthy("FanFande_EXPERIMENTAL_PLAN_MODE")
  export const FanFande_MODELS_URL = process.env["OPENCODE_MODELS_URL"]

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for FanFande_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "FanFande_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("FanFande_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for fanfande_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "fanfande_CONFIG_DIR", {
  get() {
    return process.env["fanfande_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})
