import z from "zod"
import * as db from "#database/Sqlite.ts"
import * as Identifier from "#id/id.ts"
import {
  SessionTaskListView,
  SessionTaskOwnerActivity,
  SessionTaskRecord,
  SessionTaskStatus,
  SessionTaskTeammateActivity,
  SessionTaskView,
  type SessionTaskPeer,
} from "#session/task-schema.ts"

export {
  SessionTaskListView,
  SessionTaskOwnerActivity,
  SessionTaskRecord,
  SessionTaskStatus,
  SessionTaskTeammateActivity,
  SessionTaskView,
}
export type {
  SessionTaskPeer,
}

export type TaskCreateInput = {
  id?: string
  subject: string
  description: string
  activeForm?: string
  owner?: string
  status?: SessionTaskStatus
  sortIndex?: number
  blocks?: string[]
  blockedBy?: string[]
  metadata?: Record<string, unknown>
}

export type TaskUpdateInput = {
  id: string
  subject?: string
  description?: string
  activeForm?: string
  owner?: string
  status?: SessionTaskStatus
  sortIndex?: number
  blocks?: string[]
  blockedBy?: string[]
  metadata?: Record<string, unknown>
}

export type TaskListOptions = {
  owner?: string
  status?: SessionTaskStatus
  includeCompleted?: boolean
}

export type TaskSource = {
  sourceAssistantMessageID?: string
  sourceUserMessageID?: string
  toolCallID?: string
}

const TABLE_NAME = "session_tasks"
const MinimalSubtaskRecord = z.object({
  id: z.string(),
  parentSessionID: z.string(),
  childSessionID: z.string().optional(),
  title: z.string(),
  agent: z.string(),
  status: z.string(),
  updatedAt: z.number().optional(),
})
let taskTablesGeneration = -1

