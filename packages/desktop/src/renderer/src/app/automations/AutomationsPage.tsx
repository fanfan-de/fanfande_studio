import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  ArchiveIcon,
  AutomationIcon,
  CheckIcon,
  DeleteIcon,
  SessionRunningIcon,
  StopIcon,
} from "../icons"
import { ShellTopMenu, joinClassNames } from "../shared-ui"
import type {
  AgentAutomationCreateInput,
  AgentAutomationDefinition,
  AgentAutomationRun,
  AgentAutomationTriageStatus,
} from "../../../../shared/desktop-ipc-contract"

type AgentAutomationSchedule = AgentAutomationDefinition["schedule"]
type AgentAutomationStatus = AgentAutomationDefinition["status"]
type AutomationDesktopApi = Required<
  Pick<
    NonNullable<Window["desktop"]>,
    | "cancelAutomationRun"
    | "createAutomation"
    | "deleteAutomation"
    | "listAutomationRuns"
    | "listAutomations"
    | "runAutomation"
    | "updateAutomation"
    | "updateAutomationRunTriage"
  >
>

interface AutomationProjectOption {
  directory: string
  id: string
  name: string
}

interface AutomationsPageProps {
  projects: AutomationProjectOption[]
  windowControls?: ReactNode
  onOpenSession?: (sessionID: string) => void
}

type CadenceKey = "one-minute" | "five-minutes" | "fifteen-minutes" | "hourly" | "daily" | "weekly"

const SCHEDULE_OPTIONS: Array<{
  expression: string
  key: CadenceKey
  label: string
  type: AgentAutomationSchedule["type"]
}> = [
  { key: "daily", label: "Daily", type: "rrule", expression: "FREQ=DAILY;INTERVAL=1" },
  { key: "weekly", label: "Weekly", type: "rrule", expression: "FREQ=WEEKLY;INTERVAL=1" },
  { key: "hourly", label: "Hourly", type: "rrule", expression: "FREQ=HOURLY;INTERVAL=1" },
  { key: "fifteen-minutes", label: "15 min", type: "cron", expression: "*/15 * * * *" },
  { key: "five-minutes", label: "5 min", type: "cron", expression: "*/5 * * * *" },
  { key: "one-minute", label: "1 min", type: "cron", expression: "*/1 * * * *" },
]

const AUTOMATION_TEMPLATES: Array<{
  cadence: CadenceKey
  id: string
  name: string
  prompt: string
}> = [
  {
    id: "daily-brief",
    cadence: "daily",
    name: "Daily project brief",
    prompt: [
      "Review the current project state and recent changes.",
      "Return JSON with findings for urgent regressions, failed checks, stale branches, or blocked work.",
      "Use an empty findings array when nothing needs attention.",
    ].join("\n"),
  },
  {
    id: "weekly-review",
    cadence: "weekly",
    name: "Weekly maintenance review",
    prompt: [
      "Review the project for maintenance risks.",
      "Look for failing tests, dependency drift, uncommitted high-risk changes, and documentation gaps.",
      "Return concise JSON findings with severity and suggested next actions.",
    ].join("\n"),
  },
  {
    id: "one-minute-watch",
    cadence: "one-minute",
    name: "1-minute smoke watch",
    prompt: [
      "Check whether the project has obvious build, lint, or test blockers.",
      "Prefer fast local checks already configured by the repository.",
      "Return JSON findings only for actionable problems.",
    ].join("\n"),
  },
]

const ACTIVE_RUN_STATUSES = new Set<AgentAutomationRun["status"]>(["queued", "running"])

function requireDesktopApi(): AutomationDesktopApi {
  if (!window.desktop) {
    throw new Error("Desktop API is unavailable.")
  }
  const desktop = window.desktop
  if (
    !desktop.cancelAutomationRun ||
    !desktop.createAutomation ||
    !desktop.deleteAutomation ||
    !desktop.listAutomationRuns ||
    !desktop.listAutomations ||
    !desktop.runAutomation ||
    !desktop.updateAutomation ||
    !desktop.updateAutomationRunTriage
  ) {
    throw new Error("Automation API is unavailable.")
  }
  return desktop as AutomationDesktopApi
}

function getScheduleLabel(schedule: AgentAutomationSchedule) {
  const match = SCHEDULE_OPTIONS.find((option) => option.type === schedule.type && option.expression === schedule.expression)
  if (match) return match.label
  if (schedule.type === "cron") return `Cron ${schedule.expression}`
  return schedule.expression
}

