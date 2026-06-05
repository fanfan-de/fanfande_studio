import { Stack, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Linking, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
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
import { formatRelativeTime, trimMiddle } from "@/utils/format"
import { messageRole, messageText } from "@/utils/message"

const handledIncomingLinks = new Set<string>()

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const maxWidth = width >= 760 ? 720 : undefined
  const pagerRef = useRef<ScrollView | null>(null)
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
  const autoConnectAttemptedDesktopIDRef = useRef<string | null>(null)
  const currentApp = useMemo(() => getCurrentAppInfo(), [])

  const scrollToPage = useCallback(
    (page: 0 | 1) => {
      pagerRef.current?.scrollTo({ x: page * width, animated: true })
    },
    [width],
  )

  useEffect(() => {
    if (!accountLoading && !account) {
      router.replace("/account" as never)
    }
  }, [account, accountLoading, router])

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
        if (connection && normalizeConnectionInput(bridgeUrl, "").baseUrl === connection.baseUrl) return
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

  if (!account) {
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
        <View style={{ flex: 1, backgroundColor: "#171717" }}>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1 }}
            contentContainerStyle={{
              alignItems: "center",
              gap: 14,
              paddingBottom: 32 + insets.bottom,
              paddingHorizontal: 16,
              paddingTop: 18 + insets.top,
            }}
          >
            <View style={{ maxWidth, width: "100%", gap: 14 }}>
              <DarkProviderRow
                detail={providerStatus.detail}
                label={providerStatus.label}
                tone={providerStatus.tone}
                onPress={() => router.push("/provider" as never)}
              />
              <ConnectionSetupSection
                accountDesktops={accountDesktops}
                accountDesktopsLoading={accountDesktopsLoading}
                accountDesktopError={accountDesktopError}
                connectingDesktopID={connectingDesktopID}
                endpoint={endpoint}
                error={error}
                manualOpen={manualOpen}
                onConnectDesktop={connectAccountDesktop}
                onEndpointChange={setEndpoint}
                onManualToggle={() => setManualOpen((current) => !current)}
                onRefreshDesktopList={() => void loadAccountDesktops(account)}
                onReviewConnection={() => openConnectionConfirmation(endpoint, token)}
                onScan={() => router.push("/scan" as never)}
                onTokenChange={setToken}
                token={token}
              />
            </View>
          </ScrollView>
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: "#171717" }}>
          <ScrollView
            ref={pagerRef}
            contentOffset={{ x: width, y: 0 }}
            horizontal
            keyboardShouldPersistTaps="handled"
            pagingEnabled
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            <View style={{ width }}>
              <SessionDrawerPage
                appVersion={formatAppVersionLabel(currentApp)}
                focusedSessionID={focusedSession?.id}
                focusedWorkspaceID={focusedWorkspace?.id}
                onNewChat={() => {
                  void handleCreateConversation()
                  scrollToPage(1)
                }}
                onOpenProvider={() => router.push("/provider" as never)}
                onOpenUpdates={() => router.push("/updates" as never)}
                onRefresh={load}
                onSelectSession={(session) => {
                  handleSelectSession(session)
                  scrollToPage(1)
                }}
                onSelectWorkspace={handleSelectWorkspace}
                paddingBottom={Math.max(insets.bottom, 14)}
                paddingTop={insets.top}
                providerDetail={providerStatus.detail}
                providerLabel={providerStatus.label}
                providerTone={providerStatus.tone}
                refreshing={refreshing}
                sending={sending}
                sessions={focusedSessions}
                workspaces={sortedWorkspaces}
              />
            </View>
            <View style={{ width }}>
              <ThreadViewPage
                disabled={composerDisabled}
                draft={draft}
                focusedSession={focusedSession}
                focusedWorkspace={focusedWorkspace}
                messageError={messageError}
                messages={visibleMessages}
                messagesLoading={messagesLoading}
                onBack={() => scrollToPage(0)}
                onChangeText={setDraft}
                onNewChat={() => void handleCreateConversation()}
                onOpenApprovals={() => router.push("/approvals")}
                onOpenProvider={() => router.push("/provider" as never)}
                onOpenSessionPicker={() => scrollToPage(0)}
                onRefresh={load}
                onSend={() => void handleSend()}
                paddingBottom={Math.max(insets.bottom, 10)}
                paddingTop={insets.top}
                pendingApprovals={approvals.length}
                placeholder={composerPlaceholder}
                refreshing={refreshing}
                sending={sending}
              />
            </View>
          </ScrollView>
        </View>
      )}
    </>
  )
}

