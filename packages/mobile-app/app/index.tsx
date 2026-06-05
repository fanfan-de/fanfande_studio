import { Stack, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Linking, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Screen } from "@/components/screen"
import { StateCard } from "@/components/state-card"
import { ConnectionHomePage } from "@/home/connection"
import { CurrentSessionHomePage } from "@/home/current-session"
import { buildSessionTitle, formatProviderStatus, sortSessions } from "@/home/format"
import { ContextSelectorSheet } from "@/home/sheets"
import {
  connectAccountRelayDesktop,
  listAccountRelayDesktops,
  type MobileAccountRelayDesktop,
  type MobileAccountSession,
} from "@/api/account-api"
import {
  createSession,
  getApprovals,
  getMessages,
  getStatus,
  getWorkspaces,
  normalizeConnectionInput,
  readConnectionUrlFromDeepLink,
  sendPrompt,
  type MobileApproval,
  type MobileMessage,
  type MobileSessionSummary,
  type MobileStatus,
  type MobileWorkspace,
} from "@/api/mobile-api"
import { useMobileEvents } from "@/hooks/use-mobile-events"
import { formatAppVersionLabel, getCurrentAppInfo } from "@/services/app-updates"
import { useAccount } from "@/state/account"
import { useConnection } from "@/state/connection"
import { useFocus } from "@/state/focus"

