import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  ArchiveIcon,
  AutomationIcon,
  BackIcon,
  CheckIcon,
  ChevronRightIcon,
  DeleteIcon,
  PlusIcon,
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

function formatDate(timestamp: number | undefined, fallback = "Not scheduled") {
  if (!timestamp) return fallback
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

function getRunTimestamp(run: AgentAutomationRun) {
  return run.startedAt ?? run.createdAt
}

function getLatestRunByAutomationID(runs: AgentAutomationRun[]) {
  const latestRuns = new Map<string, AgentAutomationRun>()
  for (const run of runs) {
    const current = latestRuns.get(run.automationID)
    if (!current || getRunTimestamp(run) > getRunTimestamp(current)) {
      latestRuns.set(run.automationID, run)
    }
  }
  return latestRuns
}

function getOutputPolicyLabel(automation: AgentAutomationDefinition) {
  if (automation.outputPolicy.triage === "always") return "Always send to inbox"
  if (automation.outputPolicy.triage === "never") return "Never triage"
  return automation.outputPolicy.autoArchiveNoFindings ? "Findings only" : "Findings review"
}

export function AutomationsPage({ projects, windowControls, onOpenSession }: AutomationsPageProps) {
  const [automations, setAutomations] = useState<AgentAutomationDefinition[]>([])
  const [runs, setRuns] = useState<AgentAutomationRun[]>([])
  const [selectedAutomationID, setSelectedAutomationID] = useState<string | null>(null)
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false)
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
  const latestRunByAutomationID = useMemo(() => getLatestRunByAutomationID(runs), [runs])
  const selectedAutomation = selectedAutomationID ? automationsByID.get(selectedAutomationID) ?? null : null
  const selectedAutomationRuns = selectedAutomationID
    ? runs.filter((run) => run.automationID === selectedAutomationID)
    : []
  const activeAutomationCount = automations.filter((automation) => automation.status === "active").length

  useEffect(() => {
    if (!selectedProjectID && projects[0]) {
      setSelectedProjectID(projects[0].id)
    }
  }, [projects, selectedProjectID])

  useEffect(() => {
    if (selectedAutomationID && !automationsByID.has(selectedAutomationID)) {
      setSelectedAutomationID(null)
    }
  }, [automationsByID, selectedAutomationID])

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
      const createdAutomation = await requireDesktopApi().createAutomation(input)
      setError(null)
      setIsCreatePanelOpen(false)
      setSelectedAutomationID(createdAutomation.id)
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
      setSelectedAutomationID(null)
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

  const createPanel = isCreatePanelOpen ? (
    <div className="automations-create-overlay">
      <section className="automations-create-panel" role="dialog" aria-modal="true" aria-label="Create automation">
        <div className="automations-create-header">
          <div className="automations-panel-heading">
            <span className="label">Create</span>
            <h2>New automation</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setIsCreatePanelOpen(false)}
          >
            Cancel
          </button>
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
      </section>
    </div>
  ) : null

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

        {selectedAutomation ? (
          <section className="automation-detail" aria-label={`Automation details for ${selectedAutomation.name}`}>
            <header className="automation-detail-header">
              <button
                className="icon-button"
                type="button"
                aria-label="Back to automations"
                title="Back to automations"
                onClick={() => setSelectedAutomationID(null)}
              >
                <BackIcon />
              </button>

              <div className="automation-detail-title">
                <div className="automation-detail-breadcrumb">
                  <span>Automations</span>
                  <ChevronRightIcon />
                  <strong>{selectedAutomation.name}</strong>
                </div>
                <h1>{selectedAutomation.name}</h1>
              </div>

              <div className="automation-detail-actions">
                {(() => {
                  const isRunning = runningAutomationID === selectedAutomation.id
                  const activeRun = runs.find((run) => run.automationID === selectedAutomation.id && ACTIVE_RUN_STATUSES.has(run.status))
                  const isActive = selectedAutomation.status === "active"
                  return (
                    <>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={isRunning || Boolean(activeRun)}
                        onClick={() => void runAutomation(selectedAutomation.id)}
                      >
                        {isRunning || activeRun ? <SessionRunningIcon /> : <AutomationIcon />}
                        <span>{isRunning || activeRun ? "Running" : "Run now"}</span>
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void updateAutomationStatus(selectedAutomation, isActive ? "paused" : "active")}
                      >
                        {isActive ? "Pause" : "Resume"}
                      </button>
                      <button
                        className="icon-button is-danger"
                        type="button"
                        aria-label={`Delete ${selectedAutomation.name}`}
                        title={`Delete ${selectedAutomation.name}`}
                        onClick={() => void deleteAutomation(selectedAutomation)}
                      >
                        <DeleteIcon />
                      </button>
                    </>
                  )
                })()}
              </div>
            </header>

            <div className="automation-detail-layout">
              <main className="automation-detail-main">
                <section className="automation-detail-section">
                  <div className="automations-panel-heading">
                    <span className="label">Prompt</span>
                    <h2>Instructions</h2>
                  </div>
                  <p className="automation-detail-prompt">{selectedAutomation.prompt}</p>
                </section>

                <section className="automation-detail-section">
                  <div className="automation-section-title-row">
                    <div className="automations-panel-heading">
                      <span className="label">Runs</span>
                      <h2>Run history</h2>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => void refreshAutomations()}>
                      Refresh
                    </button>
                  </div>

                  {selectedAutomationRuns.length === 0 ? (
                    <article className="automations-empty-state">
                      <h3>No runs yet</h3>
                      <p>This automation has not produced a run history.</p>
                    </article>
                  ) : (
                    <div className="automations-run-list">
                      {selectedAutomationRuns.map((run) => {
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
                              <span>{formatDate(getRunTimestamp(run), "Unknown time")}</span>
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
                </section>
              </main>

              <aside className="automation-detail-sidebar" aria-label="Automation details">
                <section className="automation-sidebar-section">
                  <h2>Status</h2>
                  <dl className="automation-detail-list">
                    <div>
                      <dt>Status</dt>
                      <dd><span className={getStatusBadgeClassName(selectedAutomation.status)}>{selectedAutomation.status}</span></dd>
                    </div>
                    <div>
                      <dt>Next run</dt>
                      <dd>{formatDate(selectedAutomation.nextRunAt)}</dd>
                    </div>
                    <div>
                      <dt>Last run</dt>
                      <dd>{formatDate(selectedAutomation.lastRunAt, "Never")}</dd>
                    </div>
                  </dl>
                </section>

                <section className="automation-sidebar-section">
                  <h2>Details</h2>
                  <dl className="automation-detail-list">
                    <div>
                      <dt>Target</dt>
                      <dd>{formatProjectTarget(selectedAutomation, projectsByID)}</dd>
                    </div>
                    <div>
                      <dt>Cadence</dt>
                      <dd>{getScheduleLabel(selectedAutomation.schedule)}</dd>
                    </div>
                    <div>
                      <dt>Timezone</dt>
                      <dd>{selectedAutomation.schedule.timezone}</dd>
                    </div>
                    <div>
                      <dt>Environment</dt>
                      <dd>{selectedAutomation.execution.environment}</dd>
                    </div>
                    <div>
                      <dt>Permission</dt>
                      <dd>{selectedAutomation.execution.permissionMode ?? "default"}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{selectedAutomation.execution.model ?? "Default"}</dd>
                    </div>
                    <div>
                      <dt>Reasoning</dt>
                      <dd>{selectedAutomation.execution.reasoning_effort ?? "Default"}</dd>
                    </div>
                    <div>
                      <dt>Output</dt>
                      <dd>{getOutputPolicyLabel(selectedAutomation)}</dd>
                    </div>
                  </dl>
                </section>
              </aside>
            </div>
          </section>
        ) : (
          <section className="automations-index" aria-label="Automations list">
            <header className="automations-index-header">
              <div className="automations-index-title">
                <h1>Automations</h1>
                <p>{activeAutomationCount} active of {automations.length} total</p>
              </div>

              <div className="automations-index-actions">
                <button className="secondary-button" type="button" onClick={() => void refreshAutomations()}>
                  Refresh
                </button>
                <button className="primary-button" type="button" onClick={() => setIsCreatePanelOpen(true)}>
                  <PlusIcon />
                  <span>New automation</span>
                </button>
              </div>
            </header>

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
              <div className="automations-index-list">
                {automations.map((automation) => {
                  const latestRun = latestRunByAutomationID.get(automation.id)
                  const activeRun = runs.find((run) => run.automationID === automation.id && ACTIVE_RUN_STATUSES.has(run.status))
                  const isRunning = runningAutomationID === automation.id
                  const isActive = automation.status === "active"

                  return (
                    <article
                      key={automation.id}
                      className="automations-index-row"
                    >
                      <span className={joinClassNames("automations-status-dot", automation.status === "active" && "is-active")} />
                      <button
                        className="automations-index-row-open"
                        type="button"
                        aria-label={`Open ${automation.name}`}
                        onClick={() => setSelectedAutomationID(automation.id)}
                      >
                        <span className="automations-index-row-main">
                          <span className="automations-index-row-title">
                            <strong>{automation.name}</strong>
                            <span>{formatProjectTarget(automation, projectsByID)}</span>
                          </span>
                          <span className="automations-index-row-summary">
                            {activeRun ? getRunSummary(activeRun) : latestRun ? getRunSummary(latestRun) : "No runs yet"}
                          </span>
                        </span>
                        <span className="automations-index-row-meta">
                          <span>{getScheduleLabel(automation.schedule)}</span>
                          <span>{formatDate(automation.nextRunAt)}</span>
                        </span>
                        <span className={getStatusBadgeClassName(activeRun?.status ?? automation.status)}>
                          {activeRun?.status ?? automation.status}
                        </span>
                      </button>
                      <span className="automations-index-row-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={`运行 ${automation.name}`}
                          disabled={isRunning || Boolean(activeRun)}
                          onClick={() => void runAutomation(automation.id)}
                        >
                          运行
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={`${isActive ? "暂停" : "恢复"} ${automation.name}`}
                          onClick={() => void updateAutomationStatus(automation, isActive ? "paused" : "active")}
                        >
                          {isActive ? "暂停" : "恢复"}
                        </button>
                        <button
                          className="secondary-button is-danger"
                          type="button"
                          aria-label={`删除 ${automation.name}`}
                          onClick={() => void deleteAutomation(automation)}
                        >
                          删除
                        </button>
                      </span>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {createPanel}
      </div>
    </section>
  )
}
