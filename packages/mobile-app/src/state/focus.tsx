import * as SecureStore from "expo-secure-store"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

const FOCUS_WORKSPACE_ID_KEY = "anybox.mobile.focus.workspaceID"
const FOCUS_SESSION_ID_KEY = "anybox.mobile.focus.sessionID"

interface FocusState {
  workspaceID: string | null
  sessionID: string | null
}

interface FocusContextValue extends FocusState {
  loading: boolean
  setFocus: (nextFocus: Partial<FocusState>) => Promise<void>
  clearFocus: () => Promise<void>
}

const FocusContext = createContext<FocusContextValue | undefined>(undefined)

export function FocusProvider({ children }: { children: React.ReactNode }) {
  const [workspaceID, setWorkspaceID] = useState<string | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([
      SecureStore.getItemAsync(FOCUS_WORKSPACE_ID_KEY),
      SecureStore.getItemAsync(FOCUS_SESSION_ID_KEY),
    ])
      .then(([storedWorkspaceID, storedSessionID]) => {
        if (!mounted) return
        setWorkspaceID(storedWorkspaceID || null)
        setSessionID(storedSessionID || null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const setFocus = useCallback(async (nextFocus: Partial<FocusState>) => {
    const hasWorkspace = Object.prototype.hasOwnProperty.call(nextFocus, "workspaceID")
    const hasSession = Object.prototype.hasOwnProperty.call(nextFocus, "sessionID")
    const nextWorkspaceID = hasWorkspace ? nextFocus.workspaceID ?? null : workspaceID
    const nextSessionID = hasSession ? nextFocus.sessionID ?? null : sessionID

    await Promise.all([
      hasWorkspace
        ? nextWorkspaceID
          ? SecureStore.setItemAsync(FOCUS_WORKSPACE_ID_KEY, nextWorkspaceID)
          : SecureStore.deleteItemAsync(FOCUS_WORKSPACE_ID_KEY)
        : Promise.resolve(),
      hasSession
        ? nextSessionID
          ? SecureStore.setItemAsync(FOCUS_SESSION_ID_KEY, nextSessionID)
          : SecureStore.deleteItemAsync(FOCUS_SESSION_ID_KEY)
        : Promise.resolve(),
    ])
    if (hasWorkspace) setWorkspaceID(nextWorkspaceID)
    if (hasSession) setSessionID(nextSessionID)
  }, [sessionID, workspaceID])

  const clearFocus = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(FOCUS_WORKSPACE_ID_KEY),
      SecureStore.deleteItemAsync(FOCUS_SESSION_ID_KEY),
    ])
    setWorkspaceID(null)
    setSessionID(null)
  }, [])

  const value = useMemo(
    () => ({
      workspaceID,
      sessionID,
      loading,
      setFocus,
      clearFocus,
    }),
    [clearFocus, loading, sessionID, setFocus, workspaceID],
  )

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>
}

export function useFocus() {
  const value = useContext(FocusContext)
  if (!value) throw new Error("useFocus must be used inside FocusProvider.")
  return value
}