function SessionDrawerPage({
  appVersion,
  focusedSessionID,
  focusedWorkspaceID,
  onNewChat,
  onOpenProvider,
  onOpenUpdates,
  onRefresh,
  onSelectSession,
  onSelectWorkspace,
  paddingBottom,
  paddingTop,
  providerDetail,
  providerLabel,
  providerTone,
  refreshing,
  sending,
  sessions,
  workspaces,
}: {
  appVersion: string
  focusedSessionID?: string
  focusedWorkspaceID?: string
  onNewChat: () => void
  onOpenProvider: () => void
  onOpenUpdates: () => void
  onRefresh: () => void
  onSelectSession: (session: MobileSessionSummary) => void
  onSelectWorkspace: (workspace: MobileWorkspace) => void
  paddingBottom: number
  paddingTop: number
  providerDetail: string
  providerLabel: string
  providerTone: "neutral" | "success" | "danger"
  refreshing: boolean
  sending: boolean
  sessions: MobileSessionSummary[]
  workspaces: MobileWorkspace[]
}) {
  return (
    <View style={{ backgroundColor: "#191919", flex: 1, paddingBottom, paddingTop }}>
      <View style={{ alignSelf: "center", flex: 1, width: "100%", maxWidth: 430 }}>
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 14 }}>
          <DarkProviderRow detail={providerDetail} label={providerLabel} tone={providerTone} onPress={onOpenProvider} />

          <ScrollView
            contentContainerStyle={{ gap: 4, paddingBottom: 18, paddingTop: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {workspaces.length ? (
              workspaces.map((workspace) => {
                const selected = workspace.id === focusedWorkspaceID
                return (
                  <View key={workspace.id} style={{ gap: 3 }}>
                    <DrawerProjectRow
                      selected={selected}
                      title={workspace.name}
                      onPress={() => onSelectWorkspace(workspace)}
                    />
                    {selected ? (
                      <View style={{ gap: 2, paddingLeft: 18 }}>
                        {sessions.length ? (
                          sessions.map((session) => (
                            <DrawerSessionRow
                              key={session.id}
                              meta={session.workflow?.status}
                              selected={session.id === focusedSessionID}
                              title={session.title}
                              onPress={() => onSelectSession(session)}
                            />
                          ))
                        ) : (
                          <Text selectable style={{ color: "#8c8c8c", fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 }}>
                            No sessions
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                )
              })
            ) : (
              <View style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
                <Text selectable style={{ color: "#8c8c8c", fontSize: 15, fontWeight: "700" }}>
                  No projects
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={{ gap: 10, paddingHorizontal: 14, paddingTop: 10 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 18, justifyContent: "center", minHeight: 34 }}>
            <DarkToolbarButton label={refreshing ? "Refreshing" : "Refresh"} onPress={onRefresh} />
            <DarkToolbarButton label={sending ? "Creating" : "New"} onPress={onNewChat} />
            <DarkToolbarButton label="Updates" onPress={onOpenUpdates} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenProvider}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: "#363636",
              borderRadius: 27,
              flexDirection: "row",
              gap: 12,
              height: 54,
              opacity: pressed ? 0.78 : 1,
              paddingHorizontal: 16,
            })}
          >
            <View style={{ backgroundColor: "#e8e8e8", borderRadius: 4, height: 8, width: 8 }} />
            <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 15, fontWeight: "800" }}>
              AnyboxProvider
            </Text>
            <Text numberOfLines={1} style={{ color: "#a9a9a9", fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "700" }}>
              {appVersion}
            </Text>
          </Pressable>
          <View style={{ alignItems: "center", flexDirection: "row", height: 44, justifyContent: "space-between" }}>
            <Text numberOfLines={1} style={{ color: "#a9a9a9", flex: 1, fontSize: 12 }}>
              {providerDetail}
            </Text>
            <Text style={{ color: darkToneColor(providerTone), fontSize: 12, fontWeight: "800" }}>{providerLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function DrawerProjectRow({
  selected,
  title,
  onPress,
}: {
  selected: boolean
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 9,
        flexDirection: "row",
        gap: 8,
        height: 42,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 8,
      })}
    >
      <Text style={{ color: "#cfcfcf", fontSize: 16, width: 12 }}>{selected ? "⌄" : "›"}</Text>
      <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 15, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  )
}

