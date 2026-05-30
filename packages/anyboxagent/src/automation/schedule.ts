import z from "zod"

export const AutomationScheduleType = z.enum(["rrule", "cron"])

export const AutomationSchedule = z.object({
  type: AutomationScheduleType,
  expression: z.string().min(1),
  timezone: z.string().min(1),
})
export type AutomationSchedule = z.output<typeof AutomationSchedule>

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const MAX_CRON_LOOKAHEAD_MINUTES = 366 * 24 * 60

const WEEKDAY_INDEX: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

function parseInteger(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : fallback
}

function parseRRule(expression: string) {
  const pairs = expression
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [rawKey, ...rawValue] = part.split("=")
      return [rawKey?.trim().toUpperCase() ?? "", rawValue.join("=").trim().toUpperCase()] as const
    })

  return new Map(pairs.filter(([key, value]) => key && value))
}

function nextHourlyRRule(parts: Map<string, string>, after: number) {
  const interval = Math.max(1, parseInteger(parts.get("INTERVAL"), 1))
  const candidate = new Date(after)
  candidate.setMinutes(0, 0, 0)
  candidate.setTime(candidate.getTime() + interval * HOUR_MS)

  while (candidate.getTime() <= after) {
    candidate.setTime(candidate.getTime() + interval * HOUR_MS)
  }

  return candidate.getTime()
}

function nextDailyRRule(parts: Map<string, string>, after: number) {
  const hour = Math.min(23, Math.max(0, parseInteger(parts.get("BYHOUR"), 9)))
  const minute = Math.min(59, Math.max(0, parseInteger(parts.get("BYMINUTE"), 0)))
  const candidate = new Date(after)
  candidate.setHours(hour, minute, 0, 0)

  if (candidate.getTime() <= after) {
    candidate.setTime(candidate.getTime() + DAY_MS)
  }

  return candidate.getTime()
}

function nextWeeklyRRule(parts: Map<string, string>, after: number) {
  const hour = Math.min(23, Math.max(0, parseInteger(parts.get("BYHOUR"), 9)))
  const minute = Math.min(59, Math.max(0, parseInteger(parts.get("BYMINUTE"), 0)))
  const weekdays = (parts.get("BYDAY") ?? "MO")
    .split(",")
    .map((value) => WEEKDAY_INDEX[value.trim()])
    .filter((value): value is number => typeof value === "number")

  const targetWeekdays = weekdays.length > 0 ? weekdays : [1]
  const base = new Date(after)

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(base)
    candidate.setDate(base.getDate() + offset)
    candidate.setHours(hour, minute, 0, 0)
    if (!targetWeekdays.includes(candidate.getDay())) continue
    if (candidate.getTime() > after) return candidate.getTime()
  }

  const fallback = new Date(base)
  fallback.setDate(base.getDate() + 7)
  fallback.setHours(hour, minute, 0, 0)
  return fallback.getTime()
}

function nextRRuleRun(expression: string, after: number) {
  const parts = parseRRule(expression)
  const freq = parts.get("FREQ")

  switch (freq) {
    case "HOURLY":
      return nextHourlyRRule(parts, after)
    case "DAILY":
      return nextDailyRRule(parts, after)
    case "WEEKLY":
      return nextWeeklyRRule(parts, after)
    default:
      throw new Error(`Unsupported RRULE frequency: ${freq || "missing"}`)
  }
}

function parseCronField(field: string, min: number, max: number) {
  const values = new Set<number>()
  const parts = field.split(",").map((part) => part.trim()).filter(Boolean)

  for (const part of parts) {
    if (part === "*") {
      for (let value = min; value <= max; value += 1) values.add(value)
      continue
    }

    const stepMatch = /^\*\/(\d+)$/.exec(part)
    if (stepMatch) {
      const step = Math.max(1, Number(stepMatch[1]))
      for (let value = min; value <= max; value += step) values.add(value)
      continue
    }

    const rangeMatch = /^(\d+)-(\d+)$/.exec(part)
    if (rangeMatch) {
      const start = Math.max(min, Number(rangeMatch[1]))
      const end = Math.min(max, Number(rangeMatch[2]))
      for (let value = start; value <= end; value += 1) values.add(value)
      continue
    }

    const numeric = Number(part)
    if (Number.isInteger(numeric) && numeric >= min && numeric <= max) {
      values.add(numeric)
      continue
    }

    throw new Error(`Unsupported cron field: ${field}`)
  }

  if (values.size === 0) throw new Error(`Unsupported cron field: ${field}`)
  return values
}

function nextCronRun(expression: string, after: number) {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error("Cron schedules must use five fields: minute hour day month weekday")
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = fields
  const minutes = parseCronField(minuteField!, 0, 59)
  const hours = parseCronField(hourField!, 0, 23)
  const days = parseCronField(dayField!, 1, 31)
  const months = parseCronField(monthField!, 1, 12)
  const weekdays = parseCronField(weekdayField!, 0, 7)

  const candidate = new Date(Math.floor(after / MINUTE_MS) * MINUTE_MS + MINUTE_MS)
  candidate.setSeconds(0, 0)

  for (let index = 0; index < MAX_CRON_LOOKAHEAD_MINUTES; index += 1) {
    const weekday = candidate.getDay()
    const normalizedWeekdayMatch = weekdays.has(weekday) || (weekday === 0 && weekdays.has(7))
    if (
      minutes.has(candidate.getMinutes()) &&
      hours.has(candidate.getHours()) &&
      days.has(candidate.getDate()) &&
      months.has(candidate.getMonth() + 1) &&
      normalizedWeekdayMatch
    ) {
      return candidate.getTime()
    }

    candidate.setTime(candidate.getTime() + MINUTE_MS)
  }

  throw new Error("Cron schedule did not produce a run in the next 366 days.")
}

export function computeNextRunAt(schedule: AutomationSchedule, after = Date.now()) {
  if (schedule.type === "rrule") return nextRRuleRun(schedule.expression, after)
  return nextCronRun(schedule.expression, after)
}