const handledIncomingLinks = new Set<string>()

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const maxWidth = width >= 760 ? 720 : undefined
  const { account, loading: accountLoading } = useAccount()
  const { connection, loading: connectionLoading, saveConnection } = useConnection()
  const focus = useFocus()
  const [endpoint, setEndpoint] = useState("")
  const [token, setToken] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [accountDesktops, setAccountDesktops] = useState<MobileAccountRelayDesktop[]>([])
  const [accountDesktopsLoading, setAccountDesktopsLoading] = useState(false)
  const [accountDesktopError, setAccountDesktopError] = useState<string | null>(null)
  const [connectingDesktopID, setConnectingDesktopID] = useState<string | null>(null)
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [workspaces, setWorkspaces] = useState<MobileWorkspace[]>([])
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [error, setError] = useState<string | null>(null)
  const [messages, setMessages] = useState<MobileMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messageError, setMessageError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<{ id: string; text: string } | null>(null)
  const [streamingAssistant, setStreamingAssistant] = useState<{ id: string; text: string } | null>(null)
  const [selectorKind, setSelectorKind] = useState<"projects" | "conversations" | null>(null)
  const autoConnectAttemptedDesktopIDRef = useRef<string | null>(null)
  const currentApp = useMemo(() => getCurrentAppInfo(), [])

  useEffect(() => {
    if (!accountLoading && !connectionLoading && !account && !connection) {
      router.replace("/account" as never)
    }
  }, [account, accountLoading, connection, connectionLoading, router])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!connection) {
      setStatus(null)
      setWorkspaces([])
      setApprovals([])
      return
    }
    if (!options?.silent) {
      setRefreshing(true)
      setError(null)
    }
    try {
      const [nextStatus, nextWorkspaces, nextApprovals] = await Promise.all([
        getStatus(connection),
        getWorkspaces(connection),
        getApprovals(connection, { status: "pending" }),
      ])
      setStatus(nextStatus)
      setWorkspaces(nextWorkspaces)
      setApprovals(nextApprovals)
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load Anybox.")
      }
    } finally {
      if (!options?.silent) setRefreshing(false)
    }
  }, [connection])

  useEffect(() => {
    void load()
  }, [load])

  useMobileEvents({
    connection,
    enabled: Boolean(connection),
    onEvent: () => void load({ silent: true }),
  })

  const loadAccountDesktops = useCallback(async (nextAccount: MobileAccountSession | null = account) => {
    if (!nextAccount) {
      setAccountDesktops([])
      setAccountDesktopError(null)
      return
    }
    setAccountDesktopsLoading(true)
    setAccountDesktopError(null)
    try {
      setAccountDesktops(await listAccountRelayDesktops(nextAccount))
    } catch (desktopError) {
      setAccountDesktopError(desktopError instanceof Error ? desktopError.message : "Unable to load desktop devices.")
    } finally {
      setAccountDesktopsLoading(false)
    }
  }, [account])

  const connectAccountDesktop = useCallback(async (desktop: MobileAccountRelayDesktop) => {
    if (!account || !desktop.online) return
    setConnectingDesktopID(desktop.id)
    setError(null)
    setAccountDesktopError(null)
    try {
      const result = await connectAccountRelayDesktop(account, desktop.id, "Anybox Android")
      await saveConnection(account.baseUrl, result.token, result.device.id, {
        transport: "relay",
        desktopID: result.desktop?.id ?? result.desktopID ?? desktop.id,
      })
    } catch (connectError) {
      setAccountDesktopError(connectError instanceof Error ? connectError.message : "Unable to connect this desktop.")
    } finally {
      setConnectingDesktopID(null)
    }
  }, [account, saveConnection])

  useEffect(() => {
    if (connection || accountLoading) return
    void loadAccountDesktops(account)
  }, [account, accountLoading, connection, loadAccountDesktops])

  const onlineDesktops = useMemo(() => accountDesktops.filter((desktop) => desktop.online), [accountDesktops])

  useEffect(() => {
    if (connection || !account || accountDesktopsLoading || connectingDesktopID || onlineDesktops.length !== 1) return
    const [desktop] = onlineDesktops
    if (!desktop || autoConnectAttemptedDesktopIDRef.current === desktop.id) return
    autoConnectAttemptedDesktopIDRef.current = desktop.id
    void connectAccountDesktop(desktop)
  }, [account, accountDesktopsLoading, connectAccountDesktop, connectingDesktopID, connection, onlineDesktops])

  const openConnectionConfirmation = useCallback((nextEndpoint: string, nextToken: string) => {
    setError(null)
    try {
      normalizeConnectionInput(nextEndpoint, nextToken)
      const params = new URLSearchParams({ url: nextEndpoint })
      if (nextToken.trim()) params.set("token", nextToken.trim())
      router.push(`/connect?${params.toString()}` as never)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to prepare connection.")
    }
  }, [router])

  const handleIncomingLink = useCallback(
    (url: string) => {
      if (handledIncomingLinks.has(url)) return
      handledIncomingLinks.add(url)
      const bridgeUrl = readConnectionUrlFromDeepLink(url)
      if (!bridgeUrl) return
      setEndpoint(bridgeUrl)
      setToken("")
      try {
        const nextCandidate = normalizeConnectionInput(bridgeUrl, "")
        if (connection && !nextCandidate.pairingCode && nextCandidate.baseUrl === connection.baseUrl && nextCandidate.token === connection.token) return
      } catch {
        return
      }
      router.push(`/connect?url=${encodeURIComponent(bridgeUrl)}` as never)
    },
    [connection, router],
  )

  useEffect(() => {
    if (connectionLoading) return undefined
    let cancelled = false
    void Linking.getInitialURL()
      .then((url) => {
        if (!cancelled && url) handleIncomingLink(url)
      })
      .catch(() => undefined)

    const subscription = Linking.addEventListener("url", ({ url }) => handleIncomingLink(url))
    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [handleIncomingLink, connectionLoading])

  const sortedWorkspaces = useMemo(
    () => [...workspaces].sort((left, right) => right.updated - left.updated),
    [workspaces],
  )
  const focusedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === focus.workspaceID) ?? sortedWorkspaces[0] ?? null,
    [focus.workspaceID, sortedWorkspaces, workspaces],
  )
  const focusedSessions = useMemo(() => sortSessions(focusedWorkspace?.sessions ?? []), [focusedWorkspace])
  const focusedSession = useMemo(
    () => focusedSessions.find((session) => session.id === focus.sessionID) ?? focusedSessions[0] ?? null,
    [focus.sessionID, focusedSessions],
  )
  const selectedSessionID = focusedSession?.id ?? null

  useEffect(() => {
    if (focus.loading || !focusedWorkspace) return
    const nextSessionID = focusedSession?.id ?? null
    if (focus.workspaceID === focusedWorkspace.id && focus.sessionID === nextSessionID) return
    void focus.setFocus({
      workspaceID: focusedWorkspace.id,
      sessionID: nextSessionID,
    })
  }, [focus, focusedSession?.id, focusedWorkspace])

  const readSessionMessages = useCallback(async (sessionID: string) => {
    if (!connection) return
    const nextMessages = await getMessages(connection, sessionID)
    setMessages(nextMessages)
  }, [connection])

  const loadMessages = useCallback(async () => {
    if (!connection || !selectedSessionID) {
      setMessages([])
      setMessagesLoading(false)
      setMessageError(null)
      return
    }
    setMessagesLoading(true)
    setMessageError(null)
    try {
      await readSessionMessages(selectedSessionID)
    } catch (loadError) {
      setMessageError(loadError instanceof Error ? loadError.message : "Unable to load conversation.")
    } finally {
      setMessagesLoading(false)
    }
  }, [connection, readSessionMessages, selectedSessionID])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  const visibleMessages = useMemo(() => {
    const nextMessages = pendingPrompt
      ? [
          ...messages,
          {
            info: {
              id: pendingPrompt.id,
              role: "user",
              created: Date.now(),
              updated: Date.now(),
            },
            parts: [{ type: "text", text: pendingPrompt.text }],
          },
        ]
      : [...messages]

    if (streamingAssistant) {
      nextMessages.push({
        info: {
          id: streamingAssistant.id,
          role: "assistant",
          created: Date.now(),
          updated: Date.now(),
        },
        parts: [{ type: "text", text: streamingAssistant.text || "..." }],
      })
    }

    return nextMessages satisfies MobileMessage[]
  }, [messages, pendingPrompt, streamingAssistant])

  const handleSelectWorkspace = useCallback(
    (workspace: MobileWorkspace) => {
      const [firstSession] = sortSessions(workspace.sessions)
      void focus.setFocus({
        workspaceID: workspace.id,
        sessionID: firstSession?.id ?? null,
      })
    },
    [focus],
  )

  const handleSelectSession = useCallback(
    (session: MobileSessionSummary) => {
      void focus.setFocus({
        workspaceID: focusedWorkspace?.id ?? focus.workspaceID ?? null,
        sessionID: session.id,
      })
    },
    [focus, focusedWorkspace?.id],
  )

  const handleCreateConversation = useCallback(async () => {
    if (!connection || !focusedWorkspace) return
    setSending(true)
    setMessageError(null)
    try {
      const session = await createSession(connection, focusedWorkspace.id, { title: "Mobile chat" })
      await focus.setFocus({ workspaceID: focusedWorkspace.id, sessionID: session.id })
      await load({ silent: true })
    } catch (createError) {
      setMessageError(createError instanceof Error ? createError.message : "Unable to create conversation.")
    } finally {
      setSending(false)
    }
  }, [connection, focus, focusedWorkspace, load])

  const handleSend = useCallback(async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (!connection) {
      setMessageError("Connect AnyboxProvider before sending.")
      return
    }
    if (!focusedWorkspace) {
      setMessageError("Select a project before sending.")
      return
    }

    setSending(true)
    setDraft("")
    setPendingPrompt({ id: `local-${Date.now()}`, text })
    const streamID = `stream-${Date.now()}`
    setStreamingAssistant({ id: streamID, text: "" })
    setMessageError(null)

    try {
      let targetSessionID = focusedSession?.id
      if (!targetSessionID) {
        const session = await createSession(connection, focusedWorkspace.id, {
          title: buildSessionTitle(text),
        })
        targetSessionID = session.id
        await focus.setFocus({ workspaceID: focusedWorkspace.id, sessionID: session.id })
        await load({ silent: true })
      }

      await sendPrompt(connection, targetSessionID, text, {
        onEvent: () => {
          void readSessionMessages(targetSessionID).catch(() => undefined)
        },
        onOpen: () => {
          setSending(false)
        },
        onTextDelta: (delta) => {
          setStreamingAssistant((current) => ({
            id: current?.id ?? streamID,
            text: `${current?.text ?? ""}${delta}`,
          }))
        },
      })
      setPendingPrompt(null)
      setStreamingAssistant(null)
      await readSessionMessages(targetSessionID)
    } catch (sendError) {
      setPendingPrompt(null)
      setStreamingAssistant(null)
      setDraft(text)
      setMessageError(sendError instanceof Error ? sendError.message : "Unable to send prompt.")
    } finally {
      setSending(false)
    }
  }, [connection, draft, focus, focusedSession?.id, focusedWorkspace, load, readSessionMessages, sending])

  if (accountLoading || connectionLoading || focus.loading) {
    return (
      <Screen>
        <StateCard title="Opening Anybox" />
      </Screen>
    )
  }

  if (!account && !connection) {
    return (
      <Screen>
        <StateCard title="Opening email sign in" />
      </Screen>
    )
  }

  const providerStatus = formatProviderStatus({
    accountDesktopsLoading,
    connectingDesktopID,
    connection,
    onlineDesktops,
    status,
  })
  const composerDisabled = sending || !draft.trim() || !connection || !focusedWorkspace
  const composerPlaceholder = !connection
    ? "AnyboxProvider is offline"
    : !focusedWorkspace
      ? "Select a project"
      : focusedSession
        ? `Send to ${focusedSession.title}`
        : "Start a conversation in this project"

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      {!connection ? (
        <ConnectionHomePage
          accountDesktops={accountDesktops}
          accountDesktopsLoading={accountDesktopsLoading}
          accountDesktopError={accountDesktopError}
          appVersion={formatAppVersionLabel(currentApp)}
          connectingDesktopID={connectingDesktopID}
          endpoint={endpoint}
          error={error}
          manualOpen={manualOpen}
          maxWidth={maxWidth}
          onConnectDesktop={connectAccountDesktop}
          onEndpointChange={setEndpoint}
          onManualToggle={() => setManualOpen((current) => !current)}
          onOpenDiagnostics={() => router.push("/diagnostics" as never)}
          onOpenProvider={() => router.push("/provider" as never)}
          onOpenUpdates={() => router.push("/updates" as never)}
          onRefreshDesktopList={() => void loadAccountDesktops(account)}
          onReviewConnection={() => openConnectionConfirmation(endpoint, token)}
          onScan={() => router.push("/scan" as never)}
          onTokenChange={setToken}
          paddingBottom={32 + insets.bottom}
          paddingTop={18 + insets.top}
          providerDetail={providerStatus.detail}
          providerLabel={providerStatus.label}
          providerTone={providerStatus.tone}
          token={token}
        />
      ) : (
        <>
          <CurrentSessionHomePage
            appVersion={formatAppVersionLabel(currentApp)}
            approvals={approvals}
            disabled={composerDisabled}
            draft={draft}
            focusedSession={focusedSession}
            focusedWorkspace={focusedWorkspace}
            messageError={messageError}
            messages={visibleMessages}
            messagesLoading={messagesLoading}
            onChangeText={setDraft}
            onNewChat={() => void handleCreateConversation()}
            onOpenApprovals={() => router.push("/approvals" as never)}
            onOpenDiagnostics={() => router.push("/diagnostics" as never)}
            onOpenProvider={() => router.push("/provider" as never)}
            onOpenSessionPicker={() => setSelectorKind("conversations")}
            onOpenUpdates={() => router.push("/updates" as never)}
            onOpenWorkspacePicker={() => setSelectorKind("projects")}
            onRefresh={() => void load()}
            onSend={() => void handleSend()}
            paddingBottom={Math.max(insets.bottom, 10)}
            paddingTop={insets.top}
            placeholder={composerPlaceholder}
            providerDetail={providerStatus.detail}
            providerLabel={providerStatus.label}
            providerTone={providerStatus.tone}
            refreshing={refreshing}
            sending={sending}
          />
          <ContextSelectorSheet
            focusedSessionID={focusedSession?.id}
            focusedWorkspaceID={focusedWorkspace?.id}
            kind={selectorKind}
            maxWidth={maxWidth}
            onClose={() => setSelectorKind(null)}
            onNewChat={() => {
              setSelectorKind(null)
              void handleCreateConversation()
            }}
            onSelectSession={(session) => {
              handleSelectSession(session)
              setSelectorKind(null)
            }}
            onSelectWorkspace={(workspace) => {
              handleSelectWorkspace(workspace)
              setSelectorKind(null)
            }}
            paddingBottom={Math.max(insets.bottom, 14)}
            sending={sending}
            sessions={focusedSessions}
            workspaces={sortedWorkspaces}
          />
        </>
      )}
    </>
  )
}
