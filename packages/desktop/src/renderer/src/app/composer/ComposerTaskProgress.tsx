import type { SessionTaskListView, SessionTaskSummary } from "../types"

function getTaskDisplayText(task: SessionTaskSummary) {
  if (task.status === "in_progress") return task.activeForm || task.subject
  return task.subject
}

function getTaskStatusLabel(task: SessionTaskSummary) {
  if (task.status === "completed") return "已完成"
  if (task.status === "in_progress") return "进行中"
  if (task.isBlocked) return "阻塞"
  return "待处理"
}

function getTaskStatusClassName(task: SessionTaskSummary) {
  if (task.status === "in_progress") return "is-running"
  if (task.status === "completed") return "is-completed"
  if (task.isBlocked) return "is-blocked"
  return "is-pending"
}

function isTaskListComplete(tasks: SessionTaskListView) {
  return (
    tasks.summary.total > 0 &&
    tasks.summary.completed >= tasks.summary.total &&
    tasks.summary.inProgress === 0 &&
    tasks.summary.pending === 0 &&
    tasks.summary.blocked === 0
  )
}

export function ComposerTaskProgress({ tasks }: { tasks?: SessionTaskListView | null }) {
  if (!tasks || tasks.summary.total === 0 || isTaskListComplete(tasks)) return null

  return (
    <section className="composer-task-progress" aria-label="任务进度">
      <div className="composer-task-progress-header">
        <span className="composer-task-progress-summary">
          共 {tasks.summary.total} 个任务，已经完成 {tasks.summary.completed} 个
        </span>
        {tasks.current[0] ? (
          <span className="composer-task-progress-active">{tasks.current[0].owner}</span>
        ) : null}
      </div>
      <ol className="composer-task-progress-list">
        {tasks.tasks.map((task, index) => (
          <li key={task.id} className={`composer-task-progress-row ${getTaskStatusClassName(task)}`}>
            <span className="composer-task-progress-marker" aria-hidden="true" />
            <span className="composer-task-progress-copy">
              <span className="composer-task-progress-index">{index + 1}.</span>
              <span className="composer-task-progress-title">{getTaskDisplayText(task)}</span>
            </span>
            <span className="composer-task-progress-status">{getTaskStatusLabel(task)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
