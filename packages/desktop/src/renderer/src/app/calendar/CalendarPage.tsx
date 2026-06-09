import { Fragment, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react"
import {
  AutomationIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  PlusIcon,
  SearchIcon,
} from "../icons"
import { ShellTopMenu, joinClassNames } from "../shared-ui"
import { useCalendarData } from "./use-calendar-data"
import type {
  CalendarEntityType,
  CalendarItem,
  CalendarSource,
  CalendarSourceKind,
  CalendarViewMode,
  UpdateCalendarEventInput,
  UpdateCalendarTaskInput,
  PlannerTaskStatus,
} from "./calendar-types"

interface CalendarPageProps {
  windowControls?: ReactNode
}

const HOURS = Array.from({ length: 12 }, (_item, index) => index + 8)
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const VIEW_MODES: CalendarViewMode[] = ["day", "week", "month", "schedule"]

function startOfDay(date: Date) {
  const nextDate = new Date(date)
  nextDate.setHours(0, 0, 0, 0)
  return nextDate
}

function startOfWeek(date: Date) {
  const nextDate = startOfDay(date)
  nextDate.setDate(nextDate.getDate() - nextDate.getDay())
  return nextDate
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function setTime(date: Date, hour: number, minute = 0) {
  const nextDate = new Date(date)
  nextDate.setHours(hour, minute, 0, 0)
  return nextDate
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

function getDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function getHourKey(date: Date) {
  return date.getHours()
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date)
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", weekday: "short" }).format(date)
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date)
}

function formatDateTimeRange(item: CalendarItem) {
  if (!item.startAt) return "Not scheduled"
  if (item.allDay) return `${formatDayLabel(item.startAt)} - All day`
  const endLabel = item.endAt ? `-${formatTime(item.endAt)}` : ""
  return `${formatDayLabel(item.startAt)}, ${formatTime(item.startAt)}${endLabel}`
}

function createLocalMockSources(): CalendarSource[] {
  return [
    {
      id: "projects",
      name: "Project dates",
      subtitle: "Workspace milestones",
      kind: "project_database",
      color: "#c47a2c",
      enabled: true,
    },
    {
      id: "reminders",
      name: "Reminders",
      subtitle: "Follow-up dates",
      kind: "reminder_database",
      color: "#d94d64",
      enabled: true,
    },
    {
      id: "agent",
      name: "Agent suggestions",
      subtitle: "Pending time blocks",
      kind: "agent_plan",
      color: "#64748b",
      enabled: true,
    },
  ]
}

function createLocalMockItems(baseDate: Date): CalendarItem[] {
  const weekStart = startOfWeek(baseDate)
  const friday = addDays(weekStart, 5)

  return [
    {
      id: "project-mobile-release",
      title: "Mobile release target",
      entityType: "project",
      sourceId: "projects",
      startAt: friday,
      allDay: true,
      status: "scheduled",
      workspace: "Anybox Mobile",
      description: "Target date for the mobile release package.",
    },
    {
      id: "reminder-followup",
      title: "Follow up on review feedback",
      entityType: "reminder",
      sourceId: "reminders",
      startAt: setTime(friday, 11),
      endAt: setTime(friday, 11, 15),
      status: "scheduled",
      workspace: "Anybox",
    },
  ]
}

function getSourceKindLabel(kind: CalendarSourceKind) {
  switch (kind) {
    case "external_calendar":
      return "Calendar"
    case "task_database":
      return "Tasks"
    case "project_database":
      return "Projects"
    case "reminder_database":
      return "Reminders"
    case "agent_plan":
      return "Agent"
  }
}

function getEntityLabel(type: CalendarEntityType) {
  switch (type) {
    case "event":
      return "Event"
    case "task":
      return "Task"
    case "project":
      return "Project"
    case "reminder":
      return "Reminder"
    case "agent_suggestion":
      return "Suggestion"
  }
}

function getStatusOptions(item: CalendarItem) {
  if (item.entityType === "task") {
    return [
      { value: "todo", label: "Todo" },
      { value: "doing", label: "Doing" },
      { value: "done", label: "Done" },
      { value: "canceled", label: "Canceled" },
    ] satisfies Array<{ value: CalendarItem["status"]; label: string }>
  }

  if (item.entityType === "agent_suggestion") {
    return [
      { value: "pending", label: "Pending" },
      { value: "blocked", label: "Blocked" },
    ] satisfies Array<{ value: CalendarItem["status"]; label: string }>
  }

  return [
    { value: "scheduled", label: "Scheduled" },
    { value: "todo", label: "Todo" },
    { value: "doing", label: "Doing" },
    { value: "done", label: "Done" },
    { value: "canceled", label: "Canceled" },
  ] satisfies Array<{ value: CalendarItem["status"]; label: string }>
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function getNextDefaultStart(anchorDate: Date) {
  const now = new Date()
  if (isSameDay(anchorDate, now)) {
    const nextHour = Math.min(Math.max(now.getHours() + 1, 9), 17)
    return setTime(anchorDate, nextHour)
  }
  return setTime(anchorDate, 9)
}

function shouldCreateTaskFromQuickAdd(text: string) {
  const normalized = normalizeSearchText(text)
  return normalized.includes("task") ||
    normalized.includes("todo") ||
    normalized.includes("write") ||
    normalized.includes("finish") ||
    normalized.includes("complete")
}

function isPlannerTaskStatus(status: CalendarItem["status"]): status is PlannerTaskStatus {
  return status === "todo" || status === "doing" || status === "done" || status === "canceled"
}

function readQuickAddHour(text: string) {
  const match = text.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!match) return null

  let hour = Number(match[1])
  const minute = match[2] ? Number(match[2]) : 0
  const meridiem = match[3]?.toLowerCase()
  if (meridiem === "pm" && hour < 12) hour += 12
  if (meridiem === "am" && hour === 12) hour = 0
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null
  return { hour, minute: Number.isFinite(minute) ? minute : 0 }
}

function itemMatchesQuery(item: CalendarItem, query: string) {
  const normalized = normalizeSearchText(query)
  if (!normalized) return true
  return [
    item.title,
    item.description,
    item.workspace,
    item.status,
    item.entityType,
  ].some((value) => value?.toLowerCase().includes(normalized))
}

export function CalendarPage({ windowControls }: CalendarPageProps) {
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()))
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week")
  const [localSources, setLocalSources] = useState(createLocalMockSources)
  const [localItems, setLocalItems] = useState(() => createLocalMockItems(new Date()))
  const [selectedItemId, setSelectedItemId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [quickAddText, setQuickAddText] = useState("")
  const itemCounterRef = useRef(0)

  const weekStart = useMemo(() => startOfWeek(anchorDate), [anchorDate])
  const calendarRange = useMemo(() => {
    if (viewMode === "month") {
      const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
      const rangeStart = startOfWeek(monthStart)
      return {
        rangeStart,
        rangeEnd: addDays(rangeStart, 42),
      }
    }

    if (viewMode === "schedule") {
      const rangeStart = startOfDay(anchorDate)
      return {
        rangeStart,
        rangeEnd: addDays(rangeStart, 14),
      }
    }

    const rangeStart = viewMode === "day" ? startOfDay(anchorDate) : weekStart
    return {
      rangeStart,
      rangeEnd: addDays(rangeStart, viewMode === "day" ? 1 : 7),
    }
  }, [anchorDate, viewMode, weekStart])
  const calendarData = useCalendarData(calendarRange)
  const sources = useMemo(
    () => [...calendarData.sources, ...localSources],
    [calendarData.sources, localSources],
  )
  const items = useMemo(
    () => [...calendarData.items, ...localItems],
    [calendarData.items, localItems],
  )
  const remoteItemIds = useMemo(() => new Set(calendarData.items.map((item) => item.id)), [calendarData.items])
  const remoteSourceIds = useMemo(() => new Set(calendarData.sources.map((source) => source.id)), [calendarData.sources])
  const sourceById = useMemo(() => new Map(sources.map((source) => [source.id, source])), [sources])
  const enabledSourceIds = useMemo(
    () => new Set(sources.filter((source) => source.enabled).map((source) => source.id)),
    [sources],
  )
  const visibleItems = useMemo(
    () => items.filter((item) => enabledSourceIds.has(item.sourceId) && itemMatchesQuery(item, searchQuery)),
    [enabledSourceIds, items, searchQuery],
  )
  const unscheduledTasks = useMemo(
    () => items.filter((item) => (
      item.entityType === "task" &&
      enabledSourceIds.has(item.sourceId) &&
      !item.startAt &&
      itemMatchesQuery(item, searchQuery)
    )),
    [enabledSourceIds, items, searchQuery],
  )
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? visibleItems[0] ?? items[0] ?? null,
    [items, selectedItemId, visibleItems],
  )
  const currentViewLabel = viewMode === "day" ? formatDayLabel(anchorDate) : formatMonthLabel(anchorDate)

  function createItemId(prefix: string) {
    itemCounterRef.current += 1
    return `${prefix}-${Date.now()}-${itemCounterRef.current}`
  }

  function toCalendarEventUpdate(update: Partial<CalendarItem>): UpdateCalendarEventInput {
    const eventUpdate: UpdateCalendarEventInput = {}
    if (update.title !== undefined) eventUpdate.title = update.title
    if (update.description !== undefined) eventUpdate.description = update.description
    if (update.sourceId !== undefined) eventUpdate.sourceId = update.sourceId
    if (update.startAt !== undefined) eventUpdate.startAt = update.startAt.getTime()
    if (update.endAt !== undefined) eventUpdate.endAt = update.endAt.getTime()
    if (update.allDay !== undefined) eventUpdate.allDay = update.allDay
    return eventUpdate
  }

  function toCalendarTaskUpdate(update: Partial<CalendarItem>): UpdateCalendarTaskInput {
    const taskUpdate: UpdateCalendarTaskInput = {}
    if (update.title !== undefined) taskUpdate.title = update.title
    if (update.description !== undefined) taskUpdate.description = update.description || null
    if (isPlannerTaskStatus(update.status)) taskUpdate.status = update.status
    if (update.workspace !== undefined) taskUpdate.workspaceId = update.workspace || null
    if (update.estimateMinutes !== undefined) taskUpdate.estimateMinutes = update.estimateMinutes
    return taskUpdate
  }

  function updateItem(itemId: string, update: Partial<CalendarItem>) {
    const existing = items.find((item) => item.id === itemId)
    if (existing?.entityType === "event" && remoteItemIds.has(itemId)) {
      calendarData.patchItem(itemId, update)
      const eventUpdate = toCalendarEventUpdate(update)
      if (Object.keys(eventUpdate).length > 0) {
        void calendarData.updateEvent(existing.entityId ?? itemId, eventUpdate).catch(() => undefined)
      }
      return
    }

    if (existing?.entityType === "task" && remoteItemIds.has(itemId)) {
      calendarData.patchItem(itemId, update)
      const taskUpdate = toCalendarTaskUpdate(update)
      if (Object.keys(taskUpdate).length > 0) {
        void calendarData.updateTask(existing.entityId ?? itemId, taskUpdate).catch(() => undefined)
      }
      if ("startAt" in update || "endAt" in update) {
        const nextStart = "startAt" in update ? update.startAt : existing.startAt
        const nextEnd = "endAt" in update ? update.endAt : existing.endAt
        const schedule = nextStart && nextEnd
          ? {
              scheduledStartAt: nextStart.getTime(),
              scheduledEndAt: nextEnd.getTime(),
            }
          : {
              scheduledStartAt: null,
              scheduledEndAt: null,
            }
        void calendarData.scheduleTask(existing.entityId ?? itemId, schedule).catch(() => undefined)
      }
      return
    }

    setLocalItems((current) => current.map((item) => (item.id === itemId ? { ...item, ...update } : item)))
  }

  function toggleSource(sourceId: string) {
    const existing = sources.find((source) => source.id === sourceId)
    if (!existing) return
    const enabled = !existing.enabled
    if (remoteSourceIds.has(sourceId)) {
      calendarData.patchSource(sourceId, { enabled })
      void calendarData.updateSource(sourceId, { enabled }).catch(() => undefined)
      return
    }

    setLocalSources((current) => current.map((source) => (
      source.id === sourceId ? { ...source, enabled } : source
    )))
  }

  function moveAnchor(delta: number) {
    if (viewMode === "month") {
      setAnchorDate((current) => {
        const nextDate = new Date(current)
        nextDate.setMonth(nextDate.getMonth() + delta)
        return startOfDay(nextDate)
      })
      return
    }

    setAnchorDate((current) => addDays(current, viewMode === "day" ? delta : delta * 7))
  }

  function scheduleItem(itemId: string, day: Date, hour: number) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item || item.entityType === "agent_suggestion") return

    const duration = item.estimateMinutes ?? 60
    const startAt = setTime(day, hour)
    updateItem(itemId, {
      startAt,
      endAt: addMinutes(startAt, duration),
    })
    setSelectedItemId(itemId)
  }

  function handleCellDrop(event: DragEvent<HTMLDivElement>, day: Date, hour: number) {
    const itemId = event.dataTransfer.getData("text/calendar-item-id")
    if (!itemId) return
    event.preventDefault()
    scheduleItem(itemId, day, hour)
  }

  async function handleQuickAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = quickAddText.trim()
    if (!title) return

    const targetDate = /tomorrow|明天/.test(title.toLowerCase()) ? addDays(anchorDate, 1) : anchorDate
    const parsedTime = readQuickAddHour(title)
    const defaultStart = getNextDefaultStart(targetDate)
    const startAt = parsedTime ? setTime(targetDate, parsedTime.hour, parsedTime.minute) : defaultStart
    const shouldCreateTask = shouldCreateTaskFromQuickAdd(title)
    if (shouldCreateTask) {
      const created = await calendarData.createTask({
        title,
        status: "todo",
        priority: "medium",
        estimateMinutes: 60,
        workspaceId: "Inbox",
        description: "Captured from Calendar quick add.",
      }).catch(() => null)
      if (!created) return
      setSelectedItemId(created.id)
      setQuickAddText("")
      return
    }

    const defaultSource = calendarData.sources.find((source) => source.kind === "external_calendar" && source.enabled) ??
      calendarData.sources.find((source) => source.kind === "external_calendar")
    if (!defaultSource) return
    const created = await calendarData.createEvent({
      title,
      sourceId: defaultSource.id,
      startAt: startAt.getTime(),
      endAt: addMinutes(startAt, 60).getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      description: "Created from Calendar quick add.",
    }).catch(() => null)
    if (!created) return
    setSelectedItemId(created.id)
    setQuickAddText("")
  }

  function generateAgentSuggestions() {
    const candidateTasks = visibleItems.filter((item) => item.entityType === "task" && !item.startAt).slice(0, 2)
    if (candidateTasks.length === 0) return

    const existingSuggestionTargetIds = new Set(
      items.filter((item) => item.entityType === "agent_suggestion").map((item) => item.targetItemId),
    )
    const suggestionDays = [addDays(weekStart, 2), addDays(weekStart, 4)]
    const suggestions = candidateTasks
      .filter((task) => !existingSuggestionTargetIds.has(task.id))
      .map((task, index): CalendarItem => {
        const startAt = setTime(suggestionDays[index] ?? addDays(anchorDate, index + 1), index === 0 ? 11 : 14)
        return {
          id: createItemId("suggestion"),
          title: task.title,
          entityType: "agent_suggestion",
          sourceId: "agent",
          targetItemId: task.id,
          startAt,
          endAt: addMinutes(startAt, task.estimateMinutes ?? 60),
          status: "pending",
          isSuggestion: true,
          workspace: task.workspace,
          description: `Suggested from ${task.workspace ?? "Anybox"} task source.`,
        }
      })

    if (suggestions.length === 0) return
    setLocalItems((current) => [...suggestions, ...current])
    setSelectedItemId(suggestions[0].id)
  }

  function acceptSuggestion(suggestion: CalendarItem) {
    if (!suggestion.targetItemId || !suggestion.startAt) return
    updateItem(suggestion.targetItemId, {
      startAt: suggestion.startAt,
      endAt: suggestion.endAt,
    })
    setLocalItems((current) => current.filter((item) => item.id !== suggestion.id))
    setSelectedItemId(suggestion.targetItemId)
  }

  function dismissSuggestion(suggestionId: string) {
    setLocalItems((current) => current.filter((item) => item.id !== suggestionId))
    setSelectedItemId((current) => (current === suggestionId ? "" : current))
  }

  function unscheduleItem(itemId: string) {
    updateItem(itemId, { startAt: undefined, endAt: undefined, allDay: false, status: "todo" })
  }

  return (
    <section className="calendar-page" aria-label="Calendar">
      <ShellTopMenu
        as="header"
        ariaLabel="Calendar top menu"
        className="calendar-top-menu"
        contentClassName="calendar-top-menu-content"
        content={(
          <div className="calendar-top-menu-title">
            <CalendarIcon />
            <span>Calendar</span>
          </div>
        )}
        dragRegion
        trailing={windowControls}
        trailingClassName="calendar-top-menu-window-controls"
      />

      <div className="calendar-toolbar">
        <div className="calendar-date-controls" aria-label="Date navigation">
          <button type="button" className="calendar-toolbar-button" onClick={() => moveAnchor(-1)}>
            Prev
          </button>
          <button type="button" className="calendar-toolbar-button" onClick={() => setAnchorDate(startOfDay(new Date()))}>
            Today
          </button>
          <button type="button" className="calendar-toolbar-button" onClick={() => moveAnchor(1)}>
            Next
          </button>
          <h1>{currentViewLabel}</h1>
        </div>

        <div className="calendar-toolbar-center">
          <div className="calendar-view-switcher" aria-label="Calendar view">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={joinClassNames("calendar-view-button", viewMode === mode && "is-active")}
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <form className="calendar-quick-add" onSubmit={handleQuickAdd}>
          <SearchIcon />
          <input
            aria-label="Add event or task"
            value={quickAddText}
            placeholder="Add event or task..."
            onChange={(event) => setQuickAddText(event.target.value)}
          />
          <button type="submit" aria-label="Add calendar item">
            <PlusIcon />
          </button>
        </form>
      </div>

      <div className="calendar-shell">
        <CalendarSourcesPanel
          anchorDate={anchorDate}
          searchQuery={searchQuery}
          sources={sources}
          unscheduledTasks={unscheduledTasks}
          onSearchQueryChange={setSearchQuery}
          onAgentPlan={generateAgentSuggestions}
          onItemSelect={setSelectedItemId}
          onSourceToggle={toggleSource}
        />

        <main className="calendar-main" aria-label={`${viewMode} calendar view`}>
          {calendarData.error ? (
            <p className="calendar-data-status is-error" role="alert">
              Calendar data unavailable: {calendarData.error}
            </p>
          ) : calendarData.isLoading ? (
            <p className="calendar-data-status" role="status">Loading calendar data...</p>
          ) : null}
          {viewMode === "day" ? (
            <TimeGrid
              days={[anchorDate]}
              items={visibleItems}
              sourceById={sourceById}
              onCellDrop={handleCellDrop}
              onItemSelect={setSelectedItemId}
            />
          ) : viewMode === "week" ? (
            <TimeGrid
              days={Array.from({ length: 7 }, (_item, index) => addDays(weekStart, index))}
              items={visibleItems}
              sourceById={sourceById}
              onCellDrop={handleCellDrop}
              onItemSelect={setSelectedItemId}
            />
          ) : viewMode === "month" ? (
            <MonthGrid
              anchorDate={anchorDate}
              items={visibleItems}
              sourceById={sourceById}
              onItemSelect={setSelectedItemId}
            />
          ) : (
            <ScheduleList
              anchorDate={anchorDate}
              items={visibleItems}
              sourceById={sourceById}
              onItemSelect={setSelectedItemId}
            />
          )}
        </main>

        <CalendarDetailPanel
          item={selectedItem}
          source={selectedItem ? sourceById.get(selectedItem.sourceId) : undefined}
          sources={sources}
          onAcceptSuggestion={acceptSuggestion}
          onDismissSuggestion={dismissSuggestion}
          onItemUpdate={updateItem}
          onMoveLater={(item) => {
            if (!item.startAt) return
            const nextStart = addMinutes(item.startAt, 30)
            updateItem(item.id, {
              startAt: nextStart,
              endAt: item.endAt ? addMinutes(item.endAt, 30) : addMinutes(nextStart, item.estimateMinutes ?? 60),
            })
          }}
          onUnschedule={unscheduleItem}
        />
      </div>
    </section>
  )
}

