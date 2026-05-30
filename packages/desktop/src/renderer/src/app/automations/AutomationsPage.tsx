import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import {
  ArchiveIcon,
  AutomationIcon,
  BackIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  FileSearchIcon,
  FileTextIcon,
  FolderIcon,
  OpenExternalIcon,
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
import { useI18n } from "../i18n/I18nProvider"
import type { TranslationKey } from "../i18n/translations"

type AgentAutomationSchedule = AgentAutomationDefinition["schedule"]
type AgentAutomationStatus = AgentAutomationDefinition["status"]
type CreateMenuKey = "cadence" | "project"
type CreatePanelMode = "manual" | "templates"
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
  labelKey: TranslationKey
  type: AgentAutomationSchedule["type"]
}> = [
  { key: "daily", labelKey: "automations.cadence.daily", type: "rrule", expression: "FREQ=DAILY;INTERVAL=1" },
  { key: "weekly", labelKey: "automations.cadence.weekly", type: "rrule", expression: "FREQ=WEEKLY;INTERVAL=1" },
  { key: "hourly", labelKey: "automations.cadence.hourly", type: "rrule", expression: "FREQ=HOURLY;INTERVAL=1" },
  { key: "fifteen-minutes", labelKey: "automations.cadence.fifteenMinutes", type: "cron", expression: "*/15 * * * *" },
  { key: "five-minutes", labelKey: "automations.cadence.fiveMinutes", type: "cron", expression: "*/5 * * * *" },
  { key: "one-minute", labelKey: "automations.cadence.oneMinute", type: "cron", expression: "*/1 * * * *" },
]

const AUTOMATION_TEMPLATES: Array<{
  cadence: CadenceKey
  id: string
  nameKey: TranslationKey
  promptKey: TranslationKey
}> = [
  {
    id: "daily-brief",
    cadence: "daily",
    nameKey: "automations.templates.dailyBrief.name",
    promptKey: "automations.templates.dailyBrief.prompt",
  },
  {
    id: "weekly-review",
    cadence: "weekly",
    nameKey: "automations.templates.weeklyReview.name",
    promptKey: "automations.templates.weeklyReview.prompt",
  },
  {
    id: "one-minute-watch",
    cadence: "one-minute",
    nameKey: "automations.templates.oneMinuteWatch.name",
    promptKey: "automations.templates.oneMinuteWatch.prompt",
  },
]

const ACTIVE_RUN_STATUSES = new Set<AgentAutomationRun["status"]>(["queued", "running"])

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

function requireDesktopApi(translate?: Translate): AutomationDesktopApi {
  if (!window.desktop) {
    throw new Error(translate?.("automations.error.desktopApiUnavailable") ?? "Desktop API is unavailable.")
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
    throw new Error(translate?.("automations.error.automationApiUnavailable") ?? "Automation API is unavailable.")
  }
  return desktop as AutomationDesktopApi
}

function getTemplateDraft(template: (typeof AUTOMATION_TEMPLATES)[number], translate: Translate) {
  return {
    name: translate(template.nameKey),
    prompt: translate(template.promptKey),
  }
}

function getScheduleLabel(schedule: AgentAutomationSchedule, translate: Translate) {
  const match = SCHEDULE_OPTIONS.find((option) => option.type === schedule.type && option.expression === schedule.expression)
  if (match) return translate(match.labelKey)
  if (schedule.type === "cron") return translate("automations.schedule.cron", { expression: schedule.expression })
  return schedule.expression
}

function renderAutomationTemplateIcon(templateID: string) {
  if (templateID === "daily-brief") return <FileSearchIcon />
  if (templateID === "weekly-review") return <FileTextIcon />
  return <AutomationIcon />
}

function formatDate(
  timestamp: number | undefined,
  locale: string,
  translate: Translate,
  fallbackKey: TranslationKey = "automations.date.notScheduled",
) {
  if (!timestamp) return translate(fallbackKey)
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp)
}

