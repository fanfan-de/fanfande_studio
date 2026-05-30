import type { AutomationRun, AutomationRunTrigger } from "#automation/automation.ts"

export type AutomationEventName =
  | "automation.run.created"
  | "automation.run.updated"
  | "automation.run.started"
  | "automation.session.created"

export type AutomationRunEventData = {
  run: AutomationRun
}

export type AutomationSessionCreatedEventData = {
  automationID: string
  runID: string
  sessionID: string
  directory: string
  projectID?: string
  name: string
  trigger: AutomationRunTrigger
}

export type AutomationEventDataByName = {
  "automation.run.created": AutomationRunEventData
  "automation.run.updated": AutomationRunEventData
  "automation.run.started": AutomationRunEventData
  "automation.session.created": AutomationSessionCreatedEventData
}

export type AutomationEventRecord<TName extends AutomationEventName = AutomationEventName> = {
  id: string
  event: TName
  data: AutomationEventDataByName[TName]
  timestamp: number
}

const MAX_REPLAY_EVENTS = 500

const subscribers = new Set<(event: AutomationEventRecord) => void>()
const replayBuffer: AutomationEventRecord[] = []
let sequence = 0

export function publish<TName extends AutomationEventName>(
  event: TName,
  data: AutomationEventDataByName[TName],
) {
  const timestamp = Date.now()
  const record = {
    id: `${timestamp}:${++sequence}`,
    event,
    data,
    timestamp,
  } satisfies AutomationEventRecord<TName>

  replayBuffer.push(record as AutomationEventRecord)
  if (replayBuffer.length > MAX_REPLAY_EVENTS) {
    replayBuffer.splice(0, replayBuffer.length - MAX_REPLAY_EVENTS)
  }

  for (const subscriber of [...subscribers]) {
    try {
      subscriber(record as AutomationEventRecord)
    } catch {
      subscribers.delete(subscriber)
    }
  }

  return record
}

export function subscribe(subscriber: (event: AutomationEventRecord) => void) {
  subscribers.add(subscriber)
  return () => {
    subscribers.delete(subscriber)
  }
}

export function listEventsAfter(lastEventID?: string) {
  if (!lastEventID) return []
  const index = replayBuffer.findIndex((event) => event.id === lastEventID)
  if (index === -1) return [...replayBuffer]
  return replayBuffer.slice(index + 1)
}

export function toSSE(record: AutomationEventRecord) {
  return [
    `id: ${record.id}`,
    `event: ${record.event}`,
    `data: ${JSON.stringify(record.data)}`,
    "",
    "",
  ].join("\n")
}

export const internal = {
  subscribers,
  replayBuffer,
}
