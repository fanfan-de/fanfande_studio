import { startTransition, useEffect, useMemo, useRef, useState } from "react"
import { mapPtySessionInfoToRecord, terminalClient } from "./client"
import { createEmptyTerminalWorkspaceState, loadTerminalWorkspaceState, saveTerminalWorkspaceState } from "./storage"
import type { PtyEvent, TerminalSessionRecord, TerminalWorkspaceState } from "./types"

const MIN_PANEL_HEIGHT = 220
const MAX_PANEL_HEIGHT = 560
const RECONNECT_DELAYS_MS = [600, 1_000, 1_600, 2_400, 3_600]

function clampPanelHeight(value: number) {
  return Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, value))
}

function orderedSessions(state: TerminalWorkspaceState) {
  return state.order.map((ptyID) => state.sessions[ptyID]).filter((session): session is TerminalSessionRecord => Boolean(session))
}

function nextActivePtyID(order: string[], removedPtyID: string) {
  const index = order.indexOf(removedPtyID)
  if (index === -1) return order[0] ?? null
  return order[index + 1] ?? order[index - 1] ?? null
}

function upsertSession(state: TerminalWorkspaceState, session: TerminalSessionRecord, activate = false): TerminalWorkspaceState {
  const nextOrder = state.order.includes(session.ptyID) ? state.order : [...state.order, session.ptyID]

  return {
    ...state,
    isOpen: state.isOpen,
    activePtyID: activate ? session.ptyID : state.activePtyID ?? session.ptyID,
    order: nextOrder,
    sessions: {
      ...state.sessions,
      [session.ptyID]: session,
    },
  }
}

function appendSessionBuffer(
  state: TerminalWorkspaceState,
  ptyID: string,
  input: { data: string; cursor: number },
): TerminalWorkspaceState {
  const current = state.sessions[ptyID]
  if (!current) return state

  return {
    ...state,
    sessions: {
      ...state.sessions,
      [ptyID]: {
        ...current,
        buffer: `${current.buffer}${input.data}`,
        cursor: input.cursor,
        updatedAt: Date.now(),
      },
    },
  }
}

export interface UseTerminalWorkspaceOptions {
  defaultCwd: string
  currentWorkspaceDirectory?: string | null
}

