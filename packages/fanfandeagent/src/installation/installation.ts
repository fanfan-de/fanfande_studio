import * as BusEvent from "#bus/bus-event.ts"
import path from "path"
import { $ } from "bun"// Bun 提供的 Shell 操作符，用于执行终端命令
import z from "zod"
import { NamedError } from "#util/error.ts"
import * as Log  from "#util/log.ts"
import { iife } from "#util/iife.ts"
import { Flag } from "#flag/flag.ts"



//声明全局变量（通常由构建工具如 Rspack/Vite 在编译时注入）
declare global {
    const OPENCODE_VERSION: string
    const OPENCODE_CHANNEL: string
}


const log = Log.create({ service: "installation" })

export type Method = Awaited<ReturnType<typeof method>>

/**
 * 定义事件总线：用于在应用内部广播“更新可用”或“更新完成”的消息
 */
export const Event = {
    Updated: BusEvent.define(
        "installation.updated",
        z.object({
            version: z.string(),
        }),
    ),
    UpdateAvailable: BusEvent.define(
        "installation.update-available",
        z.object({
            version: z.string(),
        }),
    ),
}
// 使用 Zod 定义版本信息的数据结构，并导出类型
export const Info = z
    .object({
        version: z.string(),
        latest: z.string(),
    })
    .meta({
        ref: "InstallationInfo",
    })
export type Info = z.infer<typeof Info>
/**
 * 获取版本汇总信息
 */
export async function info() {
    return {
        version: VERSION,
        latest: await latest(),
    }
}
// 环境判断辅助函数
export function isPreview() {
    return CHANNEL !== "latest"
}

export function isLocal() {
    return CHANNEL === "local"
}
/**
 * 【核心逻辑 1】自动检测安装方式
 * 原理：检查执行路径并尝试运行各个包管理器的列表命令，看 opencode 存在于哪个列表里
 */
export async function method() {
    // 1. 优先通过路径判断是否是 curl 下载的二进制文件
    if (process.execPath.includes(path.join(".opencode", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"

    const exec = process.execPath.toLowerCase()

    const checks = [
        {
            name: "npm" as const,
            command: () => $`npm list -g --depth=0`.throws(false).quiet().text(),
        },
        {
            name: "yarn" as const,
            command: () => $`yarn global list`.throws(false).quiet().text(),
        },
        {
            name: "pnpm" as const,
            command: () => $`pnpm list -g --depth=0`.throws(false).quiet().text(),
        },
        {
            name: "bun" as const,
            command: () => $`bun pm ls -g`.throws(false).quiet().text(),
        },
        {
            name: "brew" as const,
            command: () => $`brew list --formula opencode`.throws(false).quiet().text(),
        },
        {
            name: "scoop" as const,
            command: () => $`scoop list opencode`.throws(false).quiet().text(),
        },
        {
            name: "choco" as const,
            command: () => $`choco list --limit-output opencode`.throws(false).quiet().text(),
        },
    ]

    checks.sort((a, b) => {
        const aMatches = exec.includes(a.name)
        const bMatches = exec.includes(b.name)
        if (aMatches && !bMatches) return -1
        if (!aMatches && bMatches) return 1
        return 0
    })

    for (const check of checks) {
        const output = await check.command()
        const installedName =
            check.name === "brew" || check.name === "choco" || check.name === "scoop" ? "opencode" : "opencode-ai"
        if (output.includes(installedName)) {
            return check.name
        }
    }

    return "unknown"
}

/**
* 升级失败的自定义异常
*/
export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
        stderr: z.string(),
    }),
)
/**
 * 针对 Homebrew 的特殊处理：判断是官方仓库还是私有 tap 仓库
 */
async function getBrewFormula() {
    const tapFormula = await $`brew list --formula anomalyco/tap/opencode`.throws(false).quiet().text()
    if (tapFormula.includes("opencode")) return "anomalyco/tap/opencode"
    const coreFormula = await $`brew list --formula opencode`.throws(false).quiet().text()
    if (coreFormula.includes("opencode")) return "opencode"
    return "opencode"
}

