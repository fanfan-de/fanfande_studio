import { afterEach, expect, test } from "bun:test"
import "./sqlite.cleanup.ts"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createServerApp } from "#server/server.ts"
import * as Sqlite from "#database/Sqlite.ts"
import * as EventStore from "#session/event-store.ts"
import * as RuntimeEvent from "#session/runtime-event.ts"
import * as Session from "#session/session.ts"
import * as Task from "#session/task.ts"
import { TaskCreateTool, TaskListTool, TaskUpdateTool } from "#tool/task-tools.ts"

const tempRoots: string[] = []

async function useTempDatabase(name: string) {
  const root = await mkdtemp(path.join(tmpdir(), `fanfande-${name}-`))
  tempRoots.push(root)
  Sqlite.setDatabaseFile(path.join(root, "agent-test.db"))
  return root
}

afterEach(async () => {
  Sqlite.closeDatabase()
  Sqlite.setDatabaseFile(undefined)
  for (const root of tempRoots.splice(0)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await rm(root, { recursive: true, force: true })
        break
      } catch (error) {
        if (attempt === 4) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
    }
  }
})

async function createSession() {
  return await Session.createSession({
    directory: process.cwd(),
    projectID: "project_task_progress",
    title: "Task progress",
  })
}

function toolContext(sessionID: string) {
  return {
    sessionID,
    messageID: "msg_task_progress",
    toolCallID: "toolcall_task_progress",
  }
}

test("TaskCreate, TaskList, and TaskUpdate persist session-scoped task state", async () => {
  await useTempDatabase("task-basic")
  const session = await createSession()
  const createRuntime = await TaskCreateTool.init({ agent: { name: "default", mode: "primary", options: {} } })
  const updateRuntime = await TaskUpdateTool.init()
  const listRuntime = await TaskListTool.init()

  await createRuntime.execute(
    {
      tasks: [
        {
          id: "1",
          subject: "Inspect code",
          description: "Inspect the existing task implementation.",
          activeForm: "Inspecting code",
          status: "in_progress",
          blocks: ["2"],
        },
        {
          id: "2",
          subject: "Run tests",
          description: "Run the task-progress tests.",
          activeForm: "Running tests",
          blockedBy: ["1"],
        },
      ],
    },
    toolContext(session.id),
  )

  await updateRuntime.execute(
    {
      id: "1",
      status: "completed",
    },
    toolContext(session.id),
  )
  await updateRuntime.execute(
    {
      id: "2",
      status: "in_progress",
    },
    toolContext(session.id),
  )

  const listed = await listRuntime.execute({}, toolContext(session.id))
  const state = Task.SessionTaskListView.parse(listed.data)

  expect(state.summary.completed).toBe(1)
  expect(state.current[0]?.id).toBe("2")
  expect(state.tasks.find((task) => task.id === "1")?.blocks).toEqual(["2"])
  expect(state.tasks.find((task) => task.id === "2")?.blockedBy).toEqual(["1"])

  Sqlite.closeDatabase()

  const restored = Task.listSessionTasks(session.id)
  expect(restored.current[0]?.id).toBe("2")
  expect(restored.summary.total).toBe(2)
})

test("tasks are isolated per session", async () => {
  await useTempDatabase("task-session-isolation")
  const first = await createSession()
  const second = await createSession()

  Task.createSessionTasks({
    sessionID: first.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "1",
        subject: "First",
        description: "First session task",
      },
    ],
  })
  Task.createSessionTasks({
    sessionID: second.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "1",
        subject: "Second",
        description: "Second session task",
      },
    ],
  })

  expect(Task.getSessionTask(first.id, "1")?.subject).toBe("First")
  expect(Task.getSessionTask(second.id, "1")?.subject).toBe("Second")
})

test("task lists preserve explicit creation order instead of sorting by generated or custom ids", async () => {
  await useTempDatabase("task-order")
  const session = await createSession()

  const result = Task.createSessionTasks({
    sessionID: session.id,
    defaultOwner: "default",
    now: 100,
    tasks: [
      {
        id: "z",
        subject: "Project initialization",
        description: "Create files and baseline structure.",
      },
      {
        id: "a",
        subject: "HTML structure",
        description: "Build the game surface.",
        blockedBy: ["z"],
      },
      {
        id: "m",
        subject: "CSS styling",
        description: "Style the game surface.",
        blockedBy: ["a"],
      },
    ],
  })

  expect(result.state.tasks.map((task) => task.id)).toEqual(["z", "a", "m"])
  expect(result.state.tasks.map((task) => task.sortIndex)).toEqual([0, 1, 2])
  expect(Task.listSessionTasks(session.id).tasks.map((task) => task.id)).toEqual(["z", "a", "m"])
})