function ensureTaskTables() {
  const generation = db.getDatabaseGeneration()
  if (taskTablesGeneration === generation && generation > 0) return

  if (!db.tableExists(TABLE_NAME)) {
    db.createTableByZodObject(TABLE_NAME, SessionTaskRecord)
  } else {
    db.syncTableColumnsWithZodObject(TABLE_NAME, SessionTaskRecord)
  }

  db.db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS "idx_session_tasks_session_id"
    ON "session_tasks" ("sessionID", "id");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_tasks_session_status"
    ON "session_tasks" ("sessionID", "status", "updatedAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_tasks_session_owner"
    ON "session_tasks" ("sessionID", "owner", "status", "updatedAt");
  `)
  db.db.run(`
    CREATE INDEX IF NOT EXISTS "idx_session_tasks_session_sort"
    ON "session_tasks" ("sessionID", "sortIndex", "createdAt");
  `)

  taskTablesGeneration = db.getDatabaseGeneration()
}

function normalizeText(value: string, field: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`Task ${field} must not be empty.`)
  }
  return trimmed
}

function normalizeOwner(owner: string | undefined, fallbackOwner: string) {
  return normalizeText(owner ?? fallbackOwner, "owner")
}

function normalizeIDList(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
}

function normalizeSortIndex(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback
}

function nextSortIndex(tasks: SessionTaskRecord[]) {
  if (tasks.length === 0) return 0
  return Math.max(tasks.length, ...tasks.map((task) => task.sortIndex + 1))
}

function compareTaskOrder(left: SessionTaskRecord, right: SessionTaskRecord) {
  if (left.sortIndex !== right.sortIndex) return left.sortIndex - right.sortIndex
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt
  return left.id.localeCompare(right.id)
}

function hasMeaningfulSortIndexes(tasks: SessionTaskRecord[]) {
  return new Set(tasks.map((task) => task.sortIndex)).size > 1
}

function sortTasksByDependencies(tasks: SessionTaskRecord[]) {
  const base = [...tasks].sort(compareTaskOrder)
  const tasksByID = new Map(base.map((task) => [task.id, task]))
  const baseIndex = new Map(base.map((task, index) => [task.id, index]))
  const incoming = new Map(base.map((task) => [task.id, 0]))
  const outgoing = new Map<string, string[]>()

  for (const task of base) {
    for (const sourceID of task.blockedBy) {
      if (!tasksByID.has(sourceID)) continue
      incoming.set(task.id, (incoming.get(task.id) ?? 0) + 1)
      const targets = outgoing.get(sourceID) ?? []
      targets.push(task.id)
      outgoing.set(sourceID, targets)
    }
  }

  const compareByBaseIndex = (left: SessionTaskRecord, right: SessionTaskRecord) =>
    (baseIndex.get(left.id) ?? 0) - (baseIndex.get(right.id) ?? 0)
  const queue = base
    .filter((task) => (incoming.get(task.id) ?? 0) === 0)
    .sort(compareByBaseIndex)
  const result: SessionTaskRecord[] = []

  while (queue.length > 0) {
    const task = queue.shift()!
    result.push(task)

    for (const targetID of outgoing.get(task.id) ?? []) {
      const nextIncoming = (incoming.get(targetID) ?? 0) - 1
      incoming.set(targetID, nextIncoming)
      if (nextIncoming === 0) {
        const target = tasksByID.get(targetID)
        if (target) {
          queue.push(target)
          queue.sort(compareByBaseIndex)
        }
      }
    }
  }

  if (result.length === base.length) return result

  const emitted = new Set(result.map((task) => task.id))
  return [...result, ...base.filter((task) => !emitted.has(task.id))]
}

function sortTasks(tasks: SessionTaskRecord[]) {
  const base = [...tasks].sort(compareTaskOrder)
  return hasMeaningfulSortIndexes(base) ? base : sortTasksByDependencies(base)
}

function taskPeer(task: SessionTaskRecord): SessionTaskPeer {
  return {
    id: task.id,
    subject: task.subject,
    status: task.status,
    owner: task.owner,
  }
}

function readStoredTasks(sessionID: string) {
  ensureTaskTables()
  return sortTasks(db.findManyWithSchema(TABLE_NAME, SessionTaskRecord, {
    where: [{ column: "sessionID", value: sessionID }],
    orderBy: [
      { column: "sortIndex", direction: "ASC" },
      { column: "createdAt", direction: "ASC" },
      { column: "id", direction: "ASC" },
    ],
  }))
}

function insertTask(record: SessionTaskRecord) {
  db.insertOneWithSchema(TABLE_NAME, record, SessionTaskRecord)
}

function updateTask(record: SessionTaskRecord) {
  db.updateManyWithSchema(
    TABLE_NAME,
    record,
    [
      { column: "sessionID", value: record.sessionID },
      { column: "id", value: record.id },
    ],
    SessionTaskRecord,
  )
}

function deleteSessionTasks(sessionID: string) {
  ensureTaskTables()
  if (!db.exists(TABLE_NAME, [{ column: "sessionID", value: sessionID }])) return 0
  return db.deleteMany(TABLE_NAME, [{ column: "sessionID", value: sessionID }])
}

function writeSessionTasks(sessionID: string, tasks: SessionTaskRecord[]) {
  ensureTaskTables()
  const commit = db.db.transaction((nextTasks: SessionTaskRecord[]) => {
    deleteSessionTasks(sessionID)
    for (const task of nextTasks) {
      insertTask(task)
    }
  })

  commit(sortTasks(tasks))
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) values.push(value)
}

function removeValue(values: string[], value: string) {
  return values.filter((item) => item !== value)
}

function assertReferencesExist(tasksByID: Map<string, SessionTaskRecord>) {
  for (const task of tasksByID.values()) {
    for (const id of [...task.blocks, ...task.blockedBy]) {
      if (!tasksByID.has(id)) {
        throw new Error(`Task '${task.id}' references missing task '${id}'.`)
      }
    }
  }
}

function assertNoSelfDependencies(tasks: SessionTaskRecord[]) {
  for (const task of tasks) {
    if (task.blocks.includes(task.id) || task.blockedBy.includes(task.id)) {
      throw new Error(`Task '${task.id}' cannot depend on itself.`)
    }
  }
}

function assertNoDependencyCycles(tasksByID: Map<string, SessionTaskRecord>) {
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (id: string, path: string[]) => {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      throw new Error(`Task dependency cycle detected: ${[...path, id].join(" -> ")}.`)
    }

    visiting.add(id)
    const task = tasksByID.get(id)
    for (const blockedBy of task?.blockedBy ?? []) {
      visit(blockedBy, [...path, id])
    }
    visiting.delete(id)
    visited.add(id)
  }

  for (const id of tasksByID.keys()) {
    visit(id, [])
  }
}

function assertOwnerActiveUniqueness(tasks: SessionTaskRecord[]) {
  const activeByOwner = new Map<string, string>()
  for (const task of tasks) {
    if (task.status !== "in_progress") continue
    const existing = activeByOwner.get(task.owner)
    if (existing) {
      throw new Error(`Owner '${task.owner}' already has in-progress task '${existing}'.`)
    }
    activeByOwner.set(task.owner, task.id)
  }
}

function assertInProgressDependenciesComplete(tasksByID: Map<string, SessionTaskRecord>) {
  for (const task of tasksByID.values()) {
    if (task.status !== "in_progress") continue
    const incomplete = task.blockedBy
      .map((id) => tasksByID.get(id))
      .filter((item): item is SessionTaskRecord => item !== undefined && item.status !== "completed")
    if (incomplete.length > 0) {
      throw new Error(
        `Task '${task.id}' is blocked by incomplete task(s): ${incomplete.map((item) => item.id).join(", ")}.`,
      )
    }
  }
}

function assertStatusTransition(previous: SessionTaskStatus, next: SessionTaskStatus, id: string) {
  if (previous === next) return
  if (previous === "pending" && next === "in_progress") return
  if (previous === "in_progress" && next === "completed") return

  throw new Error(`Task '${id}' cannot transition from '${previous}' to '${next}'.`)
}

function validateFinalTasks(tasks: SessionTaskRecord[]) {
  const tasksByID = new Map(tasks.map((task) => [task.id, task]))
  if (tasksByID.size !== tasks.length) {
    throw new Error("Task IDs must be unique within a session.")
  }

  assertReferencesExist(tasksByID)
  assertNoSelfDependencies(tasks)
  assertNoDependencyCycles(tasksByID)
  assertInProgressDependenciesComplete(tasksByID)
  assertOwnerActiveUniqueness(tasks)
}

function synchronizeAllReciprocalEdges(tasks: SessionTaskRecord[]) {
  const tasksByID = new Map(tasks.map((task) => [task.id, { ...task, blocks: [...task.blocks], blockedBy: [...task.blockedBy] }]))

  for (const task of tasksByID.values()) {
    for (const targetID of task.blocks) {
      const target = tasksByID.get(targetID)
      if (target) addUnique(target.blockedBy, task.id)
    }
    for (const sourceID of task.blockedBy) {
      const source = tasksByID.get(sourceID)
      if (source) addUnique(source.blocks, task.id)
    }
  }

  return sortTasks([...tasksByID.values()].map((task) => ({
    ...task,
    blocks: normalizeIDList(task.blocks),
    blockedBy: normalizeIDList(task.blockedBy),
  })))
}

function applyExplicitEdgeReplacement(
  tasksByID: Map<string, SessionTaskRecord>,
  taskID: string,
  update: {
    blocks?: string[]
    blockedBy?: string[]
  },
) {
  const task = tasksByID.get(taskID)
  if (!task) return

  if (update.blocks) {
    for (const item of tasksByID.values()) {
      item.blockedBy = removeValue(item.blockedBy, taskID)
    }
    task.blocks = update.blocks
    for (const targetID of update.blocks) {
      const target = tasksByID.get(targetID)
      if (target) addUnique(target.blockedBy, taskID)
    }
  }

  if (update.blockedBy) {
    for (const item of tasksByID.values()) {
      item.blocks = removeValue(item.blocks, taskID)
    }
    task.blockedBy = update.blockedBy
    for (const sourceID of update.blockedBy) {
      const source = tasksByID.get(sourceID)
      if (source) addUnique(source.blocks, taskID)
    }
  }
}

function toTaskView(task: SessionTaskRecord, tasksByID: Map<string, SessionTaskRecord>): SessionTaskView {
  const blockingTasks = task.blockedBy
    .map((id) => tasksByID.get(id))
    .filter((item): item is SessionTaskRecord => Boolean(item))
    .map(taskPeer)
  const blockedTasks = task.blocks
    .map((id) => tasksByID.get(id))
    .filter((item): item is SessionTaskRecord => Boolean(item))
    .map(taskPeer)

  return SessionTaskView.parse({
    ...task,
    isBlocked: task.status === "pending" && blockingTasks.some((item) => item.status !== "completed"),
    blockingTasks,
    blockedTasks,
  })
}

function nextForOwner(owner: string, tasks: SessionTaskView[]) {
  return tasks.find((task) => task.owner === owner && task.status === "pending" && !task.isBlocked)
}

function buildTeammateActivity(sessionID: string): SessionTaskTeammateActivity[] {
  if (!db.tableExists("subtasks")) return []
  return db.findManyWithSchema("subtasks", MinimalSubtaskRecord, {
    where: [{ column: "parentSessionID", value: sessionID }],
    orderBy: [
      { column: "updatedAt", direction: "DESC" },
      { column: "id", direction: "DESC" },
    ],
    limit: 12,
  }).map((subtask) =>
    SessionTaskTeammateActivity.parse({
      id: subtask.id,
      owner: subtask.agent,
      title: subtask.title,
      status: subtask.status,
      active: subtask.status === "running",
      childSessionID: subtask.childSessionID,
      updatedAt: subtask.updatedAt,
    }),
  )
}

function buildListView(
  sessionID: string,
  records: SessionTaskRecord[],
  options: TaskListOptions = {},
) {
  const tasksByID = new Map(records.map((task) => [task.id, task]))
  let tasks = sortTasks(records).map((task) => toTaskView(task, tasksByID))

  if (options.owner) {
    tasks = tasks.filter((task) => task.owner === options.owner)
  }
  if (options.status) {
    tasks = tasks.filter((task) => task.status === options.status)
  }
  if (options.includeCompleted === false) {
    tasks = tasks.filter((task) => task.status !== "completed")
  }

  const current = tasks.filter((task) => task.status === "in_progress")
  const owners = [...new Set(records.map((task) => task.owner))]
    .sort((left, right) => left.localeCompare(right))
    .map((owner) =>
      SessionTaskOwnerActivity.parse({
        owner,
        current: current.find((task) => task.owner === owner),
        next: nextForOwner(owner, tasks),
      }),
    )

  return SessionTaskListView.parse({
    sessionID,
    generatedAt: Date.now(),
    tasks,
    current,
    next: owners.map((owner) => owner.next).filter((task): task is SessionTaskView => Boolean(task)),
    blocked: tasks.filter((task) => task.isBlocked),
    owners,
    teammateActivity: buildTeammateActivity(sessionID),
    summary: {
      total: tasks.length,
      completed: tasks.filter((task) => task.status === "completed").length,
      pending: tasks.filter((task) => task.status === "pending").length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      blocked: tasks.filter((task) => task.isBlocked).length,
    },
  })
}

export function listSessionTasks(sessionID: string, options: TaskListOptions = {}) {
  return buildListView(sessionID, readStoredTasks(sessionID), options)
}

export function getSessionTask(sessionID: string, id: string) {
  const records = readStoredTasks(sessionID)
  const task = records.find((item) => item.id === id)
  if (!task) return null
  const tasksByID = new Map(records.map((item) => [item.id, item]))
  return toTaskView(task, tasksByID)
}

export function createSessionTasks(input: {
  sessionID: string
  tasks: TaskCreateInput[]
  defaultOwner: string
  source?: TaskSource
  now?: number
}) {
  const now = input.now ?? Date.now()
  const existing = readStoredTasks(input.sessionID)
  const tasksByID = new Map(existing.map((task) => [task.id, { ...task }]))
  const created: SessionTaskRecord[] = []
  const createdEdges: Array<{ id: string; blocks?: string[]; blockedBy?: string[] }> = []
  const baseSortIndex = nextSortIndex(existing)

  for (const [index, task] of input.tasks.entries()) {
    const id = task.id?.trim() || Identifier.ascending("task")
    if (tasksByID.has(id)) {
      throw new Error(`Task '${id}' already exists in this session.`)
    }

    const subject = normalizeText(task.subject, "subject")
    const status = task.status ?? "pending"
    const next = SessionTaskRecord.parse({
      id,
      sessionID: input.sessionID,
      subject,
      description: normalizeText(task.description, "description"),
      activeForm: normalizeText(task.activeForm ?? subject, "activeForm"),
      owner: normalizeOwner(task.owner, input.defaultOwner),
      status,
      sortIndex: normalizeSortIndex(task.sortIndex, baseSortIndex + index),
      blocks: normalizeIDList(task.blocks),
      blockedBy: normalizeIDList(task.blockedBy),
      metadata: task.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      startedAt: status === "in_progress" || status === "completed" ? now : undefined,
      completedAt: status === "completed" ? now : undefined,
      sourceAssistantMessageID: input.source?.sourceAssistantMessageID,
      sourceUserMessageID: input.source?.sourceUserMessageID,
      toolCallID: input.source?.toolCallID,
    })

    tasksByID.set(next.id, next)
    created.push(next)
    createdEdges.push({
      id: next.id,
      blocks: task.blocks ? [...next.blocks] : undefined,
      blockedBy: task.blockedBy ? [...next.blockedBy] : undefined,
    })
  }

  for (const edge of createdEdges) {
    applyExplicitEdgeReplacement(tasksByID, edge.id, {
      blocks: edge.blocks,
      blockedBy: edge.blockedBy,
    })
  }

  const finalTasks = synchronizeAllReciprocalEdges([...tasksByID.values()])
  validateFinalTasks(finalTasks)
  writeSessionTasks(input.sessionID, finalTasks)

  return {
    changedTaskIDs: created.map((task) => task.id),
    state: buildListView(input.sessionID, finalTasks),
    tasks: created.map((task) => getSessionTask(input.sessionID, task.id)).filter((task): task is SessionTaskView => Boolean(task)),
  }
}

export function updateSessionTask(input: {
  sessionID: string
  update: TaskUpdateInput
  source?: TaskSource
  now?: number
}) {
  const now = input.now ?? Date.now()
  const existing = readStoredTasks(input.sessionID)
  const current = existing.find((task) => task.id === input.update.id)
  if (!current) {
    throw new Error(`Task '${input.update.id}' was not found.`)
  }

  const nextStatus = input.update.status ?? current.status
  assertStatusTransition(current.status, nextStatus, current.id)

  const startedAt =
    current.startedAt ??
    (current.status === "pending" && nextStatus === "in_progress" ? now : undefined)
  const completedAt =
    current.completedAt ??
    (current.status === "in_progress" && nextStatus === "completed" ? now : undefined)

  const next = SessionTaskRecord.parse({
    ...current,
    subject: input.update.subject ? normalizeText(input.update.subject, "subject") : current.subject,
    description: input.update.description ? normalizeText(input.update.description, "description") : current.description,
    activeForm: input.update.activeForm ? normalizeText(input.update.activeForm, "activeForm") : current.activeForm,
    owner: input.update.owner ? normalizeOwner(input.update.owner, current.owner) : current.owner,
    status: nextStatus,
    sortIndex: normalizeSortIndex(input.update.sortIndex, current.sortIndex),
    blocks: input.update.blocks ? normalizeIDList(input.update.blocks) : current.blocks,
    blockedBy: input.update.blockedBy ? normalizeIDList(input.update.blockedBy) : current.blockedBy,
    metadata: input.update.metadata ?? current.metadata,
    updatedAt: now,
    startedAt,
    completedAt,
    sourceAssistantMessageID: input.source?.sourceAssistantMessageID ?? current.sourceAssistantMessageID,
    sourceUserMessageID: input.source?.sourceUserMessageID ?? current.sourceUserMessageID,
    toolCallID: input.source?.toolCallID ?? current.toolCallID,
  })

  const tasksByID = new Map(existing.map((task) => [task.id, { ...task, blocks: [...task.blocks], blockedBy: [...task.blockedBy] }]))
  tasksByID.set(next.id, next)
  applyExplicitEdgeReplacement(tasksByID, next.id, {
    blocks: input.update.blocks ? next.blocks : undefined,
    blockedBy: input.update.blockedBy ? next.blockedBy : undefined,
  })

  const finalTasks = synchronizeAllReciprocalEdges([...tasksByID.values()])
  validateFinalTasks(finalTasks)
  for (const task of finalTasks) {
    updateTask(task)
  }

  return {
    changedTaskIDs: [next.id],
    state: buildListView(input.sessionID, finalTasks),
    task: getSessionTask(input.sessionID, next.id),
  }
}

export function replaceTasksFromState(input: {
  sessionID: string
  state: SessionTaskListView
}) {
  const tasks = input.state.tasks.map((task) => SessionTaskRecord.parse({
    id: task.id,
    sessionID: input.sessionID,
    subject: task.subject,
    description: task.description,
    activeForm: task.activeForm,
    owner: task.owner,
    status: task.status,
    sortIndex: task.sortIndex,
    blocks: task.blocks,
    blockedBy: task.blockedBy,
    metadata: task.metadata,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    sourceAssistantMessageID: task.sourceAssistantMessageID,
    sourceUserMessageID: task.sourceUserMessageID,
    toolCallID: task.toolCallID,
  }))
  validateFinalTasks(tasks)
  writeSessionTasks(input.sessionID, tasks)
  return buildListView(input.sessionID, tasks)
}
