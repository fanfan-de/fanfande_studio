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

const MAX_LOG_BUFFER_SIZE = 1000
const SENSITIVE_KEY_PATTERN = /(password|token|api[_-]?key|authorization|secret|credential|bearer)/i

export interface LogEntry {
  id: string
  timestamp: number
  level: Level
  service?: string
  message: string
  raw: string
  requestId?: string
  sessionID?: string
  projectID?: string
  extra?: Record<string, unknown>
}

export interface LogQuery {
  level?: Level | string
  service?: string
  q?: string
  limit?: number
}

type LogSubscriber = (entry: LogEntry) => void

const logEntries: LogEntry[] = []
const logSubscribers = new Set<LogSubscriber>()
let logSequence = 0

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function redactForLog(
  value: unknown,
  key = "",
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[REDACTED]"
  if (value instanceof Error) {
    return {
      name: value.name,
      message: formatError(value),
    }
  }
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "function") return "[Function]"
  if (!value || typeof value !== "object") return value
  if (depth >= 6) return "[Truncated]"

  if (seen.has(value)) return "[Circular]"
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, key, depth + 1, seen))
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
      childKey,
      redactForLog(childValue, childKey, depth + 1, seen),
    ]),
  )
}

function stringifyLogValue(key: string, value: unknown) {
  const redacted = redactForLog(value, key)
  if (typeof redacted === "string") return redacted
  if (typeof redacted === "number" || typeof redacted === "boolean") return String(redacted)
  if (redacted === undefined) return "undefined"
  if (redacted === null) return "null"

  try {
    return JSON.stringify(redacted)
  } catch {
    return String(redacted)
  }
}

function stringifyMessage(message: unknown) {
  if (message === undefined || message === null) return ""
  if (typeof message === "string") return message
  if (message instanceof Error) return formatError(message)
  return stringifyLogValue("message", message)
}

function sanitizeExtra(extra: Record<string, unknown>) {
  const sanitized = redactForLog(extra)
  return isRecord(sanitized) ? sanitized : {}
}

function normalizeLevelFilter(levelFilter: Level | string | undefined) {
  if (!levelFilter) return undefined
  const parsed = Level.safeParse(String(levelFilter).trim().toUpperCase())
  return parsed.success ? parsed.data : undefined
}

function normalizeSearch(value: string | undefined) {
  const trimmed = value?.trim().toLowerCase()
  return trimmed || undefined
}

function normalizeLimit(limit: number | undefined, fallback: number, max: number) {
  if (!Number.isInteger(limit) || !limit || limit <= 0) return fallback
  return Math.min(limit, max)
}

export function matches(entry: LogEntry, query: Omit<LogQuery, "limit"> = {}) {
  const levelFilter = normalizeLevelFilter(query.level)
  if (levelFilter && entry.level !== levelFilter) return false

  const serviceFilter = query.service?.trim().toLowerCase()
  if (serviceFilter && entry.service?.toLowerCase() !== serviceFilter) return false

  const search = normalizeSearch(query.q)
  if (!search) return true

  const haystack = [
    entry.raw,
    entry.message,
    entry.service,
    entry.requestId,
    entry.sessionID,
    entry.projectID,
    entry.extra ? JSON.stringify(entry.extra) : undefined,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase()

  return haystack.includes(search)
}

export function list(query: LogQuery = {}) {
  const limit = normalizeLimit(query.limit, 200, MAX_LOG_BUFFER_SIZE)
  return logEntries
    .filter((entry) => matches(entry, query))
    .slice(-limit)
}

export function subscribe(subscriber: LogSubscriber) {
  logSubscribers.add(subscriber)
  return () => {
    logSubscribers.delete(subscriber)
  }
}

function appendLogEntry(entry: LogEntry) {
  logEntries.push(entry)
  if (logEntries.length > MAX_LOG_BUFFER_SIZE) {
    logEntries.splice(0, logEntries.length - MAX_LOG_BUFFER_SIZE)
  }

  for (const subscriber of [...logSubscribers]) {
    try {
      subscriber(entry)
    } catch {
      // Ignore subscriber failures so logging cannot break the server path.
    }
  }
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
  function build(levelName: Level, message: any, extra?: Record<string, any>) {
    // 1. 合并初始化时的 tags 和当前调用的 extra
    const merged = {
      ...tags,
      ...extra,
    } as Record<string, unknown>
    const sanitizedExtra = sanitizeExtra(merged)
    const prefix = Object.entries(sanitizedExtra)
      .filter(([_, value]) => value !== undefined && value !== null)
      .map(([key, value]) => {
        return `${key}=${stringifyLogValue(key, value)}`
      })
      .join(" ")
    const next = new Date()
    const timestamp = next.getTime()
    // 2. 计算时间差 (与上一条日志的间隔，用于性能分析)
    const diff = timestamp - last
    last = timestamp
    const messageText = stringifyMessage(message)
    // 3. 拼接：[时间] [+距离上次毫秒数] [标签键值对] [消息内容]
    const body = [next.toISOString().split(".")[0], "+" + diff + "ms", prefix, messageText].filter(Boolean).join(" ") + "\n"
    const line = `${levelName.padEnd(5)} ${body}`
    const service = typeof sanitizedExtra.service === "string" ? sanitizedExtra.service : undefined
    const requestId = typeof sanitizedExtra.requestId === "string" ? sanitizedExtra.requestId : undefined
    const sessionID = typeof sanitizedExtra.sessionID === "string" ? sanitizedExtra.sessionID : undefined
    const projectID = typeof sanitizedExtra.projectID === "string" ? sanitizedExtra.projectID : undefined

    return {
      line,
      entry: {
        id: `log_${++logSequence}`,
        timestamp,
        level: levelName,
        service,
        message: messageText,
        raw: line.trimEnd(),
        requestId,
        sessionID,
        projectID,
        extra: Object.keys(sanitizedExtra).length > 0 ? sanitizedExtra : undefined,
      } satisfies LogEntry,
    }
  }

  function emit(levelName: Level, message?: any, extra?: Record<string, any>) {
    if (!shouldLog(levelName)) return
    const { entry, line } = build(levelName, message, extra)
    appendLogEntry(entry)
    // 杩欓噷鐨?write 鍙兘鏄?console 鎴栬€呮槸 file writer
    write(line)
  }

  //实现 Logger 接口
  const result: Logger = {
    debug(message?: any, extra?: Record<string, any>) {
      if (shouldLog("DEBUG")) {
        // 这里的 write 可能是 console 或者是 file writer
        emit("DEBUG", message, extra)
      }
    },
    info(message?: any, extra?: Record<string, any>) {
      if (shouldLog("INFO")) {
        emit("INFO", message, extra)
      }
    },
    error(message?: any, extra?: Record<string, any>) {
      if (shouldLog("ERROR")) {
        emit("ERROR", message, extra)
      }
    },
    warn(message?: any, extra?: Record<string, any>) {
      if (shouldLog("WARN")) {
        emit("WARN", message, extra)
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