function formatProjectTarget(
  automation: AgentAutomationDefinition,
  projectsByID: Map<string, AutomationProjectOption>,
  translate: Translate,
) {
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

  if (automation.scope.sessionID) return translate("automations.target.session", { sessionID: automation.scope.sessionID })
  return translate("automations.target.none")
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

function getRunSummary(run: AgentAutomationRun, translate: Translate) {
  if (run.error) return run.error
  if (run.summary) return run.summary
  if (run.status === "queued") return translate("automations.runSummary.queued")
  if (run.status === "running") return translate("automations.runSummary.running")
  return translate("automations.runSummary.none")
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

function getFindingCountLabel(count: number, translate: Translate) {
  return count === 1
    ? translate("automations.findings.singular", { count })
    : translate("automations.findings.plural", { count })
}

function getRunTriggerLabel(trigger: AgentAutomationRun["trigger"], translate: Translate) {
  if (trigger === "manual") return translate("automations.trigger.manual")
  if (trigger === "schedule") return translate("automations.trigger.schedule")
  return trigger
}

function getStatusLabel(status: AgentAutomationStatus | AgentAutomationRun["status"], translate: Translate) {
  const key = `automations.status.${status}` as TranslationKey
  return translate(key)
}

function getPermissionModeLabel(permissionMode: string | undefined, translate: Translate) {
  if (!permissionMode || permissionMode === "default") return translate("automations.permission.default")
  if (permissionMode === "read-only") return translate("automations.permission.readOnly")
  if (permissionMode === "full-access" || permissionMode === "full_access") return translate("automations.permission.fullAccess")
  return permissionMode
}

function getEnvironmentLabel(environment: string, translate: Translate) {
  if (environment === "local") return translate("automations.environment.local")
  if (environment === "worktree") return translate("automations.environment.worktree")
  return environment
}

function getReasoningEffortLabel(reasoningEffort: string | undefined | null, translate: Translate) {
  if (!reasoningEffort) return translate("automations.value.default")
  if (reasoningEffort === "low") return translate("automations.reasoning.low")
  if (reasoningEffort === "medium") return translate("automations.reasoning.medium")
  if (reasoningEffort === "high") return translate("automations.reasoning.high")
  if (reasoningEffort === "max") return translate("automations.reasoning.max")
  return reasoningEffort
}

function getOutputPolicyLabel(automation: AgentAutomationDefinition, translate: Translate) {
  if (automation.outputPolicy.triage === "always") return translate("automations.output.always")
  if (automation.outputPolicy.triage === "never") return translate("automations.output.never")
  return automation.outputPolicy.autoArchiveNoFindings
    ? translate("automations.output.findingsOnly")
    : translate("automations.output.findingsReview")
}

export function AutomationsPage({ projects, windowControls, onOpenSession }: AutomationsPageProps) {
  const { locale, t } = useI18n()
  const defaultTemplate = AUTOMATION_TEMPLATES[0]
  const defaultTemplateDraft = defaultTemplate
    ? getTemplateDraft(defaultTemplate, t)
    : { name: "", prompt: "" }
  const [automations, setAutomations] = useState<AgentAutomationDefinition[]>([])
  const [runs, setRuns] = useState<AgentAutomationRun[]>([])
  const [selectedAutomationID, setSelectedAutomationID] = useState<string | null>(null)
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false)
  const [selectedProjectID, setSelectedProjectID] = useState("")
  const [draftTemplateID, setDraftTemplateID] = useState<string | null>(defaultTemplate?.id ?? null)
  const [draftName, setDraftName] = useState(defaultTemplateDraft.name)
  const [draftPrompt, setDraftPrompt] = useState(defaultTemplateDraft.prompt)
  const [cadence, setCadence] = useState<CadenceKey>(AUTOMATION_TEMPLATES[0]?.cadence ?? "daily")
  const [createPanelMode, setCreatePanelMode] = useState<CreatePanelMode>("manual")
  const [openCreateMenu, setOpenCreateMenu] = useState<CreateMenuKey | null>(null)
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
  const selectedScheduleOption = SCHEDULE_OPTIONS.find((option) => option.key === cadence) ?? SCHEDULE_OPTIONS[0]
  const selectedScheduleLabel = selectedScheduleOption
    ? t(selectedScheduleOption.labelKey)
    : t("automations.schedule.label")
  const selectedProject = selectedProjectID ? projectsByID.get(selectedProjectID) : undefined
  const selectedTemplateID = draftTemplateID

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

  useEffect(() => {
    if (!draftTemplateID) return
    const template = AUTOMATION_TEMPLATES.find((item) => item.id === draftTemplateID)
    if (!template) return
    const templateDraft = getTemplateDraft(template, t)
    setDraftName(templateDraft.name)
    setDraftPrompt(templateDraft.prompt)
    setCadence(template.cadence)
  }, [draftTemplateID, t])

  useEffect(() => {
    if (!openCreateMenu) return

    function closeCreateMenu(event: MouseEvent) {
      const target = event.target
      if (target instanceof Element && target.closest(".automations-create-menu-anchor")) return
      setOpenCreateMenu(null)
    }

    function closeCreateMenuOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenCreateMenu(null)
      }
    }

    document.addEventListener("mousedown", closeCreateMenu)
    document.addEventListener("keydown", closeCreateMenuOnEscape)
    return () => {
      document.removeEventListener("mousedown", closeCreateMenu)
      document.removeEventListener("keydown", closeCreateMenuOnEscape)
    }
  }, [openCreateMenu])

  async function refreshAutomations(options: { silent?: boolean } = {}) {
    if (!options.silent) setIsLoading(true)
    try {
      const desktop = requireDesktopApi(t)
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
    const templateDraft = getTemplateDraft(template, t)
    setDraftName(templateDraft.name)
    setDraftPrompt(templateDraft.prompt)
    setCadence(template.cadence)
    setDraftTemplateID(template.id)
    setOpenCreateMenu(null)
    setCreatePanelMode("manual")
  }

  function closeCreatePanel() {
    setOpenCreateMenu(null)
    setCreatePanelMode("manual")
    setIsCreatePanelOpen(false)
  }

  async function handleCreateAutomation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const project = projectsByID.get(selectedProjectID)
    const name = draftName.trim()
    const prompt = draftPrompt.trim()
    if (!project) {
      setError(t("automations.error.selectProject"))
      return
    }
    if (!name || !prompt) {
      setError(t("automations.error.namePromptRequired"))
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
      const createdAutomation = await requireDesktopApi(t).createAutomation(input)
      setError(null)
      closeCreatePanel()
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
      await requireDesktopApi(t).updateAutomation({
        automationID: automation.id,
        automation: { status },
      })
      await refreshAutomations({ silent: true })
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : String(updateError))
    }
  }

  async function deleteAutomation(automation: AgentAutomationDefinition) {
    if (!window.confirm(t("automations.confirmDelete", { name: automation.name }))) return
    try {
      await requireDesktopApi(t).deleteAutomation({ automationID: automation.id })
      setSelectedAutomationID(null)
      await refreshAutomations({ silent: true })
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError))
    }
  }

  async function runAutomation(automationID: string) {
    setRunningAutomationID(automationID)
    try {
      await requireDesktopApi(t).runAutomation({ automationID })
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
      await requireDesktopApi(t).updateAutomationRunTriage({ runID, triageStatus })
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
      await requireDesktopApi(t).cancelAutomationRun({ runID })
      await refreshAutomations({ silent: true })
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : String(cancelError))
    } finally {
      setMutatingRunID(null)
    }
  }

  const createPanel = isCreatePanelOpen ? (
    <div className="automations-create-overlay">
      <section className="automations-create-panel" role="dialog" aria-modal="true" aria-label={t("automations.create.dialogLabel")}>
        {createPanelMode === "templates" ? (
          <div className="automations-template-browser">
            <header className="automations-template-browser-header">
              <h2>{t("automations.templates.title")}</h2>
              <div className="automations-create-header-actions">
                <button
                  className="automations-create-control-button automations-template-manual-button"
                  type="button"
                  onClick={() => {
                    setOpenCreateMenu(null)
                    setCreatePanelMode("manual")
                  }}
                >
                  {t("automations.templates.manualSetup")}
                </button>
                <button
                  className="icon-button automations-create-close"
                  type="button"
                  aria-label={t("app.cancel")}
                  title={t("app.cancel")}
                  onClick={closeCreatePanel}
                >
                  <CloseIcon />
                </button>
              </div>
            </header>

            <div className="automations-template-browser-grid" aria-label={t("automations.templates.title")}>
              {AUTOMATION_TEMPLATES.map((template) => {
                const templateDraft = getTemplateDraft(template, t)
                return (
                  <button
                    key={template.id}
                    className={joinClassNames("automations-template-card", selectedTemplateID === template.id && "is-selected")}
                    type="button"
                    onClick={() => applyTemplate(template.id)}
                  >
                    <span className="automations-template-card-icon" aria-hidden="true">
                      {renderAutomationTemplateIcon(template.id)}
                    </span>
                    <span className="automations-template-card-copy">{templateDraft.prompt}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <form className="automations-create-composer" onSubmit={handleCreateAutomation}>
          <header className="automations-create-header">
            <input
              aria-label={t("automations.create.titleLabel")}
              className="automations-create-title-input"
              type="text"
              placeholder={t("automations.create.titlePlaceholder")}
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value)
                setDraftTemplateID(null)
              }}
            />

            <div className="automations-create-header-actions">
              <div className="automations-create-menu-anchor">
                <button
                  className="automations-create-control-button"
                  type="button"
                  onClick={() => {
                    setOpenCreateMenu(null)
                    setCreatePanelMode("templates")
                  }}
                >
                  <span>{t("automations.create.useTemplate")}</span>
                </button>
              </div>

              <button
                className="icon-button automations-create-close"
                type="button"
                aria-label={t("app.cancel")}
                title={t("app.cancel")}
                onClick={closeCreatePanel}
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <textarea
            className="automations-create-prompt-input"
            aria-label={t("automations.create.promptLabel")}
            placeholder={t("automations.create.promptPlaceholder")}
            value={draftPrompt}
            onChange={(event) => {
              setDraftPrompt(event.target.value)
              setDraftTemplateID(null)
            }}
          />

          <div className="automations-create-footer">
            <div className="automations-create-controls" aria-label={t("automations.create.configurationLabel")}>
              <span className="automations-create-control-pill" title={selectedProject?.directory ?? t("automations.project.noneSelected")}>
                <OpenExternalIcon />
                <span>{t("automations.create.worktree")}</span>
              </span>

              <div className="automations-create-menu-anchor">
                <button
                  className={joinClassNames("automations-create-control-button", openCreateMenu === "project" && "is-active")}
                  type="button"
                  disabled={projects.length === 0}
                  aria-haspopup="menu"
                  aria-expanded={openCreateMenu === "project"}
                  onClick={() => setOpenCreateMenu((current) => current === "project" ? null : "project")}
                >
                  <FolderIcon />
                  <span>{selectedProject?.name ?? t("automations.project.select")}</span>
                  <ChevronDownIcon />
                </button>

                {openCreateMenu === "project" ? (
                  <div className="automations-create-menu automations-project-menu" role="menu" aria-label={t("automations.project.menuLabel")}>
                    {projects.map((project) => (
                      <button
                        key={project.id}
                        className={joinClassNames("automations-create-menu-option", selectedProjectID === project.id && "is-selected")}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedProjectID === project.id}
                        onClick={() => {
                          setSelectedProjectID(project.id)
                          setOpenCreateMenu(null)
                        }}
                      >
                        <span className="automations-create-menu-copy">
                          <strong>{project.name}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="automations-create-menu-anchor">
                <button
                  className={joinClassNames("automations-create-control-button", openCreateMenu === "cadence" && "is-active")}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openCreateMenu === "cadence"}
                  onClick={() => setOpenCreateMenu((current) => current === "cadence" ? null : "cadence")}
                >
                  <AutomationIcon />
                  <span>{selectedScheduleLabel}</span>
                  <ChevronDownIcon />
                </button>

                {openCreateMenu === "cadence" ? (
                  <div className="automations-create-menu automations-cadence-menu" role="menu" aria-label={t("automations.cadence.menuLabel")}>
                    {SCHEDULE_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        className={joinClassNames("automations-create-menu-option", cadence === option.key && "is-selected")}
                        type="button"
                        role="menuitemradio"
                        aria-checked={cadence === option.key}
                        onClick={() => {
                          setCadence(option.key)
                          setDraftTemplateID(null)
                          setOpenCreateMenu(null)
                        }}
                      >
                        <span className="automations-create-menu-copy">
                          <strong>{t(option.labelKey)}</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="automations-create-actions">
              <button
                className="secondary-button automations-create-cancel"
                type="button"
                onClick={closeCreatePanel}
              >
                {t("app.cancel")}
              </button>
              <button
                className="primary-button automations-create-button"
                type="submit"
                aria-label={t("automations.create.submit")}
                disabled={isSaving || projects.length === 0}
              >
                {isSaving ? t("automations.create.creating") : t("automations.create.create")}
              </button>
            </div>
          </div>
          </form>
        )}
      </section>
    </div>
  ) : null

  return (
    <section className="automations-page" aria-label={t("automations.title")}>
      <ShellTopMenu
        as="header"
        ariaLabel={t("automations.topMenu")}
        className="canvas-region-top-menu automations-top-menu"
        contentClassName="canvas-region-top-menu-tabs-shell"
        content={(
          <div className="automations-top-menu-label">
            <AutomationIcon />
            <span>{t("automations.title")}</span>
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
          <section className="automation-detail" aria-label={t("automations.detail.ariaLabel", { name: selectedAutomation.name })}>
            <header className="automation-detail-header">
              <button
                className="icon-button"
                type="button"
                aria-label={t("automations.detail.back")}
                title={t("automations.detail.back")}
                onClick={() => setSelectedAutomationID(null)}
              >
                <BackIcon />
              </button>

              <div className="automation-detail-title">
                <div className="automation-detail-breadcrumb">
                  <span>{t("automations.title")}</span>
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
                        <span>{isRunning || activeRun ? t("automations.actions.running") : t("automations.actions.runNow")}</span>
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void updateAutomationStatus(selectedAutomation, isActive ? "paused" : "active")}
                      >
                        {isActive ? t("automations.actions.pause") : t("automations.actions.resume")}
                      </button>
                      <button
                        className="icon-button is-danger"
                        type="button"
                        aria-label={t("automations.actions.deleteNamed", { name: selectedAutomation.name })}
                        title={t("automations.actions.deleteNamed", { name: selectedAutomation.name })}
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
                    <span className="label">{t("automations.detail.promptLabel")}</span>
                    <h2>{t("automations.detail.instructions")}</h2>
                  </div>
                  <p className="automation-detail-prompt">{selectedAutomation.prompt}</p>
                </section>

                <section className="automation-detail-section">
                  <div className="automation-section-title-row">
                    <div className="automations-panel-heading">
                      <span className="label">{t("automations.detail.runsLabel")}</span>
                      <h2>{t("automations.detail.runHistory")}</h2>
                    </div>
                    <button className="secondary-button" type="button" onClick={() => void refreshAutomations()}>
                      {t("app.refresh")}
                    </button>
                  </div>

                  {selectedAutomationRuns.length === 0 ? (
                    <article className="automations-empty-state">
                      <h3>{t("automations.runs.emptyTitle")}</h3>
                      <p>{t("automations.runs.emptyCopy")}</p>
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
                              <span className={getStatusBadgeClassName(run.status)}>{getStatusLabel(run.status, t)}</span>
                            </div>
                            <p>{getRunSummary(run, t)}</p>
                            <div className="automations-run-meta">
                              <span>{getRunTriggerLabel(run.trigger, t)}</span>
                              <span>{getFindingCountLabel(run.findingCount, t)}</span>
                              <span>{formatDate(getRunTimestamp(run), locale, t, "automations.date.unknownTime")}</span>
                            </div>
                            <div className="automations-run-actions">
                              {run.sessionID ? (
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => onOpenSession?.(run.sessionID!)}
                                >
                                  {t("automations.actions.open")}
                                </button>
                              ) : null}
                              {isActiveRun ? (
                                <button
                                  className="icon-button"
                                  type="button"
                                  aria-label={t("automations.actions.cancelRun")}
                                  title={t("automations.actions.cancelRun")}
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
                                    aria-label={t("automations.actions.markRunRead")}
                                    title={t("automations.actions.markRunRead")}
                                    disabled={isMutating}
                                    onClick={() => void setRunTriage(run.id, "read")}
                                  >
                                    <CheckIcon />
                                  </button>
                                  <button
                                    className="icon-button"
                                    type="button"
                                    aria-label={t("automations.actions.archiveRun")}
                                    title={t("automations.actions.archiveRun")}
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

              <aside className="automation-detail-sidebar" aria-label={t("automations.detail.sidebarLabel")}>
                <section className="automation-sidebar-section">
                  <h2>{t("automations.detail.status")}</h2>
                  <dl className="automation-detail-list">
                    <div>
                      <dt>{t("automations.detail.status")}</dt>
                      <dd><span className={getStatusBadgeClassName(selectedAutomation.status)}>{getStatusLabel(selectedAutomation.status, t)}</span></dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.nextRun")}</dt>
                      <dd>{formatDate(selectedAutomation.nextRunAt, locale, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.lastRun")}</dt>
                      <dd>{formatDate(selectedAutomation.lastRunAt, locale, t, "automations.date.never")}</dd>
                    </div>
                  </dl>
                </section>

                <section className="automation-sidebar-section">
                  <h2>{t("automations.detail.details")}</h2>
                  <dl className="automation-detail-list">
                    <div>
                      <dt>{t("automations.detail.target")}</dt>
                      <dd>{formatProjectTarget(selectedAutomation, projectsByID, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.cadence")}</dt>
                      <dd>{getScheduleLabel(selectedAutomation.schedule, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.timezone")}</dt>
                      <dd>{selectedAutomation.schedule.timezone}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.environment")}</dt>
                      <dd>{getEnvironmentLabel(selectedAutomation.execution.environment, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.permission")}</dt>
                      <dd>{getPermissionModeLabel(selectedAutomation.execution.permissionMode, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.model")}</dt>
                      <dd>{selectedAutomation.execution.model ?? t("automations.value.default")}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.reasoning")}</dt>
                      <dd>{getReasoningEffortLabel(selectedAutomation.execution.reasoning_effort, t)}</dd>
                    </div>
                    <div>
                      <dt>{t("automations.detail.output")}</dt>
                      <dd>{getOutputPolicyLabel(selectedAutomation, t)}</dd>
                    </div>
                  </dl>
                </section>
              </aside>
            </div>
          </section>
        ) : (
          <section className="automations-index" aria-label={t("automations.list.ariaLabel")}>
            <header className="automations-index-header">
              <div className="automations-index-title">
                <h1>{t("automations.title")}</h1>
                <p>{t("automations.summary.activeCount", { active: activeAutomationCount, total: automations.length })}</p>
              </div>

              <div className="automations-index-actions">
                <button className="secondary-button" type="button" onClick={() => void refreshAutomations()}>
                  {t("app.refresh")}
                </button>
                <button className="primary-button" type="button" onClick={() => setIsCreatePanelOpen(true)}>
                  <PlusIcon />
                  <span>{t("automations.actions.newAutomation")}</span>
                </button>
              </div>
            </header>

            {isLoading ? (
              <article className="automations-empty-state">
                <h3>{t("automations.loading.title")}</h3>
                <p>{t("automations.loading.copy")}</p>
              </article>
            ) : automations.length === 0 ? (
              <article className="automations-empty-state">
                <h3>{t("automations.empty.title")}</h3>
                <p>{t("automations.empty.copy")}</p>
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
                        aria-label={t("automations.actions.openNamed", { name: automation.name })}
                        onClick={() => setSelectedAutomationID(automation.id)}
                      >
                        <span className="automations-index-row-main">
                          <span className="automations-index-row-title">
                            <strong>{automation.name}</strong>
                            <span>{formatProjectTarget(automation, projectsByID, t)}</span>
                          </span>
                          <span className="automations-index-row-summary">
                            {activeRun ? getRunSummary(activeRun, t) : latestRun ? getRunSummary(latestRun, t) : t("automations.runs.noRunsYet")}
                          </span>
                        </span>
                        <span className="automations-index-row-meta">
                          <span>{getScheduleLabel(automation.schedule, t)}</span>
                          <span>{formatDate(automation.nextRunAt, locale, t)}</span>
                        </span>
                        <span className={getStatusBadgeClassName(activeRun?.status ?? automation.status)}>
                          {getStatusLabel(activeRun?.status ?? automation.status, t)}
                        </span>
                      </button>
                      <span className="automations-index-row-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={t("automations.actions.runNamed", { name: automation.name })}
                          disabled={isRunning || Boolean(activeRun)}
                          onClick={() => void runAutomation(automation.id)}
                        >
                          {t("automations.actions.run")}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          aria-label={
                            isActive
                              ? t("automations.actions.pauseNamed", { name: automation.name })
                              : t("automations.actions.resumeNamed", { name: automation.name })
                          }
                          onClick={() => void updateAutomationStatus(automation, isActive ? "paused" : "active")}
                        >
                          {isActive ? t("automations.actions.pause") : t("automations.actions.resume")}
                        </button>
                        <button
                          className="secondary-button is-danger"
                          type="button"
                          aria-label={t("automations.actions.deleteNamed", { name: automation.name })}
                          onClick={() => void deleteAutomation(automation)}
                        >
                          {t("app.delete")}
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
