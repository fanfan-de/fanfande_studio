import whichPkg from "which"
/**
 * 精准地在 PATH 环境变量定义的那些文件夹中依次查找，看哪个文件夹里包含这个文件
 * @param env 
 * @param cmd 
 * @returns 
 */
export function which(cmd: string, env?: NodeJS.ProcessEnv) {
  const result = whichPkg.sync(cmd, {
    nothrow: true,
    path: env?.PATH ?? env?.Path ?? process.env.PATH ?? process.env.Path,
    pathExt: env?.PATHEXT ?? env?.PathExt ?? process.env.PATHEXT ?? process.env.PathExt,
  })
  return typeof result === "string" ? result : null
}

//测试
//console.log(which("git"))
