import React, { useCallback, useEffect, useState } from "react"
import { useLocalSearchParams } from "expo-router"
import { Alert, View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { getApprovalHistory, getApprovals, respondApproval, type MobileApproval } from "@/api/mobile-api"
import { ApprovalCard } from "@/home/approval-card"
import { useMobileEvents } from "@/hooks/use-mobile-events"
import { useConnection } from "@/state/connection"

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
