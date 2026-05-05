import { type CSSProperties, useEffect, useMemo, useState } from "react"
import {
  localGitActivitySnapshot,
  loadGitHubActivitySnapshot,
  type ActivityDay,
  type ActivityRecord,
  type RuntimeGitActivitySnapshot,
} from "./githubActivity"

const dayMs = 24 * 60 * 60 * 1000
const weekDays = ["日", "一", "二", "三", "四", "五", "六"]

const fullDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
})

const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
})

const generatedFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
})

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * dayMs)
}

function buildCalendarWeeks(year: number) {
  const firstDay = new Date(year, 0, 1)
  const lastDay = new Date(year, 11, 31)
  const gridStart = addDays(firstDay, -firstDay.getDay())
  const gridEnd = addDays(lastDay, 6 - lastDay.getDay())
  const weeks: Date[][] = []

  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, index) => addDays(cursor, index)),
    )
  }

  return weeks
}

function getActivityLevel(day?: ActivityDay) {
  const count = day?.count ?? 0

  if (count === 0) return 0
  if (day?.level !== undefined) return day.level
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function groupDaysByDate(days: ActivityDay[]) {
  const grouped = new Map<string, ActivityDay>()

  for (const day of days) {
    grouped.set(day.date, day)
  }

  return grouped
}

function getAvailableYears(days: ActivityDay[]) {
  const years = new Set<number>([new Date().getFullYear()])

  for (const day of days) {
    if (day.count > 0) {
      years.add(Number(day.date.slice(0, 4)))
    }
  }

  return Array.from(years).sort((a, b) => b - a)
}

function getMonthLabels(weeks: Date[][], year: number) {
  return weeks.flatMap((week, weekIndex) => {
    const monthStart = week.find(
      (date) => date.getFullYear() === year && date.getDate() === 1,
    )

    if (!monthStart) {
      return []
    }

    return [
      {
        label: monthFormatter.format(monthStart),
        column: weekIndex + 1,
      },
    ]
  })
}

function getLongestStreak(year: number, daysByDate: Map<string, ActivityDay>) {
  let best = 0
  let current = 0

  for (
    let cursor = new Date(year, 0, 1);
    cursor <= new Date(year, 11, 31);
    cursor = addDays(cursor, 1)
  ) {
    if ((daysByDate.get(toDateKey(cursor))?.count ?? 0) > 0) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }

  return best
}

function getDefaultSelectedDate(year: number, daysInYear: ActivityDay[]) {
  const activeDates = daysInYear
    .filter((day) => day.count > 0)
    .map((day) => day.date)
    .sort()

  return (
    activeDates.at(-1) ??
    `${year}-${year === new Date().getFullYear() ? toDateKey(new Date()).slice(5) : "01-01"}`
  )
}

function getSyncLabel(
  activity: RuntimeGitActivitySnapshot,
  syncState: "loading" | "ready" | "fallback",
) {
  if (syncState === "loading") return "同步 GitHub 中"
  if (syncState === "fallback") return "GitHub 同步失败，显示本地快照"
  return activity.sourceLabel
}

function ActivityRecordLink({ record }: { record: ActivityRecord }) {
  const content = (
    <>
      <span>{record.shortHash}</span>
      <strong>{record.subject}</strong>
    </>
  )

  if (!record.url) {
    return <div className="commit-row">{content}</div>
  }

  return (
    <a className="commit-row" href={record.url} target="_blank" rel="noreferrer">
      {content}
    </a>
  )
}

export function GitActivitySection() {
  const [activity, setActivity] = useState<RuntimeGitActivitySnapshot>(
    () => localGitActivitySnapshot,
  )
  const [syncState, setSyncState] = useState<"loading" | "ready" | "fallback">(
    "loading",
  )

  useEffect(() => {
    let ignore = false

    loadGitHubActivitySnapshot()
      .then((snapshot) => {
        if (ignore) return
        setActivity(snapshot)
        setSyncState("ready")
      })
      .catch(() => {
        if (ignore) return
        setSyncState("fallback")
      })

    return () => {
      ignore = true
    }
  }, [])

  const daysByDate = useMemo(
    () => groupDaysByDate(activity.days),
    [activity.days],
  )
  const yearOptions = useMemo(
    () => getAvailableYears(activity.days),
    [activity.days],
  )
  const [selectedYear, setSelectedYear] = useState(yearOptions[0])

  useEffect(() => {
    if (!yearOptions.includes(selectedYear)) {
      setSelectedYear(yearOptions[0])
    }
  }, [selectedYear, yearOptions])

  const daysInYear = useMemo(
    () =>
      activity.days.filter((day) => day.date.startsWith(`${selectedYear}-`)),
    [activity.days, selectedYear],
  )
  const defaultSelectedDate = getDefaultSelectedDate(selectedYear, daysInYear)
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate)

  useEffect(() => {
    setSelectedDate(defaultSelectedDate)
  }, [defaultSelectedDate])

  const weeks = useMemo(() => buildCalendarWeeks(selectedYear), [selectedYear])
  const monthLabels = useMemo(
    () => getMonthLabels(weeks, selectedYear),
    [selectedYear, weeks],
  )
  const selectedDay = daysByDate.get(selectedDate)
  const selectedRecords = selectedDay?.records ?? []
  const selectedCount = selectedDay?.count ?? 0
  const activeDays = daysInYear.filter((day) => day.count > 0).length
  const contributionCount = daysInYear.reduce((total, day) => total + day.count, 0)
  const longestStreak = getLongestStreak(selectedYear, daysByDate)
  const generatedAt = generatedFormatter.format(new Date(activity.generatedAt))
  const isGitHubSource = activity.source === "github"
  const itemLabel = isGitHubSource ? "contributions" : "commits"
  const detailLabel = isGitHubSource ? "贡献" : "更新"
  const syncLabel = getSyncLabel(activity, syncState)
  const syncClassName = [
    "activity-sync",
    syncState === "loading" ? "is-loading" : "",
    syncState === "fallback" ? "is-fallback" : "is-live",
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <section className="git-activity-section" id="updates">
      <div className="activity-heading">
        <p className="section-kicker">GitHub live updates</p>
        <h2>实时同步 GitHub 贡献热力图。</h2>
        <p>
          页面打开时拉取 GitHub 公开贡献日历，让这里的热力图对应你的 GitHub
          账号；如果网络接口不可用，会自动回退到本地 Git 快照。
        </p>
      </div>

      <div className="activity-shell">
        <div className="activity-panel">
          <div className="activity-toolbar">
            <div>
              <span className="activity-eyebrow">
                {isGitHubSource ? "GitHub 账号" : "当前分支"}
              </span>
              <strong>{activity.ownerLabel}</strong>
              <span className={syncClassName}>{syncLabel}</span>
            </div>
            <div className="year-switcher" aria-label="选择年份">
              {yearOptions.map((year) => (
                <button
                  className={year === selectedYear ? "is-active" : ""}
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  type="button"
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          <dl className="activity-stats">
            <div>
              <dt>
                {selectedYear} {itemLabel}
              </dt>
              <dd>{contributionCount}</dd>
            </div>
            <div>
              <dt>活跃天数</dt>
              <dd>{activeDays}</dd>
            </div>
            <div>
              <dt>最长连续更新</dt>
              <dd>{longestStreak} 天</dd>
            </div>
            <div>
              <dt>{isGitHubSource ? "同步时间" : "生成时间"}</dt>
              <dd>{generatedAt}</dd>
            </div>
          </dl>

          <div
            className="heatmap-scroll"
            aria-label={`${selectedYear} 年 GitHub 贡献热力图`}
          >
            <div
              className="heatmap-months"
              style={{ "--week-count": weeks.length } as CSSProperties}
            >
              {monthLabels.map((month) => (
                <span
                  key={`${month.label}-${month.column}`}
                  style={{ gridColumnStart: month.column }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div className="heatmap-body">
              <div className="heatmap-weekdays" aria-hidden="true">
                {weekDays.map((day, index) => (
                  <span key={day}>{index % 2 === 0 ? "" : day}</span>
                ))}
              </div>
              <div
                className="heatmap-grid"
                style={{ "--week-count": weeks.length } as CSSProperties}
              >
                {weeks.flatMap((week) =>
                  week.map((date) => {
                    const dateKey = toDateKey(date)
                    const day = daysByDate.get(dateKey)
                    const dayCount = day?.count ?? 0
                    const level = getActivityLevel(day)
                    const isOutsideYear = date.getFullYear() !== selectedYear
                    const isSelected = dateKey === selectedDate
                    const label = `${fullDateFormatter.format(date)}：${dayCount} 次${detailLabel}`

                    return (
                      <button
                        aria-label={label}
                        className={[
                          "heatmap-day",
                          `heatmap-day-${level}`,
                          isOutsideYear ? "is-outside-year" : "",
                          isSelected ? "is-selected" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={dateKey}
                        onClick={() => setSelectedDate(dateKey)}
                        title={label}
                        type="button"
                      />
                    )
                  }),
                )}
              </div>
            </div>
          </div>

          <div className="heatmap-legend" aria-label="更新强度说明">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <i className={`heatmap-day heatmap-day-${level}`} key={level} />
            ))}
            <span>多</span>
          </div>
        </div>

        <aside className="activity-detail" aria-live="polite">
          <p>{fullDateFormatter.format(parseDateKey(selectedDate))}</p>
          <h3>
            {selectedCount} 次{detailLabel}
          </h3>
          {selectedRecords.length > 0 ? (
            <div className="commit-list">
              {selectedRecords.slice(0, 8).map((record) => (
                <ActivityRecordLink record={record} key={record.hash} />
              ))}
              {selectedRecords.length > 8 ? (
                <span className="commit-overflow">
                  还有 {selectedRecords.length - 8} 条记录未显示
                </span>
              ) : null}
            </div>
          ) : (
            <span className="empty-activity">
              这一天没有{isGitHubSource ? "公开贡献" : "提交"}记录。
            </span>
          )}
        </aside>
      </div>
    </section>
  )
}
