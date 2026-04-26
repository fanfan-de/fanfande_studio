import { spawn } from "node:child_process"

const AGENT_LOG_LEVELS = new Set(["DEBUG", "INFO", "WARN", "ERROR"])

function printHelp() {
  console.log(`Usage: npm run dev -- [options]

Options:
  --agent-log-level <level>    Filter managed agent logs: DEBUG, INFO, WARN, ERROR.
  --agent-log-level=<level>    Same as above.
  --help                      Show this help.
`)
}

function configureAgentLogging(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    }

    let level
    if (arg === "--agent-log-level") {
      level = args[index + 1]
      index += 1
    } else if (arg.startsWith("--agent-log-level=")) {
      level = arg.slice("--agent-log-level=".length)
    } else {
      continue
    }

    const normalizedLevel = level?.trim().toUpperCase()
    if (!normalizedLevel || !AGENT_LOG_LEVELS.has(normalizedLevel)) {
      console.error(`Invalid --agent-log-level value: ${level ?? ""}`)
      console.error("Expected one of: DEBUG, INFO, WARN, ERROR")
      process.exit(1)
    }

    process.env.FanFande_LOG_LEVEL = normalizedLevel
  }
}

configureAgentLogging(process.argv.slice(2))

const command =
  process.platform === "win32"
    ? {
        file: "cmd.exe",
        args: ["/d", "/s", "/c", "chcp 65001 > nul && electron-vite dev"],
      }
    : {
        file: "electron-vite",
        args: ["dev"],
      }

const child = spawn(command.file, command.args, {
  stdio: "inherit",
  shell: false,
  windowsHide: false,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on("error", (error) => {
  console.error(error)
  process.exit(1)
})