test("legacy task states with identical sort indexes fall back to dependency order", async () => {
  await useTempDatabase("task-legacy-order")
  const session = await createSession()

  Task.replaceTasksFromState({
    sessionID: session.id,
    state: {
      sessionID: session.id,
      generatedAt: 100,
      tasks: [
        {
          id: "second",
          sessionID: session.id,
          subject: "Second",
          description: "Second",
          activeForm: "Second",
          owner: "default",
          status: "pending",
          sortIndex: 0,
          blocks: [],
          blockedBy: ["first"],
          metadata: {},
          createdAt: 100,
          updatedAt: 100,
          isBlocked: true,
          blockingTasks: [],
          blockedTasks: [],
        },
        {
          id: "first",
          sessionID: session.id,
          subject: "First",
          description: "First",
          activeForm: "First",
          owner: "default",
          status: "pending",
          sortIndex: 0,
          blocks: ["second"],
          blockedBy: [],
          metadata: {},
          createdAt: 100,
          updatedAt: 100,
          isBlocked: false,
          blockingTasks: [],
          blockedTasks: [],
        },
      ],
      current: [],
      next: [],
      blocked: [],
      owners: [],
      teammateActivity: [],
      summary: {
        total: 2,
        completed: 0,
        pending: 2,
        inProgress: 0,
        blocked: 1,
      },
    },
  })

  expect(Task.listSessionTasks(session.id).tasks.map((task) => task.id)).toEqual(["first", "second"])
})

test("task validation enforces owner activity, blockers, transitions, self dependencies, and cycles", async () => {
  await useTempDatabase("task-validation")
  const session = await createSession()

  Task.createSessionTasks({
    sessionID: session.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "1",
        subject: "One",
        description: "One",
        status: "in_progress",
      },
      {
        id: "2",
        subject: "Two",
        description: "Two",
      },
    ],
  })

  expect(() =>
    Task.updateSessionTask({
      sessionID: session.id,
      update: {
        id: "2",
        status: "in_progress",
      },
    }),
  ).toThrow("already has in-progress task")

  expect(() =>
    Task.updateSessionTask({
      sessionID: session.id,
      update: {
        id: "2",
        status: "completed",
      },
    }),
  ).toThrow("cannot transition")

  const blockedSession = await createSession()
  Task.createSessionTasks({
    sessionID: blockedSession.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "a",
        subject: "A",
        description: "A",
      },
      {
        id: "b",
        subject: "B",
        description: "B",
        blockedBy: ["a"],
      },
    ],
  })
  expect(() =>
    Task.updateSessionTask({
      sessionID: blockedSession.id,
      update: {
        id: "b",
        status: "in_progress",
      },
    }),
  ).toThrow("blocked by incomplete")

  expect(() =>
    Task.createSessionTasks({
      sessionID: blockedSession.id,
      defaultOwner: "default",
      tasks: [
        {
          id: "self",
          subject: "Self",
          description: "Self",
          blockedBy: ["self"],
        },
      ],
    }),
  ).toThrow("cannot depend on itself")

  expect(() =>
    Task.createSessionTasks({
      sessionID: blockedSession.id,
      defaultOwner: "default",
      tasks: [
        {
          id: "x",
          subject: "X",
          description: "X",
          blockedBy: ["y"],
        },
        {
          id: "y",
          subject: "Y",
          description: "Y",
          blockedBy: ["x"],
        },
      ],
    }),
  ).toThrow("cycle")
})

test("task.state.updated events are stored and projected", async () => {
  await useTempDatabase("task-event")
  const session = await createSession()
  const state = Task.createSessionTasks({
    sessionID: session.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "1",
        subject: "Project event",
        description: "Project event",
      },
    ],
  }).state
  const otherSession = await createSession()
  const factory = RuntimeEvent.createRuntimeEventFactory({
    sessionID: otherSession.id,
    turnID: "trn_task_event",
  })
  const event = factory.next("task.state.updated", {
    action: "replace",
    changedTaskIDs: ["1"],
    state: {
      ...state,
      sessionID: otherSession.id,
      tasks: state.tasks.map((task) => ({
        ...task,
        sessionID: otherSession.id,
      })),
    },
  })

  EventStore.appendAndProject(event)

  expect(EventStore.listTurnEvents({ sessionID: otherSession.id, turnID: event.turnID })[0]?.type).toBe("task.state.updated")
  expect(Task.getSessionTask(otherSession.id, "1")?.subject).toBe("Project event")
})

test("task API routes expose list, get, and runtime debug task state", async () => {
  await useTempDatabase("task-api")
  const app = createServerApp()
  const session = await createSession()

  Task.createSessionTasks({
    sessionID: session.id,
    defaultOwner: "default",
    tasks: [
      {
        id: "1",
        subject: "API task",
        description: "Read through API",
      },
    ],
  })

  const listResponse = await app.request(`http://localhost/api/sessions/${session.id}/tasks`)
  const listBody = await listResponse.json() as { success: boolean; data?: Task.SessionTaskListView }
  const getResponse = await app.request(`http://localhost/api/sessions/${session.id}/tasks/1`)
  const getBody = await getResponse.json() as { success: boolean; data?: Task.SessionTaskView }
  const runtimeResponse = await app.request(`http://localhost/api/debug/sessions/${session.id}/runtime`)
  const runtimeBody = await runtimeResponse.json() as { success: boolean; data?: { tasks?: Task.SessionTaskListView } }

  expect(listResponse.status).toBe(200)
  expect(listBody.data?.summary.total).toBe(1)
  expect(getResponse.status).toBe(200)
  expect(getBody.data?.subject).toBe("API task")
  expect(runtimeResponse.status).toBe(200)
  expect(runtimeBody.data?.tasks?.tasks[0]?.id).toBe("1")
})
