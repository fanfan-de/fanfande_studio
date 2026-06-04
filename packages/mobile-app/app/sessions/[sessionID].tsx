import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Text, TextInput, View } from "react-native"
import { Button } from "@/components/button"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import {
  cancelSession,
  getApprovals,
  getMessages,
  getSessionTasks,
  resumeSession,
  respondApproval,
  type MobileApproval,
  sendPrompt,
  type MobileMessage,
  type MobileSessionTaskListView,
  type MobileSessionTaskSummary,
} from "@/api/mobile-api"
import { useConnection } from "@/state/connection"
import { useSessionEvents } from "@/hooks/use-session-events"
import { formatRelativeTime } from "@/utils/format"
import { messageRole, messageText } from "@/utils/message"

export default function SessionScreen() {
  const params = useLocalSearchParams<{ sessionID?: string; title?: string }>()
  const router = useRouter()
  const { connection } = useConnection()
  const sessionID = readParam(params.sessionID)
  const title = readParam(params.title) || "Chat"
  const [messages, setMessages] = useState<MobileMessage[]>([])
  const [tasks, setTasks] = useState<MobileSessionTaskListView | null>(null)
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [draft, setDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [actingApprovalID, setActingApprovalID] = useState<string | null>(null)
  const [pendingPrompt, setPendingPrompt] = useState<{ id: string; text: string } | null>(null)
  const [streamingAssistant, setStreamingAssistant] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isRunningAction = sending || resuming || Boolean(streamingAssistant)
  const canSend = useMemo(() => Boolean(draft.trim()) && !isRunningAction, [draft, isRunningAction])
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

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!connection || !sessionID) return
    if (!options?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const nextMessages = await getMessages(connection, sessionID)
      setMessages(nextMessages)
      const [nextTasks, nextApprovals] = await Promise.all([
        getSessionTasks(connection, sessionID).catch(() => null),
        getApprovals(connection, { sessionID, status: "pending" }).catch(() => []),
      ])
      setTasks(nextTasks)
      setApprovals(nextApprovals)
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load messages.")
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [connection, sessionID])

  useEffect(() => {
    void load()
  }, [load])

  const scheduleStreamRefresh = useCallback(() => {
    if (streamRefreshTimerRef.current) return
    streamRefreshTimerRef.current = setTimeout(() => {
      streamRefreshTimerRef.current = null
      void load({ silent: true })
    }, 650)
  }, [load])

  useEffect(() => {
    return () => {
      if (streamRefreshTimerRef.current) {
        clearTimeout(streamRefreshTimerRef.current)
        streamRefreshTimerRef.current = null
      }
    }
  }, [])

  const eventStatus = useSessionEvents({
    connection,
    enabled: Boolean(connection && sessionID),
    onRuntimeEvent: () => void load({ silent: true }),
    sessionID,
  })

  useEffect(() => {
    if (!isRunningAction && eventStatus === "connected") return undefined
    const interval = setInterval(() => {
      void load({ silent: true })
    }, eventStatus === "connected" ? 10_000 : 2500)
    return () => clearInterval(interval)
  }, [eventStatus, isRunningAction, load])

  const handleSend = useCallback(async () => {
    if (!connection || !sessionID || !draft.trim()) return
    const text = draft.trim()
    setSending(true)
    setDraft("")
    setPendingPrompt({ id: `local-${Date.now()}`, text })
    const streamID = `stream-${Date.now()}`
    setStreamingAssistant({ id: streamID, text: "" })
    setError(null)
    try {
      await sendPrompt(connection, sessionID, text, {
        onEvent: scheduleStreamRefresh,
        onOpen: () => {
          setSending(false)
          scheduleStreamRefresh()
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
      await load({ silent: true })
    } catch (sendError) {
      setPendingPrompt(null)
      setStreamingAssistant(null)
      setDraft(text)
      setError(sendError instanceof Error ? sendError.message : "Unable to send prompt.")
    } finally {
      setSending(false)
    }
  }, [connection, draft, load, sessionID])

  const handleResume = useCallback(async () => {
    if (!connection || !sessionID) return
    setResuming(true)
    const streamID = `stream-${Date.now()}`
    setStreamingAssistant({ id: streamID, text: "" })
    setError(null)
    try {
      await resumeSession(connection, sessionID, {
        onEvent: scheduleStreamRefresh,
        onOpen: () => {
          setResuming(false)
          scheduleStreamRefresh()
        },
        onTextDelta: (delta) => {
          setStreamingAssistant((current) => ({
            id: current?.id ?? streamID,
            text: `${current?.text ?? ""}${delta}`,
          }))
        },
      })
      setStreamingAssistant(null)
      await load({ silent: true })
    } catch (resumeError) {
      setStreamingAssistant(null)
      setError(resumeError instanceof Error ? resumeError.message : "Unable to resume chat.")
    } finally {
      setResuming(false)
    }
  }, [connection, load, scheduleStreamRefresh, sessionID])

  const runCancel = useCallback(async () => {
    if (!connection || !sessionID) return
    setCancelling(true)
    setError(null)
    try {
      await cancelSession(connection, sessionID)
      await load()
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Unable to stop chat.")
    } finally {
      setCancelling(false)
    }
  }, [connection, load, sessionID])

  const runApprovalDecision = useCallback(
    async (approval: MobileApproval, decision: "approve" | "deny") => {
      if (!connection) return
      setActingApprovalID(approval.id)
      setError(null)
      try {
        await respondApproval(connection, approval.id, decision, { resume: true })
        await load({ silent: true })
      } catch (decisionError) {
        setError(decisionError instanceof Error ? decisionError.message : "Unable to resolve approval.")
      } finally {
        setActingApprovalID(null)
      }
    },
    [connection, load],
  )
  const handleApprovalDecision = useCallback(
    (approval: MobileApproval, decision: "approve" | "deny") => {
      const actionLabel = decision === "approve" ? "Allow" : "Deny"
      Alert.alert(`${actionLabel} this request?`, approval.prompt.title, [
        { text: "Cancel", style: "cancel" },
        {
          text: actionLabel,
          style: decision === "deny" ? "destructive" : "default",
          onPress: () => void runApprovalDecision(approval, decision),
        },
      ])
    },
    [runApprovalDecision],
  )

  const openSessionApprovals = useCallback(() => {
    if (!sessionID) return
    router.push({
      pathname: "/approvals",
      params: { sessionID },
    })
  }, [router, sessionID])
  const handleCancel = useCallback(() => {
    if (!connection || !sessionID) return
    Alert.alert("Stop this chat?", "The desktop agent will be asked to cancel the current work for this session.", [
      { text: "Keep running", style: "cancel" },
      {
        text: "Stop",
        style: "destructive",
        onPress: () => void runCancel(),
      },
    ])
  }, [connection, runCancel, sessionID])

  if (!connection) {
    return (
      <Screen>
        <StateCard title="No connection" detail="Return to Anybox and connect to the desktop bridge." tone="danger" />
      </Screen>
    )
  }

  return (
    <Screen>
      <Section title={title} caption={`${visibleMessages.length} messages`}>
        <StateCard
          title={eventStatus === "connected" ? "Live updates connected" : eventStatus === "error" ? "Live updates reconnecting" : "Live updates pending"}
          detail={eventStatus === "connected" ? undefined : "Polling remains active while the event stream is unavailable."}
          tone={eventStatus === "error" ? "danger" : "neutral"}
        />
        {isRunningAction ? (
          <StateCard
            title={resuming ? "Chat is resuming" : "Prompt is running"}
            detail="Messages will refresh while the desktop agent works."
          />
        ) : null}
        {error ? <StateCard title="Chat action failed" detail={error} tone="danger" /> : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <View style={{ flex: 1, minWidth: 110 }}>
            <Button label="Refresh" loading={loading} onPress={load} variant="secondary" />
          </View>
          <View style={{ flex: 1, minWidth: 110 }}>
            <Button disabled={isRunningAction} label="Resume" loading={resuming} onPress={handleResume} variant="secondary" />
          </View>
          <View style={{ flex: 1, minWidth: 110 }}>
            <Button label="Stop" loading={cancelling} onPress={handleCancel} variant="danger" />
          </View>
        </View>
      </Section>

      <Section title="Approvals" caption={`${approvals.length} pending`}>
        {approvals.length ? (
          approvals.slice(0, 2).map((approval) => (
            <ApprovalInlineCard
              acting={actingApprovalID === approval.id}
              approval={approval}
              key={approval.id}
              onApprove={() => void handleApprovalDecision(approval, "approve")}
              onDeny={() => void handleApprovalDecision(approval, "deny")}
            />
          ))
        ) : (
          <StateCard title={loading ? "Checking approvals" : "No pending approvals"} />
        )}
        {approvals.length > 2 ? <StateCard title={`+${approvals.length - 2} more approval requests`} /> : null}
        <Button disabled={!approvals.length} label="Open session approvals" onPress={openSessionApprovals} variant="secondary" />
      </Section>

      <Section title="Tasks" caption={tasks ? formatTaskSummary(tasks) : undefined}>
        {tasks && tasks.summary.total > 0 ? (
          <>
            {tasks.current.slice(0, 3).map((task) => (
              <TaskRow key={task.id} task={task} label="Current" />
            ))}
            {tasks.blocked.slice(0, 3).map((task) => (
              <TaskRow key={task.id} task={task} label="Blocked" />
            ))}
            {tasks.current.length === 0 && tasks.blocked.length === 0
              ? tasks.next.slice(0, 3).map((task) => <TaskRow key={task.id} task={task} label="Next" />)
              : null}
          </>
        ) : (
          <StateCard title={loading ? "Loading tasks" : "No active tasks"} />
        )}
      </Section>

      <Section title="Messages">
        {visibleMessages.length ? (
          visibleMessages.map((message, index) => (
            <MessageBubble key={message.info?.id ?? `${index}`} message={message} />
          ))
        ) : (
          <StateCard title={loading ? "Loading messages" : "No messages"} />
        )}
      </Section>

      <Section title="Composer">
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={setDraft}
          placeholder="Send a prompt"
          placeholderTextColor="#8b8b84"
          spellCheck={false}
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#deded8",
            borderRadius: 8,
            borderWidth: 1,
            color: "#151515",
            fontSize: 16,
            minHeight: 120,
            paddingHorizontal: 14,
            paddingVertical: 12,
            textAlignVertical: "top",
          }}
          value={draft}
        />
        <Button disabled={!canSend} label="Send" loading={sending} onPress={handleSend} />
      </Section>
    </Screen>
  )
}

function ApprovalInlineCard({
  acting,
  approval,
  onApprove,
  onDeny,
}: {
  acting: boolean
  approval: MobileApproval
  onApprove: () => void
  onDeny: () => void
}) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: riskColor(approval.prompt.risk),
        borderRadius: 8,
        borderWidth: 1,
        gap: 10,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
        <Text selectable style={{ color: "#151515", flex: 1, fontSize: 15, fontWeight: "800" }}>
          {approval.prompt.title}
        </Text>
        <Text selectable style={{ color: riskColor(approval.prompt.risk), fontSize: 12, fontWeight: "800" }}>
          {approval.prompt.risk}
        </Text>
      </View>
      <Text selectable style={{ color: "#4d4d49", fontSize: 13, lineHeight: 19 }}>
        {approval.prompt.summary}
      </Text>
      {approval.prompt.details?.command ? (
        <Text selectable style={{ color: "#151515", fontFamily: "monospace", fontSize: 12, lineHeight: 17 }}>
          {approval.prompt.details.command}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button disabled={acting} label="Deny" loading={acting} onPress={onDeny} variant="danger" />
        </View>
        <View style={{ flex: 1 }}>
          <Button disabled={acting} label="Allow" loading={acting} onPress={onApprove} />
        </View>
      </View>
    </View>
  )
}

function TaskRow({ task, label }: { task: MobileSessionTaskSummary; label: string }) {
  const blockedText = task.isBlocked ? `Blocked by ${task.blockingTasks.length}` : task.owner

  return (
    <ListRow
      title={task.subject || task.activeForm || "Untitled task"}
      subtitle={task.description || blockedText}
      meta={`${label} · ${formatRelativeTime(task.updatedAt)}`}
    />
  )
}

function MessageBubble({ message }: { message: MobileMessage }) {
  const role = messageRole(message)
  const isUser = role === "user"

  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        backgroundColor: isUser ? "#151515" : "#ffffff",
        borderColor: isUser ? "#151515" : "#e5e3dc",
        borderRadius: 8,
        borderWidth: 1,
        gap: 6,
        maxWidth: "92%",
        padding: 12,
      }}
    >
      <Text selectable style={{ color: isUser ? "#d8d8d2" : "#676760", fontSize: 12, fontWeight: "800" }}>
        {role}
      </Text>
      <Text selectable style={{ color: isUser ? "#ffffff" : "#151515", fontSize: 15, lineHeight: 21 }}>
        {messageText(message)}
      </Text>
    </View>
  )
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function formatTaskSummary(tasks: MobileSessionTaskListView) {
  const { inProgress, pending, blocked } = tasks.summary
  if (blocked > 0) return `${blocked} blocked`
  if (inProgress > 0) return `${inProgress} running`
  if (pending > 0) return `${pending} pending`
  return `${tasks.summary.completed}/${tasks.summary.total} done`
}

function riskColor(risk: MobileApproval["prompt"]["risk"]) {
  switch (risk) {
    case "critical":
      return "#9d1c1f"
    case "high":
      return "#b14600"
    case "medium":
      return "#8a5a00"
    case "low":
      return "#155c34"
  }
}