interface CalendarSourcesPanelProps {
  anchorDate: Date
  searchQuery: string
  sources: CalendarSource[]
  unscheduledTasks: CalendarItem[]
  onAgentPlan: () => void
  onItemSelect: (itemId: string) => void
  onSearchQueryChange: (query: string) => void
  onSourceToggle: (sourceId: string) => void
}

function CalendarSourcesPanel({
  anchorDate,
  searchQuery,
  sources,
  unscheduledTasks,
  onAgentPlan,
  onItemSelect,
  onSearchQueryChange,
  onSourceToggle,
}: CalendarSourcesPanelProps) {
  return (
    <aside className="calendar-sources-panel" aria-label="Calendar sources">
      <MiniCalendar date={anchorDate} />

      <label className="calendar-source-search">
        <SearchIcon />
        <input
          value={searchQuery}
          placeholder="Search calendar..."
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />
      </label>

      <section className="calendar-source-section">
        <div className="calendar-section-heading">
          <h2>Sources</h2>
          <span>{sources.filter((source) => source.enabled).length} active</span>
        </div>
        <div className="calendar-source-list">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={joinClassNames("calendar-source-row", source.enabled && "is-enabled")}
              aria-pressed={source.enabled}
              onClick={() => onSourceToggle(source.id)}
            >
              <span className="calendar-source-swatch" style={{ backgroundColor: source.color }} />
              <span className="calendar-source-copy">
                <span>{source.name}</span>
                <small>{source.subtitle}</small>
              </span>
              <span className="calendar-source-kind">{getSourceKindLabel(source.kind)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="calendar-source-section">
        <div className="calendar-section-heading">
          <h2>Unscheduled</h2>
          <span>{unscheduledTasks.length} tasks</span>
        </div>
        <div className="calendar-unscheduled-list">
          {unscheduledTasks.length > 0 ? unscheduledTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className="calendar-unscheduled-task"
              draggable
              onClick={() => onItemSelect(task.id)}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/calendar-item-id", task.id)
                event.dataTransfer.effectAllowed = "move"
              }}
            >
              <span>{task.title}</span>
              <small>{task.workspace ?? "Anybox"} - {task.estimateMinutes ?? 60}m</small>
            </button>
          )) : (
            <p className="calendar-empty-note">All visible tasks have a date.</p>
          )}
        </div>
      </section>

      <section className="calendar-agent-panel">
        <div>
          <AutomationIcon />
          <h2>Agent plan</h2>
          <p>Suggest time blocks for unscheduled tasks in this week.</p>
        </div>
        <button type="button" className="calendar-agent-button" onClick={onAgentPlan}>
          Ask Agent
        </button>
      </section>
    </aside>
  )
}

