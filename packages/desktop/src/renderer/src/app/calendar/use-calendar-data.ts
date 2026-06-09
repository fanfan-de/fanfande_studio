import { useCallback, useEffect, useState } from "react"
import {
  createCalendarEvent,
  createCalendarTask,
  listCalendarItems,
  listCalendarSources,
  scheduleCalendarTask,
  updateCalendarEvent,
  updateCalendarSource,
  updateCalendarTask,
} from "./calendar-client"
import type {
  CalendarApiItem,
  CalendarItem,
  CalendarItemStatus,
  CalendarSource,
  CreateCalendarEventInput,
  CreateCalendarTaskInput,
  ScheduleCalendarTaskInput,
  UpdateCalendarEventInput,
  UpdateCalendarTaskInput,
} from "./calendar-types"

const KNOWN_STATUSES = new Set<CalendarItemStatus>([
  "scheduled",
  "todo",
  "doing",
  "done",
  "canceled",
  "pending",
  "blocked",
])

function toCalendarItem(apiItem: CalendarApiItem): CalendarItem {
  return {
    ...apiItem,
    startAt: apiItem.startAt === undefined ? undefined : new Date(apiItem.startAt),
    endAt: apiItem.endAt === undefined ? undefined : new Date(apiItem.endAt),
    status: apiItem.status && KNOWN_STATUSES.has(apiItem.status as CalendarItemStatus)
      ? apiItem.status as CalendarItemStatus
      : undefined,
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useCalendarData(input: { rangeStart: Date; rangeEnd: Date }) {
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [items, setItems] = useState<CalendarItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextSources, nextItems] = await Promise.all([
        listCalendarSources(),
        listCalendarItems({
          startAt: input.rangeStart.getTime(),
          endAt: input.rangeEnd.getTime(),
        }),
      ])
      setSources(nextSources)
      setItems(nextItems.map(toCalendarItem))
      setError(null)
    } catch (nextError) {
      setError(formatError(nextError))
    } finally {
      setIsLoading(false)
    }
  }, [input.rangeEnd, input.rangeStart])

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    void (async () => {
      try {
        const [nextSources, nextItems] = await Promise.all([
          listCalendarSources(),
          listCalendarItems({
            startAt: input.rangeStart.getTime(),
            endAt: input.rangeEnd.getTime(),
          }),
        ])
        if (cancelled) return
        setSources(nextSources)
        setItems(nextItems.map(toCalendarItem))
        setError(null)
      } catch (nextError) {
        if (cancelled) return
        setError(formatError(nextError))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [input.rangeEnd, input.rangeStart])

  const createEvent = useCallback(async (event: CreateCalendarEventInput) => {
    try {
      const created = await createCalendarEvent(event)
      await reload()
      return created
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const updateEvent = useCallback(async (eventId: string, update: UpdateCalendarEventInput) => {
    try {
      const updated = await updateCalendarEvent({ eventId, update })
      await reload()
      return updated
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const createTask = useCallback(async (task: CreateCalendarTaskInput) => {
    try {
      const created = await createCalendarTask(task)
      await reload()
      return created
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const updateTask = useCallback(async (taskId: string, update: UpdateCalendarTaskInput) => {
    try {
      const updated = await updateCalendarTask({ taskId, update })
      await reload()
      return updated
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const scheduleTask = useCallback(async (taskId: string, schedule: ScheduleCalendarTaskInput) => {
    try {
      const updated = await scheduleCalendarTask({ taskId, schedule })
      await reload()
      return updated
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const updateSource = useCallback(async (sourceId: string, update: Partial<CalendarSource>) => {
    try {
      const updated = await updateCalendarSource({ sourceId, update })
      await reload()
      return updated
    } catch (nextError) {
      setError(formatError(nextError))
      throw nextError
    }
  }, [reload])

  const patchItem = useCallback((itemId: string, update: Partial<CalendarItem>) => {
    setItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...update } : item)))
  }, [])

  const patchSource = useCallback((sourceId: string, update: Partial<CalendarSource>) => {
    setSources((current) => current.map((source) => (source.id === sourceId ? { ...source, ...update } : source)))
  }, [])

  return {
    error,
    isLoading,
    items,
    sources,
    createEvent,
    createTask,
    reload,
    patchItem,
    patchSource,
    updateEvent,
    updateTask,
    scheduleTask,
    updateSource,
  }
}
