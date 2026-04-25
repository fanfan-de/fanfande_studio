// 这个 `Log` 模块的构建思路清晰且高效：
// 1.  **结构化**：强制使用 KV 键值对（`tags`, `extra`），方便日志解析系统（如 ELK, Loki）处理。
// 2.  **高性能**：
//     *   利用闭包缓存上下文。
//     *   在 Bun 环境下使用原生 Writer。
//     *   `last` 时间差计算非常轻量。
// 3.  **灵活性**：
//     *   支持 `Options` 配置切换开发模式（Console）和生产模式（File）。
//     *   `init` 延迟初始化允许应用启动后再配置日志路径。
// 4.  **现代特性**：使用了 Zod 进行校验，TS 类型推导，以及 `Symbol.dispose` 资源管理。
import path from "path"
import fs from "fs/promises"
import * as Global from "#global/global.ts"
import z from "zod"

//类型空间和值空间是隔离的
export const Level = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).meta({ ref: "LogLevel", description: "Log level" })// Zod **Schema
export type Level = z.infer<typeof Level>

const levelPriority: Record<Level, number> = {
  "DEBUG": 0,
  "INFO": 1,
  "WARN": 2,
  "ERROR": 3,
}



//通过比较数字大小来实现日志过滤（例如设置为 `WARN` (2) 时，`INFO` (1) 就不会输出）。
let level: Level = "INFO"
function shouldLog(input: Level): boolean {
  return levelPriority[input] >= levelPriority[level]
}

export type Logger = {
  debug(message?: any, extra?: Record<string, any>): void
  info(message?: any, extra?: Record<string, any>): void
  error(message?: any, extra?: Record<string, any>): void
  warn(message?: any, extra?: Record<string, any>): void
  tag(key: string, value: string): Logger
  clone(): Logger
  time(
    message: string,
    extra?: Record<string, any>,
  ): {
    stop(): void
    [Symbol.dispose](): void
  }
}

const loggers = new Map<string, Logger>()

export const Default = create({ service: "default" })

export interface Options {
  print: boolean
  file?: boolean
  dev?: boolean
  level?: Level
}

let logpath = ""
export function file() {
  return logpath
}
type Writer = (msg: any) => void

const defaultWriter: Writer = (msg) => {
  process.stderr.write(msg)
}

let writers: Writer[] = [defaultWriter]
let loggerStatus = {
  level: level as Level,
  print: true,
  file: false,
}

function write(msg: any) {
  for (const current of writers) {
    current(msg)
  }
}

export function status() {
  return {
    level: loggerStatus.level,
    print: loggerStatus.print,
    file: loggerStatus.file,
    path: logpath || null,
  }
}

//初始化log系统
export async function init(options: Options) {
  // 设置全局级别
  if (options.level) level = options.level
  const enableFile = options.file ?? !options.print
  const enablePrint = options.print || !enableFile

  const nextWriters: Writer[] = []
  if (enablePrint) {
    nextWriters.push(defaultWriter)
  }

  logpath = ""
  if (enableFile) {
    await cleanup(Global.Path.log)// 清理旧日志
    logpath = path.join(
      Global.Path.log,
      options.dev ? "dev.log" : new Date().toISOString().split(".")[0]!.replace(/:/g, "") + ".log",
    )
    // 核心：使用 Bun 的高性能文件 API
    const logfile = Bun.file(logpath)
    await fs.truncate(logpath).catch(() => { })
    const writer = logfile.writer()
    nextWriters.push((msg: any) => {
      writer.write(msg)
      writer.flush()
    })
  }

  writers = nextWriters.length > 0 ? nextWriters : [defaultWriter]
  loggerStatus = {
    level,
    print: enablePrint,
    file: enableFile,
  }
}
//`cleanup` 函数负责维护日志目录的清洁，防止磁盘被日志填满。
async function cleanup(dir: string) {
  // 使用 Bun.Glob 扫描匹配格式的日志文件
  const glob = new Bun.Glob("????-??-??T??????.log")
  // ... 获取所有文件 ...
  const files = await Array.fromAsync(
    glob.scan({
      cwd: dir,
      absolute: true,
    }),
  )
  // 保留策略：如果文件少于等于5个，不处理
  if (files.length <= 5) return
  // 删除策略：files.slice(0, -10) 意味着保留最后10个文件，删除其余的（最旧的）。
  // 注意：这里假设 glob 扫描返回的文件名是按时间排序的（ISO 格式通常如此）。
  const filesToDelete = files.slice(0, -10)
  await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => { })))
}

function formatError(error: Error, depth = 0): string {
  const result = error.message
  return error.cause instanceof Error && depth < 10
    ? result + " Caused by: " + formatError(error.cause, depth + 1)
    : result
}

let last = Date.now()
//`create` 函数是用户获取 Logger 实例的入口，它使用了**闭包**来维护每个 Logger 独有的 `tags`（上下文信息）。
export function create(tags?: Record<string, any>) {
  tags = tags || {}
  // 如果指定了 service 名称，则尝试从缓存中获取，实现单例复用
  const service = tags["service"]
  if (service && typeof service === "string") {
    const cached = loggers.get(service)
    if (cached) {
      return cached
    }
  }
  // 格式化构建 (`build`)
  function build(message: any, extra?: Record<string, any>) {
    // 1. 合并初始化时的 tags 和当前调用的 extra
    const prefix = Object.entries({
      ...tags,
      ...extra,
    })
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        const prefix = `${key}=`
        if (value instanceof Error) return prefix + formatError(value)
        if (typeof value === "object") return prefix + JSON.stringify(value)
        return prefix + value
      })
      .join(" ")
    const next = new Date()
    // 2. 计算时间差 (与上一条日志的间隔，用于性能分析)
    const diff = next.getTime() - last
    last = next.getTime()
    // 3. 拼接：[时间] [+距离上次毫秒数] [标签键值对] [消息内容]
    return [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, message].filter(Boolean).join(" ") + "\n"
  }

  //实现 Logger 接口
  const result: Logger = {
    debug(message?: any, extra?: Record<string, any>) {
      if (shouldLog("DEBUG")) {
        // 这里的 write 可能是 console 或者是 file writer
        write("DEBUG " + build(message, extra))
      }
    },
    info(message?: any, extra?: Record<string, any>) {
      if (shouldLog("INFO")) {
        write("INFO  " + build(message, extra))
      }
    },
    error(message?: any, extra?: Record<string, any>) {
      if (shouldLog("ERROR")) {
        write("ERROR " + build(message, extra))
      }
    },
    warn(message?: any, extra?: Record<string, any>) {
      if (shouldLog("WARN")) {
        write("WARN  " + build(message, extra))
      }
    },
    // 链式调用：修改当前闭包内的 tags
    tag(key: string, value: string) {
      if (tags) tags[key] = value
      return result
    },
    // 克隆：创建一个新的 Logger 实例，复制当前 tags
    clone() {
      return create({ ...tags })
    },
    time(message: string, extra?: Record<string, any>) {
      const now = Date.now()
      result.info(message, { status: "started", ...extra })
      function stop() {
        // 记录结束，并计算 duration
        result.info(message, {
          status: "completed",
          duration: Date.now() - now,
          ...extra,
        })
      }
      return {
        stop,
        // 支持 `using` 语法，离开作用域自动停止计时
        [Symbol.dispose]() {
          stop()
        },
      }
    },
  }

  if (service && typeof service === "string") {
    loggers.set(service, result)
  }

  return result
}