function MiniCalendar({ date }: { date: Date }) {
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1)
  const gridStart = startOfWeek(monthStart)
  const days = Array.from({ length: 35 }, (_item, index) => addDays(gridStart, index))

  return (
    <section className="calendar-mini" aria-label="Mini calendar">
      <h2>{formatMonthLabel(date)}</h2>
      <div className="calendar-mini-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => <span key={label}>{label.slice(0, 1)}</span>)}
      </div>
      <div className="calendar-mini-grid">
        {days.map((day) => (
          <span
            key={getDateKey(day)}
            className={joinClassNames(
              "calendar-mini-day",
              day.getMonth() !== date.getMonth() && "is-muted",
              isSameDay(day, new Date()) && "is-today",
            )}
          >
            {day.getDate()}
          </span>
        ))}
      </div>
    </section>
  )
}

interface TimeGridProps {
  days: Date[]
  items: CalendarItem[]
  sourceById: Map<string, CalendarSource>
  onCellDrop: (event: DragEvent<HTMLDivElement>, day: Date, hour: number) => void
  onItemSelect: (itemId: string) => void
}

function TimeGrid({ days, items, sourceById, onCellDrop, onItemSelect }: TimeGridProps) {
  const timedItems = items.filter((item) => item.startAt && !item.allDay)
  const allDayItems = items.filter((item) => item.startAt && item.allDay)
  const columnTemplate = `64px repeat(${days.length}, minmax(124px, 1fr))`

  return (
    <div className="calendar-time-grid-wrap">
      <div className="calendar-time-grid" style={{ gridTemplateColumns: columnTemplate }}>
        <div className="calendar-grid-corner" />
        {days.map((day) => (
          <div key={getDateKey(day)} className={joinClassNames("calendar-day-header", isSameDay(day, new Date()) && "is-today")}>
            <span>{WEEKDAY_LABELS[day.getDay()]}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}

        <div className="calendar-time-label is-all-day">All day</div>
        {days.map((day) => (
          <div key={`all-day-${getDateKey(day)}`} className="calendar-all-day-cell">
            {allDayItems
              .filter((item) => item.startAt && isSameDay(item.startAt, day))
              .map((item) => (
                <CalendarEventChip
                  key={item.id}
                  item={item}
                  source={sourceById.get(item.sourceId)}
                  onClick={() => onItemSelect(item.id)}
                />
              ))}
          </div>
        ))}

        {HOURS.map((hour) => (
          <Fragment key={`hour-row-${hour}`}>
            <div key={`time-${hour}`} className="calendar-time-label">{String(hour).padStart(2, "0")}:00</div>
            {days.map((day) => {
              const cellItems = timedItems.filter((item) => (
                item.startAt && isSameDay(item.startAt, day) && getHourKey(item.startAt) === hour
              ))

              return (
                <div
                  key={`${getDateKey(day)}-${hour}`}
                  role="gridcell"
                  className="calendar-time-cell"
                  aria-label={`Schedule at ${formatDayLabel(day)} ${hour}:00`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                  }}
                  onDrop={(event) => onCellDrop(event, day, hour)}
                >
                  {cellItems.map((item) => (
                    <CalendarEventChip
                      key={item.id}
                      item={item}
                      source={sourceById.get(item.sourceId)}
                      onClick={() => onItemSelect(item.id)}
                    />
                  ))}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

interface CalendarEventChipProps {
  item: CalendarItem
  source?: CalendarSource
  onClick: () => void
}

function CalendarEventChip({ item, source, onClick }: CalendarEventChipProps) {
  return (
    <span
      role="button"
      tabIndex={0}
      className={joinClassNames("calendar-event-chip", item.isSuggestion && "is-suggestion")}
      style={{ borderLeftColor: source?.color ?? "#64748b" }}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <span>{item.title}</span>
      <small>{item.isSuggestion ? "Suggested" : item.startAt ? formatTime(item.startAt) : getEntityLabel(item.entityType)}</small>
    </span>
  )
}

interface MonthGridProps {
  anchorDate: Date
  items: CalendarItem[]
  sourceById: Map<string, CalendarSource>
  onItemSelect: (itemId: string) => void
}

function MonthGrid({ anchorDate, items, sourceById, onItemSelect }: MonthGridProps) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const gridStart = startOfWeek(monthStart)
  const days = Array.from({ length: 42 }, (_item, index) => addDays(gridStart, index))
  const datedItems = items.filter((item) => item.startAt)

  return (
    <div className="calendar-month-view">
      {WEEKDAY_LABELS.map((label) => <div key={label} className="calendar-month-weekday">{label}</div>)}
      {days.map((day) => {
        const dayItems = datedItems.filter((item) => item.startAt && isSameDay(item.startAt, day)).slice(0, 4)
        return (
          <section
            key={getDateKey(day)}
            className={joinClassNames(
              "calendar-month-day",
              day.getMonth() !== anchorDate.getMonth() && "is-muted",
              isSameDay(day, new Date()) && "is-today",
            )}
          >
            <div className="calendar-month-day-number">{day.getDate()}</div>
            <div className="calendar-month-day-items">
              {dayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={joinClassNames("calendar-month-item", item.isSuggestion && "is-suggestion")}
                  style={{ borderLeftColor: sourceById.get(item.sourceId)?.color ?? "#64748b" }}
                  onClick={() => onItemSelect(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

interface ScheduleListProps {
  anchorDate: Date
  items: CalendarItem[]
  sourceById: Map<string, CalendarSource>
  onItemSelect: (itemId: string) => void
}

function ScheduleList({ anchorDate, items, sourceById, onItemSelect }: ScheduleListProps) {
  const rangeStart = startOfDay(anchorDate)
  const rangeEnd = addDays(rangeStart, 14)
  const scheduledItems = items
    .filter((item) => item.startAt && item.startAt >= rangeStart && item.startAt <= rangeEnd)
    .sort((left, right) => (left.startAt?.getTime() ?? 0) - (right.startAt?.getTime() ?? 0))
  const groups = scheduledItems.reduce<Record<string, CalendarItem[]>>((accumulator, item) => {
    if (!item.startAt) return accumulator
    const key = getDateKey(item.startAt)
    accumulator[key] ??= []
    accumulator[key].push(item)
    return accumulator
  }, {})

  return (
    <div className="calendar-schedule-view">
      {Object.entries(groups).map(([key, groupItems]) => (
        <section key={key} className="calendar-schedule-group">
          <h2>{formatDayLabel(groupItems[0].startAt!)}</h2>
          <div className="calendar-schedule-items">
            {groupItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={joinClassNames("calendar-schedule-item", item.isSuggestion && "is-suggestion")}
                onClick={() => onItemSelect(item.id)}
              >
                <span className="calendar-schedule-time">{item.allDay ? "All day" : item.startAt ? formatTime(item.startAt) : ""}</span>
                <span className="calendar-schedule-copy">
                  <strong>{item.title}</strong>
                  <small>
                    <span style={{ backgroundColor: sourceById.get(item.sourceId)?.color ?? "#64748b" }} />
                    {sourceById.get(item.sourceId)?.name ?? "Calendar"}
                  </small>
                </span>
                <ChevronRightIcon />
              </button>
            ))}
          </div>
        </section>
      ))}
      {scheduledItems.length === 0 ? <p className="calendar-empty-state">No visible items in the next two weeks.</p> : null}
    </div>
  )
}

interface CalendarDetailPanelProps {
  item: CalendarItem | null
  source?: CalendarSource
  sources: CalendarSource[]
  onAcceptSuggestion: (item: CalendarItem) => void
  onDismissSuggestion: (itemId: string) => void
  onItemUpdate: (itemId: string, update: Partial<CalendarItem>) => void
  onMoveLater: (item: CalendarItem) => void
  onUnschedule: (itemId: string) => void
}

function CalendarDetailPanel({
  item,
  source,
  sources,
  onAcceptSuggestion,
  onDismissSuggestion,
  onItemUpdate,
  onMoveLater,
  onUnschedule,
}: CalendarDetailPanelProps) {
  if (!item) {
    return (
      <aside className="calendar-detail-panel" aria-label="Calendar details">
        <div className="calendar-detail-empty">
          <CalendarIcon />
          <h2>Select a calendar item</h2>
          <p>Event, task, project date, reminder, and Agent suggestions open here.</p>
        </div>
      </aside>
    )
  }
  const sourceOptions = item.entityType === "event"
    ? sources.filter((candidate) => candidate.kind === "external_calendar")
    : item.entityType === "task"
      ? sources.filter((candidate) => candidate.kind === "task_database")
      : sources
  const statusOptions = getStatusOptions(item)
  const statusValue = item.status ?? (item.entityType === "task" ? "todo" : "scheduled")

  return (
    <aside className="calendar-detail-panel" aria-label="Calendar details">
      <div className="calendar-detail-heading">
        <span className="calendar-detail-type">{getEntityLabel(item.entityType)}</span>
        <h2>{item.title}</h2>
        <p>{formatDateTimeRange(item)}</p>
      </div>

      <div className="calendar-detail-form">
        <label>
          Title
          <input
            value={item.title}
            onChange={(event) => onItemUpdate(item.id, { title: event.target.value })}
          />
        </label>

        <label>
          Source
          <select
            value={item.sourceId}
            disabled={item.entityType === "agent_suggestion" || item.entityType === "task"}
            onChange={(event) => onItemUpdate(item.id, { sourceId: event.target.value })}
          >
            {sourceOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={statusValue}
            onChange={(event) => onItemUpdate(item.id, { status: event.target.value as CalendarItem["status"] })}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label>
          Workspace
          <input
            value={item.workspace ?? ""}
            placeholder="Anybox workspace"
            onChange={(event) => onItemUpdate(item.id, { workspace: event.target.value })}
          />
        </label>

        <label>
          Notes
          <textarea
            value={item.description ?? ""}
            rows={4}
            placeholder="Context for this calendar item"
            onChange={(event) => onItemUpdate(item.id, { description: event.target.value })}
          />
        </label>
      </div>

      <div className="calendar-detail-meta">
        <div>
          <span>Calendar source</span>
          <strong>{source?.name ?? "Unknown"}</strong>
        </div>
        <div>
          <span>Date field</span>
          <strong>{item.entityType === "task" ? "scheduledStartAt" : "startAt"}</strong>
        </div>
      </div>

      <div className="calendar-detail-actions">
        {item.entityType === "agent_suggestion" ? (
          <>
            <button type="button" className="calendar-primary-action" onClick={() => onAcceptSuggestion(item)}>
              <CheckIcon />
              Accept suggestion
            </button>
            <button type="button" className="calendar-secondary-action" onClick={() => onDismissSuggestion(item.id)}>
              Dismiss
            </button>
          </>
        ) : (
          <>
            <button type="button" className="calendar-primary-action" onClick={() => onMoveLater(item)} disabled={!item.startAt}>
              Move 30m later
            </button>
            {item.entityType === "task" ? (
              <button type="button" className="calendar-secondary-action" onClick={() => onItemUpdate(item.id, { status: "done" })}>
                Mark done
              </button>
            ) : null}
            {item.startAt && item.entityType === "task" ? (
              <button type="button" className="calendar-secondary-action" onClick={() => onUnschedule(item.id)}>
                Unschedule
              </button>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
