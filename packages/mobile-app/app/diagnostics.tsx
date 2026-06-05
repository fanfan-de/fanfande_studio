import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Text } from "react-native"
import { Section } from "@/components/section"
import { Screen } from "@/components/screen"
import { StateCard } from "@/components/state-card"
import {
  getApprovals,
  getStatus,
  getWorkspaces,
  isRelayConnection,
  type MobileApproval,
  type MobileStatus,
  type MobileWorkspace,
} from "@/api/mobile-api"
import { useAccount } from "@/state/account"
import { useConnection } from "@/state/connection"
import { useFocus } from "@/state/focus"
import { trimMiddle } from "@/utils/format"

export default function DiagnosticsScreen() {
  const { account } = useAccount()
  const { connection } = useConnection()
  const focus = useFocus()
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [workspaces, setWorkspaces] = useState<MobileWorkspace[]>([])
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!connection) {
        setStatus(null)
        setWorkspaces([])
        setApprovals([])
        return
      }
      const [nextStatus, nextWorkspaces, nextApprovals] = await Promise.all([
        getStatus(connection),
        getWorkspaces(connection).catch(() => []),
        getApprovals(connection, { status: "pending" }).catch(() => []),
      ])
      setStatus(nextStatus)
      setWorkspaces(nextWorkspaces)
      setApprovals(nextApprovals)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load diagnostics.")
    } finally {
      setLoading(false)
    }
  }, [connection])

  useEffect(() => {
    void load()
  }, [load])

  const focusedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === focus.workspaceID) ?? null,
    [focus.workspaceID, workspaces],
  )
  const focusedSession = useMemo(() => {
    if (!focusedWorkspace) return null
    return focusedWorkspace.sessions.find((session) => session.id === focus.sessionID) ?? null
  }, [focus.sessionID, focusedWorkspace])

  const diagnostics = buildDiagnostics({
    accountEmail: account?.user.email,
    accountWorkspace: account?.workspace?.name,
    approvalCount: approvals.length,
    connection,
    focusedSessionTitle: focusedSession?.title,
    focusedWorkspaceName: focusedWorkspace?.name,
    status,
  })

  return (
    <Screen>
      <Section title="Diagnostics" caption={loading ? "Loading" : status?.online ? "Connected" : connection ? "Checking" : "Offline"}>
        {error ? <StateCard title="Diagnostics failed" detail={error} tone="danger" /> : null}
        <Text
          selectable
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#e5e3dc",
            borderRadius: 8,
            borderWidth: 1,
            color: "#4d4d49",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 18,
            padding: 14,
          }}
        >
          {diagnostics}
        </Text>
      </Section>
    </Screen>
  )
}

function buildDiagnostics({
  accountEmail,
  accountWorkspace,
  approvalCount,
  connection,
  focusedSessionTitle,
  focusedWorkspaceName,
  status,
}: {
  accountEmail?: string
  accountWorkspace?: string
  approvalCount: number
  connection: ReturnType<typeof useConnection>["connection"]
  focusedSessionTitle?: string
  focusedWorkspaceName?: string
  status: MobileStatus | null
}) {
  return [
    `status=${status?.online ? "connected" : connection ? "checking" : "not_connected"}`,
    `transport=${connection?.transport === "relay" ? "relay" : connection ? "local" : "none"}`,
    `relay=${isRelayConnection(connection) ? "yes" : "no"}`,
    `desktop=${status?.desktopName ?? "unknown"}`,
    `version=${status?.appVersion ?? "unknown"}`,
    `endpoint=${connection ? trimMiddle(connection.baseUrl, 96) : "none"}`,
    `desktop_id=${connection?.desktopID ? trimMiddle(connection.desktopID, 96) : "none"}`,
    `device_id=${connection?.deviceID ? trimMiddle(connection.deviceID, 96) : "none"}`,
    `account=${accountEmail ?? "none"}`,
    `workspace=${accountWorkspace ?? "unknown"}`,
    `focus_project=${focusedWorkspaceName ?? "none"}`,
    `focus_chat=${focusedSessionTitle ?? "none"}`,
    `pending_approvals=${approvalCount}`,
    `capabilities=${status?.capabilities?.length ?? 0}`,
  ].join("\n")
}