function DrawerSessionRow({
  meta,
  selected,
  title,
  onPress,
}: {
  meta?: string
  selected: boolean
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: selected ? "#474747" : "transparent",
        borderRadius: 10,
        flexDirection: "row",
        height: 32,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 10,
      })}
    >
      <Text numberOfLines={1} style={{ color: selected ? "#ffffff" : "#d6d6d6", flex: 1, fontSize: 13, fontWeight: selected ? "800" : "600" }}>
        {title}
      </Text>
      {meta ? (
        <Text numberOfLines={1} style={{ color: "#a9a9a9", fontSize: 11, fontWeight: "700" }}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  )
}

function ThreadViewPage({
  disabled,
  draft,
  focusedSession,
  focusedWorkspace,
  messageError,
  messages,
  messagesLoading,
  onBack,
  onChangeText,
  onNewChat,
  onOpenApprovals,
  onOpenProvider,
  onOpenSessionPicker,
  onRefresh,
  onSend,
  paddingBottom,
  paddingTop,
  pendingApprovals,
  placeholder,
  refreshing,
  sending,
}: {
  disabled: boolean
  draft: string
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  messageError: string | null
  messages: MobileMessage[]
  messagesLoading: boolean
  onBack: () => void
  onChangeText: (value: string) => void
  onNewChat: () => void
  onOpenApprovals: () => void
  onOpenProvider: () => void
  onOpenSessionPicker: () => void
  onRefresh: () => void
  onSend: () => void
  paddingBottom: number
  paddingTop: number
  pendingApprovals: number
  placeholder: string
  refreshing: boolean
  sending: boolean
}) {
  const title = focusedSession?.title ?? "New session"

  return (
    <View style={{ backgroundColor: "#171717", flex: 1, paddingBottom, paddingTop }}>
      <View style={{ alignSelf: "center", flex: 1, width: "100%", maxWidth: 430 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10, height: 58, paddingHorizontal: 14 }}>
          <TopIconButton label="‹" onPress={onBack} />
          <Pressable
            accessibilityRole="button"
            onPress={onOpenSessionPicker}
            style={({ pressed }) => ({
              alignItems: "center",
              flex: 1,
              flexDirection: "row",
              gap: 8,
              opacity: pressed ? 0.78 : 1,
            })}
          >
            <Text numberOfLines={1} style={{ color: "#e8e8e8", flexShrink: 1, fontSize: 25, fontWeight: "800" }}>
              {title}
            </Text>
            <Text style={{ color: "#cfcfcf", fontSize: 16, fontWeight: "800" }}>⌄</Text>
          </Pressable>
          <TopIconButton label={refreshing ? "…" : "↻"} onPress={onRefresh} />
          <TopIconButton label={pendingApprovals ? String(pendingApprovals) : "□"} onPress={onOpenApprovals} />
          <TopIconButton label="…" onPress={onOpenProvider} />
        </View>

        <ScrollView
          contentContainerStyle={{ gap: 14, paddingBottom: 18, paddingHorizontal: 22, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {messageError ? (
            <DarkNotice title="Composer failed" detail={messageError} tone="danger" />
          ) : null}
          {focusedWorkspace && !focusedSession ? (
            <AssistantIntro workspaceName={focusedWorkspace.name} />
          ) : null}
          {focusedSession ? (
            messages.length ? (
              messages.map((message, index) => (
                <ThreadMessage key={message.info?.id ?? `${index}`} message={message} />
              ))
            ) : (
              <DarkEmpty title={messagesLoading ? "Loading session" : "No messages"} />
            )
          ) : null}
        </ScrollView>

        <ThreadComposer
          disabled={disabled}
          draft={draft}
          onChangeText={onChangeText}
          onNewChat={onNewChat}
          onSend={onSend}
          placeholder={placeholder}
          sending={sending}
        />
      </View>
    </View>
  )
}

function ThreadMessage({ message }: { message: MobileMessage }) {
  const role = messageRole(message)
  const isUser = role === "user"
  const text = messageText(message)

  if (isUser) {
    return (
      <View style={{ alignItems: "flex-end" }}>
        <View style={{ backgroundColor: "#474747", borderRadius: 17, borderTopRightRadius: 4, maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text selectable style={{ color: "#ffffff", fontSize: 16, lineHeight: 22 }}>
            {text}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text style={{ color: "#e8e8e8", fontSize: 16, fontWeight: "900" }}>⌘</Text>
        <Text style={{ color: "#e8e8e8", fontSize: 15, fontWeight: "800" }}>anybox</Text>
      </View>
      <Text selectable style={{ color: "#dedede", fontSize: 16, lineHeight: 22 }}>
        {text || "..."}
      </Text>
    </View>
  )
}

function AssistantIntro({ workspaceName }: { workspaceName: string }) {
  return (
    <View style={{ gap: 10, paddingTop: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text style={{ color: "#e8e8e8", fontSize: 16, fontWeight: "900" }}>⌘</Text>
        <Text style={{ color: "#e8e8e8", fontSize: 15, fontWeight: "800" }}>anybox</Text>
      </View>
      <Text selectable style={{ color: "#dedede", fontSize: 16, lineHeight: 22 }}>
        {`Ready in ${workspaceName}. Send a task to create a focused session.`}
      </Text>
    </View>
  )
}

function ThreadComposer({
  disabled,
  draft,
  onChangeText,
  onNewChat,
  onSend,
  placeholder,
  sending,
}: {
  disabled: boolean
  draft: string
  onChangeText: (value: string) => void
  onNewChat: () => void
  onSend: () => void
  placeholder: string
  sending: boolean
}) {
  return (
    <View style={{ backgroundColor: "#171717", paddingHorizontal: 14, paddingTop: 10 }}>
      <View
        style={{
          backgroundColor: "#262626",
          borderRadius: 28,
          gap: 8,
          minHeight: 64,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#666666"
          spellCheck={false}
          style={{
            color: "#e8e8e8",
            fontSize: 17,
            maxHeight: 96,
            minHeight: 26,
            padding: 0,
            textAlignVertical: "top",
          }}
          value={draft}
        />
        <View style={{ alignItems: "center", flexDirection: "row", height: 36, justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <ComposerIcon label="+" onPress={onNewChat} />
            <ComposerIcon label="⌘" onPress={onNewChat} />
          </View>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <ComposerIcon label="mic" onPress={() => undefined} />
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={onSend}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: disabled ? "#3a3a3a" : "#e8e8e8",
                borderRadius: 16,
                height: 32,
                justifyContent: "center",
                opacity: pressed ? 0.78 : 1,
                width: 32,
              })}
            >
              <Text style={{ color: disabled ? "#777777" : "#171717", fontSize: 15, fontWeight: "900" }}>
                {sending ? "…" : "↑"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function ComposerIcon({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, paddingVertical: 5 })}>
      <Text style={{ color: "#cfcfcf", fontSize: label.length > 1 ? 12 : 20, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function TopIconButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 8,
        height: 32,
        justifyContent: "center",
        opacity: pressed ? 0.62 : 1,
        width: 32,
      })}
    >
      <Text style={{ color: "#e8e8e8", fontSize: label.length > 1 ? 14 : 24, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function DarkProviderRow({
  detail,
  label,
  tone,
  onPress,
}: {
  detail: string
  label: string
  tone: "neutral" | "success" | "danger"
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        gap: 10,
        minHeight: 34,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ backgroundColor: darkToneColor(tone), borderRadius: 4, height: 8, width: 8 }} />
      <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 14, fontWeight: "800" }}>
        {detail}
      </Text>
      <Text style={{ color: darkToneColor(tone), fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function DarkToolbarButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, padding: 6 })}>
      <Text style={{ color: "#cfcfcf", fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function DarkEmpty({ title }: { title: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", minHeight: 360 }}>
      <Text selectable style={{ color: "#777777", fontSize: 15, fontWeight: "700" }}>
        {title}
      </Text>
    </View>
  )
}

function DarkNotice({
  detail,
  title,
  tone,
}: {
  detail?: string
  title: string
  tone: "danger" | "neutral"
}) {
  return (
    <View style={{ backgroundColor: tone === "danger" ? "#341c1c" : "#262626", borderRadius: 14, gap: 5, padding: 12 }}>
      <Text selectable style={{ color: tone === "danger" ? "#ffb7b7" : "#e8e8e8", fontSize: 14, fontWeight: "800" }}>
        {title}
      </Text>
      {detail ? (
        <Text selectable style={{ color: "#cfcfcf", fontSize: 13, lineHeight: 18 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

function darkToneColor(tone: "neutral" | "success" | "danger") {
  if (tone === "success") return "#74d58b"
  if (tone === "danger") return "#ff9a9a"
  return "#a9a9a9"
}

function FocusHero({
  focusedSession,
  focusedWorkspace,
  onNewChat,
  onOpenConversationPicker,
  onOpenProjectPicker,
  onOpenSession,
  onRefresh,
  refreshing,
  sending,
}: {
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  onNewChat: () => void
  onOpenConversationPicker: () => void
  onOpenProjectPicker: () => void
  onOpenSession: () => void
  onRefresh: () => void
  refreshing: boolean
  sending: boolean
}) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e3dc",
        borderRadius: 16,
        borderWidth: 1,
        gap: 14,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onOpenProjectPicker}
        style={({ pressed }) => ({
          gap: 8,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <Text selectable style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0 }}>
          Current project
        </Text>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
          <Text selectable numberOfLines={2} style={{ color: "#151515", flex: 1, fontSize: 24, fontWeight: "800", letterSpacing: 0, lineHeight: 30 }}>
            {focusedWorkspace?.name ?? "Select a project"}
          </Text>
          <Text style={{ color: "#676760", fontSize: 13, fontWeight: "800", letterSpacing: 0, paddingTop: 7 }}>
            Change
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenConversationPicker}
        style={({ pressed }) => ({
          backgroundColor: "#f7f7f4",
          borderRadius: 12,
          gap: 6,
          opacity: pressed ? 0.78 : 1,
          padding: 12,
        })}
      >
        <Text selectable style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0 }}>
          Conversation
        </Text>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
          <Text selectable numberOfLines={2} style={{ color: "#151515", flex: 1, fontSize: 16, fontWeight: "700", letterSpacing: 0, lineHeight: 21 }}>
            {focusedSession?.title ?? "New conversation"}
          </Text>
          <Text style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0, paddingTop: 2 }}>
            Select
          </Text>
        </View>
      </Pressable>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Refresh" loading={refreshing} onPress={onRefresh} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <Button disabled={!focusedWorkspace} label="New chat" loading={sending} onPress={onNewChat} />
        </View>
      </View>
      {focusedSession ? (
        <Button label="Open chat" onPress={onOpenSession} variant="secondary" />
      ) : null}
    </View>
  )
}

function ContextSelectorSheet({
  focusedSessionID,
  focusedWorkspaceID,
  kind,
  maxWidth,
  onClose,
  onNewChat,
  onSelectSession,
  onSelectWorkspace,
  paddingBottom,
  sending,
  sessions,
  workspaces,
}: {
  focusedSessionID?: string
  focusedWorkspaceID?: string
  kind: "projects" | "conversations" | null
  maxWidth?: number
  onClose: () => void
  onNewChat: () => void
  onSelectSession: (session: MobileSessionSummary) => void
  onSelectWorkspace: (workspace: MobileWorkspace) => void
  paddingBottom: number
  sending: boolean
  sessions: MobileSessionSummary[]
  workspaces: MobileWorkspace[]
}) {
  const visible = Boolean(kind)
  const title = kind === "projects" ? "Select project" : "Select conversation"

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            backgroundColor: "rgba(21, 21, 21, 0.24)",
            flex: 1,
          }}
        />
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(21, 21, 21, 0.24)",
          }}
        >
          <View
            style={{
              backgroundColor: "#f7f7f4",
              borderColor: "#e5e3dc",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderWidth: 1,
              gap: 14,
              maxHeight: "78%",
              maxWidth,
              paddingBottom,
              paddingHorizontal: 16,
              paddingTop: 10,
              width: "100%",
            }}
          >
            <View style={{ alignItems: "center", gap: 12 }}>
              <View style={{ backgroundColor: "#d4d4cd", borderRadius: 2, height: 4, width: 40 }} />
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
                <Text style={{ color: "#151515", fontSize: 18, fontWeight: "800", letterSpacing: 0 }}>{title}</Text>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, padding: 8 })}>
                  <Text style={{ color: "#676760", fontSize: 15, fontWeight: "800", letterSpacing: 0 }}>Done</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 2 }} showsVerticalScrollIndicator={false}>
              {kind === "projects" ? (
                workspaces.length ? (
                  workspaces.map((workspace) => (
                    <SheetChoiceRow
                      key={workspace.id}
                      meta={`${workspace.sessions.length} chats`}
                      selected={workspace.id === focusedWorkspaceID}
                      subtitle={trimMiddle(workspace.directory, 72)}
                      title={workspace.name}
                      onPress={() => onSelectWorkspace(workspace)}
                    />
                  ))
                ) : (
                  <StateCard title="No projects" detail="The current desktop only returns projects with existing chats." />
                )
              ) : (
                <>
                  <SheetChoiceRow
                    meta="Create"
                    selected={false}
                    title={sending ? "Creating" : "New conversation"}
                    onPress={onNewChat}
                  />
                  {sessions.length ? (
                    sessions.map((session) => (
                      <SheetChoiceRow
                        key={session.id}
                        meta={session.workflow?.status || formatRelativeTime(session.updated)}
                        selected={session.id === focusedSessionID}
                        title={session.title}
                        onPress={() => onSelectSession(session)}
                      />
                    ))
                  ) : (
                    <StateCard title="No conversations" />
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function SheetChoiceRow({
  meta,
  selected,
  subtitle,
  title,
  onPress,
}: {
  meta: string
  selected: boolean
  subtitle?: string
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: selected ? "#151515" : "#ffffff",
        borderColor: selected ? "#151515" : "#e5e3dc",
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
        minHeight: 58,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
        <Text
          numberOfLines={2}
          style={{
            color: selected ? "#ffffff" : "#151515",
            flex: 1,
            fontSize: 16,
            fontWeight: "800",
            letterSpacing: 0,
            lineHeight: 20,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: selected ? "#d8d8d2" : "#676760",
            fontSize: 12,
            fontVariant: ["tabular-nums"],
            fontWeight: "800",
            letterSpacing: 0,
            paddingTop: 2,
          }}
        >
          {meta}
        </Text>
      </View>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={{
            color: selected ? "#d8d8d2" : "#676760",
            fontSize: 12,
            letterSpacing: 0,
            lineHeight: 16,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}

function ChatPreviewPanel({
  focusedSession,
  focusedWorkspace,
  messageError,
  messagesLoading,
  recentMessages,
  visibleMessageCount,
}: {
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  messageError: string | null
  messagesLoading: boolean
  recentMessages: MobileMessage[]
  visibleMessageCount: number
}) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader caption={focusedSession ? `${visibleMessageCount}` : undefined} title="Chat" />
      <View
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#e5e3dc",
          borderRadius: 16,
          borderWidth: 1,
          gap: 12,
          minHeight: 260,
          padding: 14,
        }}
      >
        {messageError ? <StateCard title="Composer failed" detail={messageError} tone="danger" /> : null}
        {focusedSession ? (
          recentMessages.length ? (
            recentMessages.map((message, index) => (
              <MessagePreview key={message.info?.id ?? `${index}`} message={message} />
            ))
          ) : (
            <ChatEmpty title={messagesLoading ? "Loading conversation" : "No messages"} />
          )
        ) : (
          <ChatEmpty title={focusedWorkspace ? "Ready for a new conversation" : "No project selected"} />
        )}
      </View>
    </View>
  )
}

function ChatEmpty({ title }: { title: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center", minHeight: 220 }}>
      <Text selectable style={{ color: "#676760", fontSize: 15, fontWeight: "700", letterSpacing: 0 }}>
        {title}
      </Text>
    </View>
  )
}

function ApprovalStrip({
  approvals,
  onOpen,
}: {
  approvals: MobileApproval[]
  onOpen: () => void
}) {
  const firstApproval = approvals[0]
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({
        backgroundColor: "#fff8ec",
        borderColor: "#e9d7b6",
        borderRadius: 16,
        borderWidth: 1,
        gap: 8,
        opacity: pressed ? 0.78 : 1,
        padding: 14,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={{ color: "#8a5a00", flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: 0 }}>
          Pending approval
        </Text>
        <Text selectable style={{ color: "#8a5a00", fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: 0 }}>
          {approvals.length}
        </Text>
      </View>
      <Text selectable numberOfLines={2} style={{ color: "#4d4d49", fontSize: 14, lineHeight: 19 }}>
        {firstApproval?.prompt.title ?? "Approval request"}
      </Text>
    </Pressable>
  )
}

function MobileUtilityRow({
  appVersion,
  onOpenProvider,
  onOpenUpdates,
}: {
  appVersion: string
  onOpenProvider: () => void
  onOpenUpdates: () => void
}) {
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <UtilityTile label="Provider" onPress={onOpenProvider} value="Details" />
      <UtilityTile label="Updates" onPress={onOpenUpdates} value={appVersion} />
    </View>
  )
}

function UtilityTile({
  label,
  onPress,
  value,
}: {
  label: string
  onPress: () => void
  value: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: "#ffffff",
        borderColor: "#e5e3dc",
        borderRadius: 14,
        borderWidth: 1,
        flex: 1,
        gap: 6,
        minHeight: 70,
        opacity: pressed ? 0.78 : 1,
        padding: 12,
      })}
    >
      <Text style={{ color: "#151515", fontSize: 15, fontWeight: "800", letterSpacing: 0 }}>{label}</Text>
      <Text selectable numberOfLines={1} style={{ color: "#676760", fontSize: 12, fontVariant: ["tabular-nums"], letterSpacing: 0 }}>
        {value}
      </Text>
    </Pressable>
  )
}

function SectionHeader({ caption, title }: { caption?: string; title: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
      <Text style={{ color: "#151515", fontSize: 17, fontWeight: "800", letterSpacing: 0 }}>{title}</Text>
      {caption ? (
        <Text selectable style={{ color: "#676760", fontSize: 13, fontVariant: ["tabular-nums"], letterSpacing: 0 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  )
}

function ProviderStatusCard({
  detail,
  label,
  tone,
  onPress,
}: {
  detail: string
  label: string
  tone: "neutral" | "success" | "danger"
  onPress: () => void
}) {
  const color = tone === "success" ? "#155c34" : tone === "danger" ? "#8f1f1f" : "#4d4d49"

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: "#ffffff",
        borderColor: "#e5e3dc",
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <View
          style={{
            backgroundColor: color,
            borderRadius: 4,
            height: 8,
            width: 8,
          }}
        />
        <Text style={{ color: "#151515", flex: 1, fontSize: 16, fontWeight: "800", letterSpacing: 0 }}>AnyboxProvider</Text>
        <Text selectable style={{ color, fontSize: 13, fontWeight: "700", letterSpacing: 0 }}>
          {label}
        </Text>
      </View>
      <Text selectable numberOfLines={1} style={{ color: "#676760", fontSize: 13, letterSpacing: 0, lineHeight: 18 }}>
        {detail}
      </Text>
    </Pressable>
  )
}

function ConnectionSetupSection({
  accountDesktops,
  accountDesktopsLoading,
  accountDesktopError,
  connectingDesktopID,
  endpoint,
  error,
  manualOpen,
  onConnectDesktop,
  onEndpointChange,
  onManualToggle,
  onRefreshDesktopList,
  onReviewConnection,
  onScan,
  onTokenChange,
  token,
}: {
  accountDesktops: MobileAccountRelayDesktop[]
  accountDesktopsLoading: boolean
  accountDesktopError: string | null
  connectingDesktopID: string | null
  endpoint: string
  error: string | null
  manualOpen: boolean
  onConnectDesktop: (desktop: MobileAccountRelayDesktop) => Promise<void>
  onEndpointChange: (value: string) => void
  onManualToggle: () => void
  onRefreshDesktopList: () => void
  onReviewConnection: () => void
  onScan: () => void
  onTokenChange: (value: string) => void
  token: string
}) {
  return (
    <Section title="Connect Desktop" caption={accountDesktopsLoading ? "Searching" : `${accountDesktops.length}`}>
      {accountDesktopsLoading ? <StateCard title="Finding desktop devices" /> : null}
      {accountDesktopError ? <StateCard title="Desktop discovery failed" detail={accountDesktopError} tone="danger" /> : null}
      {!accountDesktopsLoading && !accountDesktopError && !accountDesktops.length ? (
        <StateCard title="No desktop devices" detail="Sign in on the desktop app and keep it running." />
      ) : null}
      {accountDesktops.map((desktop) => (
        <ListRow
          key={desktop.id}
          title={desktop.appVersion ? `${desktop.name} ${desktop.appVersion}` : desktop.name}
          subtitle={desktop.online ? "Available through AnyboxProvider relay" : `Last seen ${formatRelativeTime(desktop.lastSeenAt)}`}
          meta={connectingDesktopID === desktop.id ? "Connecting" : desktop.online ? "Online" : "Offline"}
          onPress={desktop.online && connectingDesktopID !== desktop.id ? () => void onConnectDesktop(desktop) : undefined}
        />
      ))}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Refresh" loading={accountDesktopsLoading} onPress={onRefreshDesktopList} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Scan QR" onPress={onScan} />
        </View>
      </View>
      <Button label={manualOpen ? "Hide advanced" : "Advanced URL login"} onPress={onManualToggle} variant="secondary" />
      {manualOpen ? (
        <>
          <Field label="Bridge URL" onChangeText={onEndpointChange} placeholder="https://anybox.com.cn/?code=..." value={endpoint} />
          <Field label="Token" onChangeText={onTokenChange} placeholder="Optional if URL includes token or code" secureTextEntry value={token} />
          <Button disabled={!endpoint.trim()} label="Review connection" onPress={onReviewConnection} />
        </>
      ) : null}
      {error ? <StateCard title="Connection failed" detail={error} tone="danger" /> : null}
    </Section>
  )
}

function MessagePreview({ message }: { message: MobileMessage }) {
  const isUser = messageRole(message) === "user"

  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        backgroundColor: isUser ? "#151515" : "#f1f1ed",
        borderRadius: 16,
        maxWidth: "88%",
        paddingHorizontal: 13,
        paddingVertical: 10,
      }}
    >
      <Text selectable style={{ color: isUser ? "#ffffff" : "#151515", fontSize: 15, letterSpacing: 0, lineHeight: 21 }}>
        {messageText(message)}
      </Text>
    </View>
  )
}

function ComposerBar({
  disabled,
  draft,
  maxWidth,
  onChangeText,
  onSend,
  paddingBottom,
  placeholder,
  sending,
}: {
  disabled: boolean
  draft: string
  maxWidth?: number
  onChangeText: (value: string) => void
  onSend: () => void
  paddingBottom: number
  placeholder: string
  sending: boolean
}) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: "#f7f7f4",
        borderTopColor: "#e5e3dc",
        borderTopWidth: 1,
        paddingBottom,
        paddingHorizontal: 16,
        paddingTop: 10,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, maxWidth, width: "100%" }}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8b8b84"
          spellCheck={false}
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#deded8",
            borderRadius: 8,
            borderWidth: 1,
            color: "#151515",
            flex: 1,
            fontSize: 16,
            maxHeight: 112,
            minHeight: 46,
            paddingHorizontal: 14,
            paddingVertical: 10,
            textAlignVertical: "top",
          }}
          value={draft}
        />
        <View style={{ width: 92 }}>
          <Button disabled={disabled} label="Send" loading={sending} onPress={onSend} />
        </View>
      </View>
    </View>
  )
}

