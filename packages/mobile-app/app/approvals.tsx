import React, { useCallback, useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { Alert, Text, View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { getApprovalHistory, getApprovals, respondApproval, type MobileApproval } from "@/api/mobile-api"
import { useMobileEvents } from "@/hooks/use-mobile-events"
import { useConnection } from "@/state/connection"
import { formatRelativeTime, trimMiddle } from "@/utils/format"

type ApprovalView = "pending" | "history"

export default function ApprovalsScreen() {
  const params = useLocalSearchParams<{ sessionID?: string }>()
  const { connection } = useConnection()
  const sessionID = readParam(params.sessionID)
  const [view, setView] = useState<ApprovalView>("pending")
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [actingID, setActingID] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!connection) return
    if (!options?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const scope = sessionID ? { sessionID } : undefined
      setApprovals(
        view === "pending"
          ? await getApprovals(connection, { ...scope, status: "pending" })
          : await getApprovalHistory(connection, scope),
      )
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load approvals.")
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [connection, sessionID, view])

  useEffect(() => {
    void load()
  }, [load])

  const eventStatus = useMobileEvents({
    connection,
    enabled: Boolean(connection && view === "pending"),
    onEvent: () => void load({ silent: true }),
  })

  const runDecision = useCallback(
    async (approval: MobileApproval, decision: "approve" | "deny") => {
      if (!connection) return
      setActingID(approval.id)
      setError(null)
      try {
        await respondApproval(connection, approval.id, decision, { resume: true })
        await load()
      } catch (decisionError) {
        setError(decisionError instanceof Error ? decisionError.message : "Unable to resolve approval.")
      } finally {
        setActingID(null)
      }
    },
    [connection, load],
  )
  const handleDecision = useCallback(
    (approval: MobileApproval, decision: "approve" | "deny") => {
      const actionLabel = decision === "approve" ? "Allow" : "Deny"
      Alert.alert(`${actionLabel} this request?`, approval.prompt.title, [
        { text: "Cancel", style: "cancel" },
        {
          text: actionLabel,
          style: decision === "deny" ? "destructive" : "default",
          onPress: () => void runDecision(approval, decision),
        },
      ])
    },
    [runDecision],
  )

  if (!connection) {
    return (
      <Screen>
        <StateCard title="No connection" detail="Return to Anybox and connect to the desktop bridge." tone="danger" />
      </Screen>
    )
  }

  return (
    <Screen>
      <Section
        title={sessionID ? "Session approvals" : "Pending"}
        caption={eventStatus === "connected" ? `${approvals.length} live` : `${approvals.length}`}
      >
        {error ? <StateCard title="Approval action failed" detail={error} tone="danger" /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button disabled={view === "pending"} label="Pending" onPress={() => setView("pending")} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button disabled={view === "history"} label="History" onPress={() => setView("history")} variant="secondary" />
          </View>
        </View>
        <Button label="Refresh" loading={loading} onPress={load} variant="secondary" />
      </Section>

      <Section title={view === "pending" ? "Requests" : sessionID ? "Session history" : "History"}>
        {approvals.length ? (
          approvals.map((approval) => (
            <ApprovalCard
              approval={approval}
              acting={actingID === approval.id}
              key={approval.id}
              onApprove={view === "pending" ? () => void handleDecision(approval, "approve") : undefined}
              onDeny={view === "pending" ? () => void handleDecision(approval, "deny") : undefined}
            />
          ))
        ) : (
          <StateCard title={loading ? "Loading approvals" : view === "pending" ? "No pending approvals" : "No approval history"} />
        )}
      </Section>
    </Screen>
  )
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function ApprovalCard({
  approval,
  acting,
  onApprove,
  onDeny,
}: {
  approval: MobileApproval
  acting: boolean
  onApprove?: () => void
  onDeny?: () => void
}) {
  const details = approval.prompt.details
  const isPending = approval.status === "pending"

  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: riskColor(approval.prompt.risk),
        borderRadius: 8,
        borderWidth: 1,
        gap: 12,
        padding: 14,
      }}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
          <Text selectable style={{ color: "#151515", flex: 1, fontSize: 16, fontWeight: "800" }}>
            {approval.prompt.title}
          </Text>
          <Text selectable style={{ color: riskColor(approval.prompt.risk), fontSize: 12, fontWeight: "800" }}>
            {isPending ? approval.prompt.risk : approval.status}
          </Text>
        </View>
        <Text selectable style={{ color: "#4d4d49", fontSize: 14, lineHeight: 20 }}>
          {approval.prompt.summary}
        </Text>
        <Text selectable style={{ color: "#676760", fontSize: 13, lineHeight: 18 }}>
          {approval.prompt.rationale}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        {details?.command ? <Detail label="Command" value={details.command} /> : null}
        {details?.workdir ? <Detail label="Workdir" value={trimMiddle(details.workdir, 72)} /> : null}
        {details?.paths?.length ? <Detail label="Paths" value={details.paths.map((item) => trimMiddle(item, 64)).join("\n")} /> : null}
        {details?.body ? <Detail label="Body" value={details.body} /> : null}
        <Detail label="Requested" value={formatRelativeTime(approval.createdAt)} />
        {approval.resolution ? <Detail label="Resolved" value={`${approval.resolution.decision} ${formatRelativeTime(approval.resolution.resolvedAt)}`} /> : null}
      </View>

      {onApprove && onDeny ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button disabled={acting} label="Deny" loading={acting} onPress={onDeny} variant="danger" />
          </View>
          <View style={{ flex: 1 }}>
            <Button disabled={acting} label="Allow" loading={acting} onPress={onApprove} />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: "#676760", fontSize: 11, fontWeight: "800" }}>{label}</Text>
      <Text selectable style={{ color: "#151515", fontFamily: "monospace", fontSize: 12, lineHeight: 17 }}>
        {value}
      </Text>
    </View>
  )
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
