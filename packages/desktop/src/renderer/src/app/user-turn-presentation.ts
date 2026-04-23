import { buildUserTurnText } from "./stream"
import type { Turn, UserTurn, UserTurnAttachment, UserTurnReference } from "./types"

const USER_TURN_PRESENTATION_STORAGE_KEY = "desktop.userTurnPresentation.v1"
const MAX_PERSISTED_SESSION_COUNT = 100
const MAX_PERSISTED_USER_TURNS_PER_SESSION = 200

type PersistedUserTurnPresentationMap = Record<string, UserTurn[]>

function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function sanitizeUserTurnAttachments(value: unknown): UserTurnAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined

  const attachments = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null

      const name = readString((item as Record<string, unknown>).name).trim()
      if (!name) return null

      const path = readString((item as Record<string, unknown>).path).trim()
      return {
        name,
        ...(path ? { path } : {}),
      } satisfies UserTurnAttachment
    })
    .filter((item): item is UserTurnAttachment => item !== null)

  return attachments.length > 0 ? attachments : undefined
}

function sanitizeUserTurnReferences(value: unknown): UserTurnReference[] | undefined {
  if (!Array.isArray(value)) return undefined

  const references = value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null

      const id = readString((item as Record<string, unknown>).id).trim()
      const label = readString((item as Record<string, unknown>).label).trim()
      if (!id || !label) return null

      const title = readString((item as Record<string, unknown>).title).trim()
      const kind = (item as Record<string, unknown>).kind

      return {
        id,
        label,
        ...(title ? { title } : {}),
        ...(kind === "comment" || kind === "file" ? { kind } : {}),
      } satisfies UserTurnReference
    })
    .filter((item): item is UserTurnReference => item !== null)

  return references.length > 0 ? references : undefined
}

function sanitizeUserTurn(value: unknown): UserTurn | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const id = readString(record.id).trim()
  const text = readString(record.text).trim()
  const timestamp = readNumber(record.timestamp)

  if (!id || !text || timestamp <= 0) {
    return null
  }

  const displayText = readString(record.displayText).trim()
  const attachments = sanitizeUserTurnAttachments(record.attachments)
  const references = sanitizeUserTurnReferences(record.references)
  const questionAnswer =
    record.questionAnswer && typeof record.questionAnswer === "object" && !Array.isArray(record.questionAnswer)
      ? (() => {
          const questionRecord = record.questionAnswer as Record<string, unknown>
          const questionID = readString(questionRecord.questionID).trim()
          if (!questionID) return undefined

          const selectedOptions = Array.isArray(questionRecord.selectedOptions)
            ? questionRecord.selectedOptions
                .map((item) => readString(item).trim())
                .filter(Boolean)
            : []
          const freeformText = readString(questionRecord.freeformText).trim()

          return {
            questionID,
            ...(selectedOptions.length > 0 ? { selectedOptions } : {}),
            ...(freeformText ? { freeformText } : {}),
          } satisfies UserTurn["questionAnswer"]
        })()
      : undefined

  return {
    id,
    kind: "user",
    text,
    ...(displayText ? { displayText } : {}),
    ...(attachments ? { attachments } : {}),
    ...(references ? { references } : {}),
    ...(questionAnswer ? { questionAnswer } : {}),
    timestamp,
  }
}

function readPersistedPresentationMap(): PersistedUserTurnPresentationMap {
  if (typeof window === "undefined") return {}

  try {
    const storedValue = window.localStorage.getItem(USER_TURN_PRESENTATION_STORAGE_KEY)
    if (!storedValue) return {}

    const parsed = JSON.parse(storedValue) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([sessionID, turns]) => {
        if (!Array.isArray(turns)) return []

        const sanitizedTurns = turns
          .map((item) => sanitizeUserTurn(item))
          .filter((item): item is UserTurn => item !== null)

        return sanitizedTurns.length > 0 ? [[sessionID, sanitizedTurns]] : []
      }),
    )
  } catch {
    return {}
  }
}

function writePersistedPresentationMap(value: PersistedUserTurnPresentationMap) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(USER_TURN_PRESENTATION_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore storage failures.
  }
}

