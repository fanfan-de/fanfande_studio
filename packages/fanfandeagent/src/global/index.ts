import fs from "fs/promises"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import path from "path"
import os from "os"


// 应用名称
const app : string = "opencode"

// 拼接出应用专属的系统路径
// Global paths: {
//   data: "C:\\Users\\wb.xuedengwen\\.local\\share\\opencode",
//   cache: "C:\\Users\\wb.xuedengwen\\.cache\\opencode",
//   config: "C:\\Users\\wb.xuedengwen\\.config\\opencode",
//   state: "C:\\Users\\wb.xuedengwen\\.local\\state\\opencode",
// }
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)
const config = path.join(xdgConfig!, app)
const state = path.join(xdgState!, app)

/*
Global paths: {
  home: [Getter],
  data: "C:\\Users\\wb.xuedengwen\\.local\\share\\opencode",
  bin: "C:\\Users\\wb.xuedengwen\\.local\\share\\opencode\\bin",
  log: "C:\\Users\\wb.xuedengwen\\.local\\share\\opencode\\log",
  cache: "C:\\Users\\wb.xuedengwen\\.cache\\opencode",
  config: "C:\\Users\\wb.xuedengwen\\.config\\opencode",
  state: "C:\\Users\\wb.xuedengwen\\.local\\state\\opencode",
}
*/ 

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    data,
    bin: path.join(data, "bin"),
    log: path.join(data, "log"),
    cache,
    config,
    state,
  }
}



//自动初始化目录 (Top-level Await)
await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
])

const CACHE_VERSION = "18"

// 1. 读取磁盘上的旧版本号，如果文件不存在，默认当作版本 "0"
const version = await Bun.file(path.join(Global.Path.cache, "version"))
  .text()
  .catch(() => "0")

// 2. 检查版本是否匹配，版本不匹配（说明代码更新了），清空整个缓存目录
if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  // 3. 将当前版本号写入磁盘
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