function formatProviderStatus({
  accountDesktopsLoading,
  connectingDesktopID,
  connection,
  onlineDesktops,
  status,
}: {
  accountDesktopsLoading: boolean
  connectingDesktopID: string | null
  connection: ReturnType<typeof useConnection>["connection"]
  onlineDesktops: MobileAccountRelayDesktop[]
  status: MobileStatus | null
}) {
  if (connection) {
    const name = status?.desktopName?.trim() || "Desktop"
    if (status?.online) {
      return {
        label: "Connected",
        detail: status.appVersion ? `${name} ${status.appVersion}` : name,
        tone: "success" as const,
      }
    }
    return {
      label: "Checking",
      detail: connection.transport === "relay" ? "Relay connection is saved." : connection.baseUrl,
      tone: "neutral" as const,
    }
  }

  if (connectingDesktopID) {
    return {
      label: "Connecting",
      detail: "Preparing the AnyboxProvider bridge.",
      tone: "neutral" as const,
    }
  }

  if (accountDesktopsLoading) {
    return {
      label: "Searching",
      detail: "Looking for desktop devices signed in to this account.",
      tone: "neutral" as const,
    }
  }

  if (onlineDesktops.length) {
    return {
      label: "Available",
      detail: onlineDesktops.length === 1 ? `${onlineDesktops[0].name} is online.` : `${onlineDesktops.length} desktops are online.`,
      tone: "neutral" as const,
    }
  }

  return {
    label: "Offline",
    detail: "Start Anybox on the desktop to connect.",
    tone: "danger" as const,
  }
}

function sortSessions(sessions: MobileSessionSummary[]) {
  return [...sessions].sort((left, right) => right.updated - left.updated)
}

function buildSessionTitle(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() || "Mobile chat"
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine
}
