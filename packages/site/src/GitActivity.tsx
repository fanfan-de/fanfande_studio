import { type CSSProperties, useEffect, useMemo, useState } from "react"
import {
  gitActivity,
  type GitCommitRecord,
} from "./generated/git-activity"

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

function getActivityLevel(count: number) {
  if (count === 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

function groupCommitsByDate(commits: GitCommitRecord[]) {
  const grouped = new Map<string, GitCommitRecord[]>()

  for (const commit of commits) {
    const existing = grouped.get(commit.date) ?? []
    grouped.set(commit.date, [...existing, commit])
  }

  return grouped
}

function getAvailableYears(commits: GitCommitRecord[]) {
  const years = new Set<number>([new Date().getFullYear()])

  for (const commit of commits) {
    years.add(Number(commit.date.slice(0, 4)))
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

function getLongestStreak(year: number, commitsByDate: Map<string, GitCommitRecord[]>) {
  let best = 0
  let current = 0

  for (
    let cursor = new Date(year, 0, 1);
    cursor <= new Date(year, 11, 31);
    cursor = addDays(cursor, 1)
  ) {
    if ((commitsByDate.get(toDateKey(cursor))?.length ?? 0) > 0) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }

  return best
}

function CommitLink({ commit }: { commit: GitCommitRecord }) {
  const href = gitActivity.commitBaseUrl
    ? `${gitActivity.commitBaseUrl}${commit.hash}`
    : undefined

  const content = (
    <>
      <span>{commit.shortHash}</span>
      <strong>{commit.subject}</strong>
    </>
  )

  if (!href) {
    return <div className="commit-row">{content}</div>
  }

  return (
    <a className="commit-row" href={href} target="_blank" rel="noreferrer">
      {content}
    </a>
  )
}

export function GitActivitySection() {
  const commitsByDate = useMemo(
    () => groupCommitsByDate(gitActivity.commits),
    [],
  )
  const yearOptions = useMemo(
    () => getAvailableYears(gitActivity.commits),
    [],
  )
  const [selectedYear, setSelectedYear] = useState(yearOptions[0])

  const commitsInYear = useMemo(
    () =>
      gitActivity.commits.filter((commit) =>
        commit.date.startsWith(`${selectedYear}-`),
      ),
    [selectedYear],
  )
  const defaultSelectedDate =
    commitsInYear[0]?.date ?? `${selectedYear}-${selectedYear === new Date().getFullYear() ? toDateKey(new Date()).slice(5) : "01-01"}`
  const [selectedDate, setSelectedDate] = useState(defaultSelectedDate)

  useEffect(() => {
    setSelectedDate(defaultSelectedDate)
  }, [defaultSelectedDate])

  const weeks = useMemo(() => buildCalendarWeeks(selectedYear), [selectedYear])
  const monthLabels = useMemo(
    () => getMonthLabels(weeks, selectedYear),
    [selectedYear, weeks],
  )
  const selectedCommits = commitsByDate.get(selectedDate) ?? []
  const activeDays = commitsInYear.reduce((dates, commit) => {
    dates.add(commit.date)
    return dates
  }, new Set<string>()).size
  const longestStreak = getLongestStreak(selectedYear, commitsByDate)
  const generatedAt = generatedFormatter.format(new Date(gitActivity.generatedAt))

  return (
    <section className="git-activity-section" id="updates">
      <div className="activity-heading">
        <p className="section-kicker">Git powered updates</p>
        <h2>把真实 commit 记录变成项目更新热力图。</h2>
        <p>
          页面数据在启动和构建时从本地 Git 数据库自动生成，既保留 GitHub
          式的贡献视图，也能展开查看每一天实际推进了什么。
        </p>
      </div>

      <div className="activity-shell">
        <div className="activity-panel">
          <div className="activity-toolbar">
            <div>
              <span className="activity-eyebrow">当前分支</span>
              <strong>{gitActivity.branch}</strong>
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
              <dt>{selectedYear} commits</dt>
              <dd>{commitsInYear.length}</dd>
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
              <dt>生成时间</dt>
              <dd>{generatedAt}</dd>
            </div>
          </dl>

          <div className="heatmap-scroll" aria-label={`${selectedYear} 年 Git commit 热力图`}>
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
                    const dayCommits = commitsByDate.get(dateKey) ?? []
                    const level = getActivityLevel(dayCommits.length)
                    const isOutsideYear = date.getFullYear() !== selectedYear
                    const isSelected = dateKey === selectedDate
                    const label = `${fullDateFormatter.format(date)}：${dayCommits.length} 次更新`

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
          <h3>{selectedCommits.length} 次更新</h3>
          {selectedCommits.length > 0 ? (
            <div className="commit-list">
              {selectedCommits.slice(0, 8).map((commit) => (
                <CommitLink commit={commit} key={commit.hash} />
              ))}
              {selectedCommits.length > 8 ? (
                <span className="commit-overflow">
                  还有 {selectedCommits.length - 8} 条 commit 未显示
                </span>
              ) : null}
            </div>
          ) : (
            <span className="empty-activity">这一天没有提交记录。</span>
          )}
        </aside>
      </div>
    </section>
  )
}
