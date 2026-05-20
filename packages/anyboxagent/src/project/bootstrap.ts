import * as Log from "#util/log.ts"
import * as Project from "#project/project.ts"

const log = Log.create({ service: "project.bootstrap" })

/**
 * 目录实例首次创建后的初始化钩子。
 * 先只做最小初始化：
 * - 记录 project 已初始化时间
 * - 保证内存里的 project 和数据库状态一致
 */
export async function InstanceBootstrap(input: {
  directory: string
  worktree: string
  project: Project.ProjectInfo
}) {
  const initialized = input.project.initialized ?? Date.now()
  input.project.initialized = initialized

  log.info("instance bootstrap", {
    directory: input.directory,
    worktree: input.worktree,
    projectID: input.project.id,
    initialized,
  })

  await Project.setInitialized(input.project.id)
}