function selectPersistableUserTurns(turns: Turn[]) {
  return turns
    .filter((turn): turn is UserTurn => turn.kind === "user")
    .slice(-MAX_PERSISTED_USER_TURNS_PER_SESSION)
    .map((turn) => ({
      ...turn,
      ...(turn.attachments?.length ? { attachments: turn.attachments.map((attachment) => ({ ...attachment })) } : {}),
      ...(turn.references?.length ? { references: turn.references.map((reference) => ({ ...reference })) } : {}),
      ...(turn.questionAnswer
        ? {
            questionAnswer: {
              ...turn.questionAnswer,
              ...(turn.questionAnswer.selectedOptions
                ? { selectedOptions: [...turn.questionAnswer.selectedOptions] }
                : {}),
            },
          }
        : {}),
    }))
}

function prunePersistedPresentationMap(value: PersistedUserTurnPresentationMap) {
  const rankedSessions = Object.entries(value)
    .map(([sessionID, turns]) => ({
      sessionID,
      turns,
      lastTimestamp: turns[turns.length - 1]?.timestamp ?? 0,
    }))
    .sort((left, right) => right.lastTimestamp - left.lastTimestamp)
    .slice(0, MAX_PERSISTED_SESSION_COUNT)

  return Object.fromEntries(rankedSessions.map(({ sessionID, turns }) => [sessionID, turns]))
}

export function readPersistedUserTurns(sessionID: string) {
  return readPersistedPresentationMap()[sessionID] ?? []
}

export function persistUserTurns(sessionID: string, turns: Turn[]) {
  const normalizedSessionID = sessionID.trim()
  if (!normalizedSessionID) return

  const nextSessionTurns = selectPersistableUserTurns(turns)
  const nextMap = readPersistedPresentationMap()

  if (nextSessionTurns.length > 0) {
    nextMap[normalizedSessionID] = nextSessionTurns
  } else {
    delete nextMap[normalizedSessionID]
  }

  writePersistedPresentationMap(prunePersistedPresentationMap(nextMap))
}

export function mergeUserTurnPresentationState(previousTurns: Turn[], nextTurns: Turn[]) {
  const previousUserTurns = previousTurns.filter((turn): turn is UserTurn => turn.kind === "user")
  let previousUserTurnIndex = 0

  const mergedTurns = nextTurns.map((turn) => {
    if (turn.kind !== "user") return turn

    const previousTurn = previousUserTurns[previousUserTurnIndex++]
    if (!previousTurn) return turn

    const mergedDisplayText = previousTurn.displayText ?? turn.displayText
    const mergedAttachments = previousTurn.attachments?.length ? previousTurn.attachments : turn.attachments
    const mergedReferences = previousTurn.references?.length ? previousTurn.references : turn.references

    return {
      ...turn,
      text: buildUserTurnText({
        text: mergedDisplayText ?? turn.displayText ?? turn.text,
        attachmentNames: mergedAttachments?.map((attachment) => attachment.name),
        referenceLabels: mergedReferences?.map((reference) => reference.label),
      }),
      ...(mergedDisplayText ? { displayText: mergedDisplayText } : {}),
      ...(mergedAttachments?.length ? { attachments: mergedAttachments } : {}),
      ...(mergedReferences?.length ? { references: mergedReferences } : {}),
    }
  })

  if (mergedTurns.length === 0) {
    return previousTurns.length > 0 ? previousTurns : mergedTurns
  }

  if (mergedTurns.length >= previousTurns.length) {
    return mergedTurns
  }

  const hasMatchingPrefix = mergedTurns.every((turn, index) => {
    const previousTurn = previousTurns[index]
    if (!previousTurn || previousTurn.kind !== turn.kind) return false

    if (previousTurn.id === turn.id) return true

    if (previousTurn.kind === "user" && turn.kind === "user") {
      return previousTurn.text === turn.text &&
        (previousTurn.questionAnswer?.questionID ?? "") === (turn.questionAnswer?.questionID ?? "")
    }

    if (previousTurn.kind === "assistant" && turn.kind === "assistant") {
      return previousTurn.state === turn.state && previousTurn.items.length === turn.items.length
    }

    return false
  })

  return hasMatchingPrefix ? [...mergedTurns, ...previousTurns.slice(mergedTurns.length)] : mergedTurns
}