function formatDate(timestamp: number | undefined) {
  if (!timestamp) return "Not scheduled"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

function formatProjectTarget(automation: AgentAutomationDefinition, projectsByID: Map<string, AutomationProjectOption>) {
  const projectNames = (automation.scope.projectIDs ?? [])
    .map((projectID) => projectsByID.get(projectID)?.name ?? projectID)
    .filter(Boolean)
  if (projectNames.length > 0) return projectNames.join(", ")

  const directories = automation.scope.directories ?? []
  if (directories.length > 0) {
    return directories
      .map((directory) => directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory)
      .join(", ")
  }

  if (automation.scope.sessionID) return `Session ${automation.scope.sessionID}`
  return "No target"
}

function getStatusBadgeClassName(status: AgentAutomationStatus | AgentAutomationRun["status"]) {
  if (status === "active" || status === "completed") return "automations-badge is-success"
  if (status === "running" || status === "queued") return "automations-badge is-info"
  if (status === "failed" || status === "blocked") return "automations-badge is-danger"
  if (status === "cancelled" || status === "paused") return "automations-badge is-muted"
  return "automations-badge"
}

function getRunTitle(run: AgentAutomationRun, automationsByID: Map<string, AgentAutomationDefinition>) {
  return automationsByID.get(run.automationID)?.name ?? run.automationID
}

function getRunSummary(run: AgentAutomationRun) {
  if (run.error) return run.error
  if (run.summary) return run.summary
  if (run.status === "queued") return "Queued"
  if (run.status === "running") return "Running"
  return "No summary"
}

export function AutomationsPage({ projects, windowControls, onOpenSession }: AutomationsPageProps) {
  const [automations, setAutomations] = useState<AgentAutomationDefinition[]>([])
  const [runs, setRuns] = useState<AgentAutomationRun[]>([])
  const [selectedProjectID, setSelectedProjectID] = useState("")
  const [draftName, setDraftName] = useState(AUTOMATION_TEMPLATES[0]?.name ?? "")
  const [draftPrompt, setDraftPrompt] = useState(AUTOMATION_TEMPLATES[0]?.prompt ?? "")
  const [cadence, setCadence] = useState<CadenceKey>(AUTOMATION_TEMPLATES[0]?.cadence ?? "daily")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [runningAutomationID, setRunningAutomationID] = useState<string | null>(null)
  const [mutatingRunID, setMutatingRunID] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectsByID = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const automationsByID = useMemo(
    () => new Map(automations.map((automation) => [automation.id, automation])),
    [automations],
  )
  const activeAutomationCount = automations.filter((automation) => automation.status === "active").length
  const inboxRuns = runs.filter((run) => run.triageStatus === "inbox" || ACTIVE_RUN_STATUSES.has(run.status))

  useEffect(() => {
    if (!selectedProjectID && projects[0]) {
      setSelectedProjectID(projects[0].id)
    }
  }, [projects, selectedProjectID])

  async function refreshAutomations(options: { silent?: boolean } = {}) {
    if (!options.silent) setIsLoading(true)
    try {
      const desktop = requireDesktopApi()
      const [nextAutomations, nextRuns] = await Promise.all([
        desktop.listAutomations(),
        desktop.listAutomationRuns({ limit: 100 }),
      ])
      setAutomations(nextAutomations.filter((automation) => automation.status !== "deleted"))
      setRuns(nextRuns)
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
    } finally {
      if (!options.silent) setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      await refreshAutomations()
      if (cancelled) return
    }

    void load()
    const intervalID = window.setInterval(() => {
      void refreshAutomations({ silent: true })
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(intervalID)
    }
  }, [])

  function applyTemplate(templateID: string) {
    const template = AUTOMATION_TEMPLATES.find((item) => item.id === templateID)
    if (!template) return
    setDraftName(template.name)
    setDraftPrompt(template.prompt)
    setCadence(template.cadence)
  }

  async function handleCreateAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const project = projectsByID.get(selectedProjectID)
    const name = draftName.trim()
    const prompt = draftPrompt.trim()
    if (!project) {
      setError("Select a project before creating an automation.")
      return
    }
    if (!name || !prompt) {
      setError("Name and prompt are required.")
      return
    }

    const scheduleOption = SCHEDULE_OPTIONS.find((option) => option.key === cadence) ?? SCHEDULE_OPTIONS[0]
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    const input: AgentAutomationCreateInput = {
      name,
      kind: "project",
      status: "active",
      schedule: {
        type: scheduleOption.type,
        expression: scheduleOption.expression,
        timezone,
      },
      scope: {
        projectIDs: [project.id],
      },
      execution: {
        environment: "local",
        permissionMode: "default",
      },
      prompt,
      outputPolicy: {
        triage: "findings-only",
        autoArchiveNoFindings: true,
      },
    }

    setIsSaving(true)
    try {
      await requireDesktopApi().createAutomation(input)
      setError(null)
      await refreshAutomations({ silent: true })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setIsSaving(false)
    }
  }

  async function updateAutomationStatus(automation: AgentAutomationDefinition, status: AgentAutomationStatus) {
    try {
      await requireDesktopApi().updateAutomation({
        automationID: automation.id,
        automation: { status },
      })
      await refreshAutomations({ silent: true })
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError))
    }
  }

  async function deleteAutomation(automation: AgentAutomationDefinition) {
    if (!window.confirm(`Delete automation "${automation.name}"?`)) return
    try {
      await requireDesktopApi().deleteAutomation({ automationID: automation.id })
      await refreshAutomations({ silent: true })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  async function runAutomation(automationID: string) {
    setRunningAutomationID(automationID)
    try {
      await requireDesktopApi().runAutomation({ automationID })
      await refreshAutomations({ silent: true })
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError))
    } finally {
      setRunningAutomationID(null)
    }
  }

  async function setRunTriage(runID: string, triageStatus: AgentAutomationTriageStatus) {
    setMutatingRunID(runID)
    try {
      await requireDesktopApi().updateAutomationRunTriage({ runID, triageStatus })
      await refreshAutomations({ silent: true })
    } catch (triageError) {
      setError(triageError instanceof Error ? triageError.message : String(triageError))
    } finally {
      setMutatingRunID(null)
    }
  }

  async function cancelRun(runID: string) {
    setMutatingRunID(runID)
    try {
      await requireDesktopApi().cancelAutomationRun({ runID })
      await refreshAutomations({ silent: true })
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError))
    } finally {
      setMutatingRunID(null)
    }
  }

  return (
    <section className="automations-page" aria-label="Automations">
      <ShellTopMenu
        as="header"
        ariaLabel="Automations top menu"
        className="canvas-region-top-menu automations-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="automations-top-menu-label">
            <AutomationIcon />
            <span>Automations</span>
          </div>
        )}
        dragRegion
        layout="three-column"
        trailing={windowControls}
        trailingClassName="automations-top-menu-window-controls"
      />

      <div className="automations-page-main">
        {error ? (
          <div className="automations-banner is-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="automations-layout" aria-label="Automation workspace">
          <aside className="automations-composer-panel" aria-label="Create automation">
            <div className="automations-panel-heading">
              <span className="label">Create</span>
              <h2>New automation</h2>
            </div>

            <div className="automations-template-grid" aria-label="Automation templates">
              {AUTOMATION_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  className="automations-template-button"
                  type="button"
                  onClick={() => applyTemplate(template.id)}
                >
                  <strong>{template.name}</strong>
                  <span>{SCHEDULE_OPTIONS.find((option) => option.key === template.cadence)?.label}</span>
                </button>
              ))}
            </div>

            <form className="automations-form" onSubmit={handleCreateAutomation}>
              <label className="automations-field">
                <span>Name</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </label>

              <label className="automations-field">
                <span>Project</span>
                <select
                  value={selectedProjectID}
                  disabled={projects.length === 0}
                  onChange={(event) => setSelectedProjectID(event.target.value)}
                >
                  {projects.length === 0 ? <option value="">No projects</option> : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="automations-segmented" aria-label="Cadence">
                {SCHEDULE_OPTIONS.map((option) => (
                  <label key={option.key} className={cadence === option.key ? "is-active" : ""}>
                    <input
                      type="radio"
                      name="automation-cadence"
                      value={option.key}
                      checked={cadence === option.key}
                      onChange={() => setCadence(option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>

              <label className="automations-field">
                <span>Prompt</span>
                <textarea
                  rows={9}
                  value={draftPrompt}
                  onChange={(event) => setDraftPrompt(event.target.value)}
                />
              </label>

              <button
                className="primary-button automations-create-button"
                type="submit"
                disabled={isSaving || projects.length === 0}
              >
                {isSaving ? "Creating..." : "Create automation"}
              </button>
            </form>
          </aside>

          <section className="automations-list-panel" aria-label="Automations list">
            <div className="automations-summary-row">
              <div className="automations-panel-heading">
                <span className="label">Schedules</span>
                <h2>{activeAutomationCount} active</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => void refreshAutomations()}>
                Refresh
              </button>
            </div>

            {isLoading ? (
              <article className="automations-empty-state">
                <h3>Loading automations</h3>
                <p>Fetching schedules and recent runs.</p>
              </article>
            ) : automations.length === 0 ? (
              <article className="automations-empty-state">
                <h3>No automations</h3>
                <p>Create a project automation to start scheduled checks.</p>
              </article>
            ) : (
              <div className="automations-card-list">
                {automations.map((automation) => {
                  const isRunning = runningAutomationID === automation.id
                  const isActive = automation.status === "active"
                  const activeRun = runs.find((run) => run.automationID === automation.id && ACTIVE_RUN_STATUSES.has(run.status))

                  return (
                    <article key={automation.id} className="automations-card">
                      <div className="automations-card-main">
                        <div className="automations-card-title-row">
                          <h3>{automation.name}</h3>
                          <span className={getStatusBadgeClassName(automation.status)}>
                            {automation.status}
                          </span>
                        </div>
                        <p>{automation.prompt}</p>
                        <dl className="automations-meta-grid">
                          <div>
                            <dt>Target</dt>
                            <dd>{formatProjectTarget(automation, projectsByID)}</dd>
                          </div>
                          <div>
                            <dt>Cadence</dt>
                            <dd>{getScheduleLabel(automation.schedule)}</dd>
                          </div>
                          <div>
                            <dt>Next</dt>
                            <dd>{formatDate(automation.nextRunAt)}</dd>
                          </div>
                          <div>
                            <dt>Last</dt>
                            <dd>{formatDate(automation.lastRunAt)}</dd>
                          </div>
                        </dl>
                      </div>

                      <div className="automations-card-actions">
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Run ${automation.name}`}
                          title={`Run ${automation.name}`}
                          disabled={isRunning || Boolean(activeRun)}
                          onClick={() => void runAutomation(automation.id)}
                        >
                          {isRunning || activeRun ? <SessionRunningIcon /> : <AutomationIcon />}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void updateAutomationStatus(automation, isActive ? "paused" : "active")}
                        >
                          {isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          className="icon-button is-danger"
                          type="button"
                          aria-label={`Delete ${automation.name}`}
                          title={`Delete ${automation.name}`}
                          onClick={() => void deleteAutomation(automation)}
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="automations-runs-panel" aria-label="Automation inbox">
            <div className="automations-panel-heading">
              <span className="label">Inbox</span>
              <h2>{inboxRuns.length} runs</h2>
            </div>

            {inboxRuns.length === 0 ? (
              <article className="automations-empty-state">
                <h3>No pending runs</h3>
                <p>Completed runs without findings are archived automatically.</p>
              </article>
            ) : (
              <div className="automations-run-list">
                {inboxRuns.map((run) => {
                  const isActiveRun = ACTIVE_RUN_STATUSES.has(run.status)
                  const isMutating = mutatingRunID === run.id

                  return (
                    <article key={run.id} className={joinClassNames("automations-run-card", isActiveRun && "is-active")}>
                      <div className="automations-run-header">
                        <strong>{getRunTitle(run, automationsByID)}</strong>
                        <span className={getStatusBadgeClassName(run.status)}>{run.status}</span>
                      </div>
                      <p>{getRunSummary(run)}</p>
                      <div className="automations-run-meta">
                        <span>{run.trigger}</span>
                        <span>{run.findingCount} findings</span>
                        <span>{formatDate(run.startedAt ?? run.createdAt)}</span>
                      </div>
                      <div className="automations-run-actions">
                        {run.sessionID ? (
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => onOpenSession?.(run.sessionID!)}
                          >
                            Open
                          </button>
                        ) : null}
                        {isActiveRun ? (
                          <button
                            className="icon-button"
                            type="button"
                            aria-label="Cancel run"
                            title="Cancel run"
                            disabled={isMutating}
                            onClick={() => void cancelRun(run.id)}
                          >
                            <StopIcon />
                          </button>
                        ) : (
                          <>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label="Mark run read"
                              title="Mark run read"
                              disabled={isMutating}
                              onClick={() => void setRunTriage(run.id, "read")}
                            >
                              <CheckIcon />
                            </button>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label="Archive run"
                              title="Archive run"
                              disabled={isMutating}
                              onClick={() => void setRunTriage(run.id, "archived")}
                            >
                              <ArchiveIcon />
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </aside>
        </section>
      </div>
    </section>
  )
}
