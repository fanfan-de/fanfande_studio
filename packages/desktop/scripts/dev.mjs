import { spawn } from "node:child_process"

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