/**
* 【核心逻辑 2】执行升级操作
* 根据检测到的 method，调用对应的命令行指令进行升级
*/
export async function upgrade(method: Method, target: string) {
    let cmd
    switch (method) {
        case "curl":
            // 重新运行安装脚本，并通过环境变量注入版本号
            cmd = $`curl -fsSL https://opencode.ai/install | bash`.env({
                ...process.env,
                VERSION: target,
            })
            break
        case "npm":
            cmd = $`npm install -g opencode-ai@${target}`
            break
        case "pnpm":
            cmd = $`pnpm install -g opencode-ai@${target}`
            break
        case "bun":
            cmd = $`bun install -g opencode-ai@${target}`
            break
        case "brew": {
            const formula = await getBrewFormula()
            cmd = $`brew upgrade ${formula}`.env({
                HOMEBREW_NO_AUTO_UPDATE: "1",
                ...process.env,
            })
            break
        }
        case "choco":
            cmd = $`echo Y | choco upgrade opencode --version=${target}`
            break
        case "scoop":
            cmd = $`scoop install opencode@${target}`
            break
        default:
            throw new Error(`Unknown method: ${method}`)
    }
    //执行命令并处理错误
    const result = await cmd.quiet().throws(false)
    if (result.exitCode !== 0) {
        const stderr = method === "choco" ? "not running from an elevated command shell" : result.stderr.toString("utf8")
        throw new UpgradeFailedError({
            stderr: stderr,
        })
    }
    log.info("upgraded", {
        method,
        target,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
    })

    // 升级后执行一次版本查看，确保新版本已生效
    await $`${process.execPath} --version`.nothrow().quiet().text()
}

// 基础变量设置
export const VERSION = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const CHANNEL = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const USER_AGENT = `opencode/${CHANNEL}/${VERSION}/${Flag.FanFande_CLIENT}`

/**
 * 【核心逻辑 3】从远程仓库获取最新版本号
 * 会根据不同的安装方式去不同的“源”查询
 */
export async function latest(installMethod?: Method) {
    const detectedMethod = installMethod || (await method())
    // 1. 如果是 Homebrew，去 brew 的官方 API 查
    if (detectedMethod === "brew") {
        const formula = await getBrewFormula()
        if (formula === "opencode") {
            return fetch("https://formulae.brew.sh/api/formula/opencode.json")
                .then((res) => {
                    if (!res.ok) throw new Error(res.statusText)
                    return res.json()
                })
                .then((data: any) => data.versions.stable)
        }
    }
    // 2. 如果是 Node 系工具，去 NPM Registry 查
    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
        const registry = await iife(async () => {
            const r = (await $`npm config get registry`.quiet().nothrow().text()).trim()
            const reg = r || "https://registry.npmjs.org"
            return reg.endsWith("/") ? reg.slice(0, -1) : reg
        })
        const channel = CHANNEL
        // 根据 CHANNEL (latest/preview) 获取对应的 tag 版本
        return fetch(`${registry}/opencode-ai/${channel}`)
            .then((res) => {
                if (!res.ok) throw new Error(res.statusText)
                return res.json()
            })
            .then((data: any) => data.version)
    }
    // 3. Windows Chocolatey
    if (detectedMethod === "choco") {
        return fetch(
            "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27opencode%27%20and%20IsLatestVersion&$select=Version",
            { headers: { Accept: "application/json;odata=verbose" } },
        )
            .then((res) => {
                if (!res.ok) throw new Error(res.statusText)
                return res.json()
            })
            .then((data: any) => data.d.results[0].Version)
    }
    // 4. Windows Scoop
    if (detectedMethod === "scoop") {
        return fetch("https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/opencode.json", {
            headers: { Accept: "application/json" },
        })
            .then((res) => {
                if (!res.ok) throw new Error(res.statusText)
                return res.json()
            })
            .then((data: any) => data.version)
    }
    // 5. 默认方案：从 GitHub Releases 获取最新 Tag
    return fetch("https://api.github.com/repos/anomalyco/opencode/releases/latest")
        .then((res) => {
            if (!res.ok) throw new Error(res.statusText)
            return res.json()
        })
        .then((data: any) => data.tag_name.replace(/^v/, ""))
}
