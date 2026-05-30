import { describe, expect, test } from "bun:test"
import { computeNextRunAt } from "#automation/schedule.ts"

describe("automation schedules", () => {
  test("computes the next daily RRULE occurrence", () => {
    const after = new Date(2026, 0, 1, 8, 30, 0, 0).getTime()
    const next = computeNextRunAt({
      type: "rrule",
      expression: "FREQ=DAILY;BYHOUR=9;BYMINUTE=15",
      timezone: "UTC",
    }, after)

    expect(next).toBe(new Date(2026, 0, 1, 9, 15, 0, 0).getTime())
  })

  test("rolls daily RRULE occurrences forward after the target minute", () => {
    const after = new Date(2026, 0, 1, 9, 15, 0, 0).getTime()
    const next = computeNextRunAt({
      type: "rrule",
      expression: "FREQ=DAILY;BYHOUR=9;BYMINUTE=15",
      timezone: "UTC",
    }, after)

    expect(next).toBe(new Date(2026, 0, 2, 9, 15, 0, 0).getTime())
  })

  test("computes five-field cron occurrences", () => {
    const after = new Date(2026, 0, 1, 9, 29, 0, 0).getTime()
    const next = computeNextRunAt({
      type: "cron",
      expression: "30 9 * * *",
      timezone: "UTC",
    }, after)

    expect(next).toBe(new Date(2026, 0, 1, 9, 30, 0, 0).getTime())
  })
})