export function useTerminalWorkspace({ defaultCwd, currentWorkspaceDirectory }: UseTerminalWorkspaceOptions) {
  const [workspace, setWorkspace] = useState(() => loadTerminalWorkspaceState())
  const workspaceRef = useRef(workspace)
  const attachedPtyIDRef = useRef<string | null>(null)
  const reconnectTimersRef = useRef<Record<string, number>>({})
  const reconnectAttemptsRef = useRef<Record<string, number>>({})
  const resizeTimersRef = useRef<Record<string, number>>({})
  const persistTimerRef = useRef<number | null>(null)

  const sessions = useMemo(() => orderedSessions(workspace), [workspace])
  const activeSession = workspace.activePtyID ? workspace.sessions[workspace.activePtyID] ?? null : null

  useEffect(() => {
    workspaceRef.current = workspace
  }, [workspace])

  useEffect(() => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }

    persistTimerRef.current = window.setTimeout(() => {
      saveTerminalWorkspaceState(workspace)
      persistTimerRef.current = null
    }, 120)

    return () => {
      if (persistTimerRef.current !== null) {
        window.clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [workspace])

  function updateWorkspace(updater: (current: TerminalWorkspaceState) => TerminalWorkspaceState) {
    startTransition(() => {
      setWorkspace((current) => updater(current))
    })
  }

  function cancelReconnect(ptyID: string) {
    const timer = reconnectTimersRef.current[ptyID]
    if (timer !== undefined) {
      window.clearTimeout(timer)
      delete reconnectTimersRef.current[ptyID]
    }
    delete reconnectAttemptsRef.current[ptyID]
  }

  async function detachSession(ptyID: string, userInitiated = false) {
    cancelReconnect(ptyID)
    if (attachedPtyIDRef.current === ptyID) {
      attachedPtyIDRef.current = null
    }

    try {
      await terminalClient.detachSession({ id: ptyID })
    } catch (error) {
      console.error("[desktop] detachPtySession failed:", error)
    }

    updateWorkspace((current) => {
      const session = current.sessions[ptyID]
      if (!session) return current
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [ptyID]: {
            ...session,
            transportState: "disconnected",
            lastError: userInitiated ? undefined : session.lastError,
          },
        },
      }
    })
  }

  function scheduleReconnect(ptyID: string) {
    const current = workspaceRef.current
    const session = current.sessions[ptyID]
    if (!current.isOpen || current.activePtyID !== ptyID || !session || session.status !== "running") {
      return
    }
    if (reconnectTimersRef.current[ptyID] !== undefined) return

    const attempt = Math.min((reconnectAttemptsRef.current[ptyID] ?? 0) + 1, RECONNECT_DELAYS_MS.length)
    reconnectAttemptsRef.current[ptyID] = attempt
    const delay = RECONNECT_DELAYS_MS[attempt - 1] ?? RECONNECT_DELAYS_MS[RECONNECT_DELAYS_MS.length - 1]!

    reconnectTimersRef.current[ptyID] = window.setTimeout(() => {
      delete reconnectTimersRef.current[ptyID]
      void attachSession(ptyID, workspaceRef.current.sessions[ptyID]?.cursor ?? 0)
    }, delay)
  }

  async function attachSession(ptyID: string, cursor?: number) {
    const target = workspaceRef.current.sessions[ptyID]
    if (!target || target.status === "deleted" || target.status === "invalid") return

    const attachedPtyID = attachedPtyIDRef.current
    if (attachedPtyID && attachedPtyID !== ptyID) {
      await detachSession(attachedPtyID, true)
    }

    cancelReconnect(ptyID)
    attachedPtyIDRef.current = ptyID
    updateWorkspace((current) => {
      const session = current.sessions[ptyID]
      if (!session) return current
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [ptyID]: {
            ...session,
            transportState: "connecting",
            lastError: undefined,
          },
        },
      }
    })

    try {
      const info = await terminalClient.attachSession({ id: ptyID, cursor })
      updateWorkspace((current) => {
        const existing = current.sessions[ptyID]
        if (!existing) return current
        return upsertSession(
          current,
          mapPtySessionInfoToRecord(info, {
            buffer: existing.buffer,
            scrollTop: existing.scrollTop,
            transportState: "connecting",
          }),
        )
      })
    } catch (error) {
      if (attachedPtyIDRef.current === ptyID) {
        attachedPtyIDRef.current = null
      }

      const message = error instanceof Error ? error.message : String(error)
      const isMissing = /not found/i.test(message)

      updateWorkspace((current) => {
        const session = current.sessions[ptyID]
        if (!session) return current
        return {
          ...current,
          sessions: {
            ...current.sessions,
            [ptyID]: {
              ...session,
              status: isMissing ? "invalid" : session.status,
              transportState: "error",
              lastError: message,
            },
          },
        }
      })

      if (!isMissing) {
        scheduleReconnect(ptyID)
      }
    }
  }

  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    try {
      unsubscribe = terminalClient.subscribe((event: PtyEvent) => {
        if (event.type === "transport") {
          updateWorkspace((current) => {
            const session = current.sessions[event.ptyID]
            if (!session) return current
            return {
              ...current,
              sessions: {
                ...current.sessions,
                [event.ptyID]: {
                  ...session,
                  transportState:
                    event.state === "error"
                      ? "error"
                      : event.state === "connecting"
                        ? "connecting"
                        : event.state === "connected"
                          ? "connected"
                          : "disconnected",
                  lastError: event.state === "error" ? event.message : session.lastError,
                },
              },
            }
          })

          if (event.state === "connected") {
            cancelReconnect(event.ptyID)
            return
          }

          if (event.state === "disconnected") {
            if (attachedPtyIDRef.current === event.ptyID) {
              attachedPtyIDRef.current = null
            }
            if (!event.userInitiated) {
              scheduleReconnect(event.ptyID)
            }
            return
          }

          if (event.state === "error") {
            scheduleReconnect(event.ptyID)
          }

          return
        }

        if (event.type === "ready") {
          cancelReconnect(event.ptyID)
          attachedPtyIDRef.current = event.ptyID
          updateWorkspace((current) => {
            const previous = current.sessions[event.ptyID]
            const replayBuffer =
              event.replay.mode === "reset"
                ? event.replay.buffer
                : `${previous?.buffer ?? ""}${event.replay.buffer}`

            return upsertSession(
              current,
              {
                ...mapPtySessionInfoToRecord(event.session, {
                  buffer: replayBuffer,
                  scrollTop: previous?.scrollTop ?? 0,
                  transportState: "connected",
                }),
                buffer: replayBuffer,
                cursor: event.replay.cursor,
              },
            )
          })
          return
        }

        if (event.type === "output") {
          updateWorkspace((current) => appendSessionBuffer(current, event.ptyID, event))
          return
        }

        if (event.type === "state" || event.type === "exited" || event.type === "deleted") {
          if (event.type === "deleted") {
            cancelReconnect(event.ptyID)
          }

          updateWorkspace((current) => {
            const previous = current.sessions[event.ptyID]
            return upsertSession(
              current,
              mapPtySessionInfoToRecord(event.session, {
                buffer: previous?.buffer ?? "",
                scrollTop: previous?.scrollTop ?? 0,
                transportState:
                  event.type === "deleted"
                    ? "disconnected"
                    : event.type === "exited"
                      ? previous?.transportState ?? "disconnected"
                      : previous?.transportState ?? "idle",
                lastError: previous?.lastError,
              }),
            )
          })
          return
        }

        if (event.type === "error") {
          updateWorkspace((current) => {
            const session = current.sessions[event.ptyID]
            if (!session) return current
            return {
              ...current,
              sessions: {
                ...current.sessions,
                [event.ptyID]: {
                  ...session,
                  transportState: "error",
                  lastError: event.message,
                },
              },
            }
          })
        }
      })
    } catch (error) {
      console.error("[desktop] onPtyEvent subscription failed:", error)
    }

    return () => {
      unsubscribe?.()
      for (const timer of Object.values(reconnectTimersRef.current)) {
        window.clearTimeout(timer)
      }
      for (const timer of Object.values(resizeTimersRef.current)) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    const targetPtyID = workspace.isOpen ? workspace.activePtyID : null
    if (!targetPtyID) {
      if (attachedPtyIDRef.current) {
        void detachSession(attachedPtyIDRef.current, true)
      }
      return
    }

    if (attachedPtyIDRef.current === targetPtyID) return
    void attachSession(targetPtyID, workspace.sessions[targetPtyID]?.cursor ?? 0)
  }, [workspace.activePtyID, workspace.isOpen])

  async function handleCreateTerminal(openPanel = true) {
    try {
      const cwd = currentWorkspaceDirectory?.trim() || defaultCwd.trim() || undefined
      const session = await terminalClient.createSession({
        cwd,
      })

      updateWorkspace((current) =>
        upsertSession(
          {
            ...current,
            isOpen: current.isOpen || openPanel,
            activePtyID: session.id,
          },
          mapPtySessionInfoToRecord(session, {
            transportState: "idle",
          }),
          true,
        ),
      )
    } catch (error) {
      console.error("[desktop] createPtySession failed:", error)
    }
  }

  async function handleTogglePanel() {
    if (workspaceRef.current.isOpen) {
      updateWorkspace((current) => ({
        ...current,
        isOpen: false,
      }))
      return
    }

    if (workspaceRef.current.order.length === 0) {
      updateWorkspace((current) => ({
        ...current,
        isOpen: true,
      }))
      await handleCreateTerminal(true)
      return
    }

    updateWorkspace((current) => ({
      ...current,
      isOpen: true,
    }))
  }

  function handleSelectTerminal(ptyID: string) {
    updateWorkspace((current) => ({
      ...current,
      activePtyID: ptyID,
      isOpen: true,
    }))
  }

  async function handleCloseTerminal(ptyID: string) {
    cancelReconnect(ptyID)

    if (resizeTimersRef.current[ptyID] !== undefined) {
      window.clearTimeout(resizeTimersRef.current[ptyID]!)
      delete resizeTimersRef.current[ptyID]
    }

    const session = workspaceRef.current.sessions[ptyID]
    if (attachedPtyIDRef.current === ptyID) {
      await detachSession(ptyID, true)
    }

    if (session && session.status !== "invalid") {
      try {
        await terminalClient.deleteSession({ id: ptyID })
      } catch (error) {
        console.error("[desktop] deletePtySession failed:", error)
      }
    }

    updateWorkspace((current) => {
      const nextOrder = current.order.filter((id) => id !== ptyID)
      const nextSessions = { ...current.sessions }
      delete nextSessions[ptyID]

      return {
        ...current,
        activePtyID:
          current.activePtyID === ptyID ? nextActivePtyID(nextOrder, ptyID) : current.activePtyID,
        order: nextOrder,
        sessions: nextSessions,
      }
    })
  }

  function handlePanelHeightChange(height: number) {
    updateWorkspace((current) => ({
      ...current,
      panelHeight: clampPanelHeight(height),
    }))
  }

  function handleTerminalResize(ptyID: string, rows: number, cols: number) {
    updateWorkspace((current) => {
      const session = current.sessions[ptyID]
      if (!session) return current
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [ptyID]: {
            ...session,
            rows,
            cols,
          },
        },
      }
    })

    if (resizeTimersRef.current[ptyID] !== undefined) {
      window.clearTimeout(resizeTimersRef.current[ptyID]!)
    }

    resizeTimersRef.current[ptyID] = window.setTimeout(() => {
      delete resizeTimersRef.current[ptyID]
      void terminalClient.updateSession({ id: ptyID, rows, cols }).catch((error) => {
        console.error("[desktop] updatePtySession failed:", error)
      })
    }, 120)
  }

  function handleTerminalSnapshotChange(ptyID: string, input: { scrollTop?: number }) {
    updateWorkspace((current) => {
      const session = current.sessions[ptyID]
      if (!session) return current
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [ptyID]: {
            ...session,
            scrollTop: input.scrollTop ?? session.scrollTop,
          },
        },
      }
    })
  }

  async function handleTerminalInput(data: string) {
    const activePtyID = workspaceRef.current.activePtyID
    if (!activePtyID) return

    try {
      await terminalClient.writeInput({
        id: activePtyID,
        data,
      })
    } catch (error) {
      console.error("[desktop] writePtyInput failed:", error)
    }
  }

  return {
    activeSession,
    isOpen: workspace.isOpen,
    panelHeight: clampPanelHeight(workspace.panelHeight),
    sessions,
    handleCloseTerminal,
    handleCreateTerminal,
    handlePanelHeightChange,
    handleSelectTerminal,
    handleTerminalInput,
    handleTerminalResize,
    handleTerminalSnapshotChange,
    handleTogglePanel,
  }
}
