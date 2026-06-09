export type CalendarViewMode = "day" | "week" | "month" | "schedule"
export type CalendarSourceKind = "external_calendar" | "task_database" | "project_database" | "reminder_database" | "agent_plan"
export type CalendarEntityType = "event" | "task" | "project" | "reminder" | "agent_suggestion"
export type PlannerTaskStatus = "todo" | "doing" | "done" | "canceled"
export type PlannerTaskPriority = "low" | "medium" | "high"
export type CalendarItemStatus = "scheduled" | PlannerTaskStatus | "pending" | "blocked"

export interface CalendarSource {
  color: string
  enabled: boolean
  id: string
  kind: CalendarSourceKind
  name: string
  subtitle: string
}

export interface CalendarEventRecord {
  allDay: boolean
  attendees: string[]
  createdAt: number
  description?: string
  endAt: number
  id: string
  linkedPageIds: string[]
  linkedWorkspaceId?: string
  location?: string
  meetingUrl?: string
  sourceId: string
  startAt: number
  timezone: string
  title: string
  updatedAt: number
}

export interface PlannerTaskRecord {
  createdAt: number
  description?: string
  dueAt?: number
  estimateMinutes?: number
  id: string
  priority: PlannerTaskPriority
  scheduledEndAt?: number
  scheduledStartAt?: number
  status: PlannerTaskStatus
  title: string
  updatedAt: number
  workspaceId?: string
}

export interface CalendarItem {
  allDay?: boolean
  description?: string
  endAt?: Date
  entityId?: string
  entityType: CalendarEntityType
  estimateMinutes?: number
  id: string
  isReadOnly?: boolean
  isSuggestion?: boolean
  sourceId: string
  startAt?: Date
  status?: CalendarItemStatus
  targetItemId?: string
  title: string
  workspace?: string
}

export interface CalendarApiItem {
  allDay: boolean
  color: string
  description?: string
  endAt?: number
  entityId: string
  entityType: CalendarEntityType
  estimateMinutes?: number
  id: string
  isReadOnly: boolean
  isSuggestion: boolean
  sourceId: string
  startAt?: number
  status?: string
  title: string
  workspace?: string
}

export interface CreateCalendarEventInput {
  allDay?: boolean
  description?: string
  endAt: number
  sourceId: string
  startAt: number
  timezone?: string
  title: string
}

export interface UpdateCalendarEventInput {
  allDay?: boolean
  description?: string
  endAt?: number
  sourceId?: string
  startAt?: number
  timezone?: string
  title?: string
}

export interface CreateCalendarTaskInput {
  description?: string
  dueAt?: number
  estimateMinutes?: number
  priority?: PlannerTaskPriority
  scheduledEndAt?: number
  scheduledStartAt?: number
  status?: PlannerTaskStatus
  title: string
  workspaceId?: string
}

export interface UpdateCalendarTaskInput {
  description?: string | null
  dueAt?: number | null
  estimateMinutes?: number
  priority?: PlannerTaskPriority
  scheduledEndAt?: number | null
  scheduledStartAt?: number | null
  status?: PlannerTaskStatus
  title?: string
  workspaceId?: string | null
}

export interface ScheduleCalendarTaskInput {
  scheduledEndAt?: number | null
  scheduledStartAt?: number | null
}
