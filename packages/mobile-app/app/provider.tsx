import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Text, View } from "react-native"
import { Button } from "@/components/button"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import {
  connectAccountRelayDesktop,
  listAccountRelayDesktops,
  type MobileAccountRelayDesktop,
} from "@/api/account-api"
import {
  getApprovals,
  getStatus,
  getWorkspaces,
  isRelayConnection,
  revokeCurrentDevice,
  type MobileApproval,
  type MobileStatus,
  type MobileWorkspace,
} from "@/api/mobile-api"
import { useAccount } from "@/state/account"
import { useConnection } from "@/state/connection"
import { useFocus } from "@/state/focus"
import {
  buildEntitlementDetail,
  describeAccountApiError,
  formatAccountPlanLabel,
  formatSubscriptionStatus,
  isRelayDisabledByEntitlement,
} from "@/utils/account-entitlements"
import { formatRelativeTime, trimMiddle } from "@/utils/format"
import { getMobileDeviceName } from "@/utils/platform"

export default function ProviderScreen() {
  const router = useRouter()
  const { account, refreshAccount } = useAccount()
  const { connection, clearConnection, saveConnection } = useConnection()
  const focus = useFocus()
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [workspaces, setWorkspaces] = useState<MobileWorkspace[]>([])
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [desktops, setDesktops] = useState<MobileAccountRelayDesktop[]>([])
  const [loading, setLoading] = useState(false)
  const [desktopLoading, setDesktopLoading] = useState(false)
  const [connectingDesktopID, setConnectingDesktopID] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [desktopError, setDesktopError] = useState<string | null>(null)
  const refreshedAccountKeyRef = useRef<string | null>(null)

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
      setError(loadError instanceof Error ? loadError.message : "Unable to load AnyboxProvider.")
    } finally {
      setLoading(false)
    }
  }, [connection])

  const loadDesktops = useCallback(async () => {
    if (!account) {
      setDesktops([])
      setDesktopError(null)
      return
    }
    if (isRelayDisabledByEntitlement(account)) {
      setDesktops([])
      setDesktopError(null)
      return
    }
    setDesktopLoading(true)
    setDesktopError(null)
    try {
      setDesktops(await listAccountRelayDesktops(account))
    } catch (loadError) {
      setDesktopError(describeAccountApiError(loadError, "Unable to load desktop devices."))
    } finally {
      setDesktopLoading(false)
    }
  }, [account])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadDesktops()
  }, [loadDesktops])

  useEffect(() => {
    if (!account) {
      refreshedAccountKeyRef.current = null
      return
    }
    const refreshKey = `${account.baseUrl}:${account.user.id}`
    if (refreshedAccountKeyRef.current === refreshKey) return
    refreshedAccountKeyRef.current = refreshKey
    let cancelled = false
    refreshAccount().catch((refreshError) => {
      if (!cancelled) setDesktopError((current) => current ?? describeAccountApiError(refreshError, "Unable to refresh account."))
    })
    return () => {
      cancelled = true
    }
  }, [account?.baseUrl, account?.user.id, refreshAccount])

  const focusedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === focus.workspaceID) ?? null,
    [focus.workspaceID, workspaces],
  )
  const focusedSession = useMemo(() => {
    if (!focusedWorkspace) return null
    return focusedWorkspace.sessions.find((session) => session.id === focus.sessionID) ?? null
  }, [focus.sessionID, focusedWorkspace])

  const runDisconnect = useCallback(async () => {
    if (!connection) return
    setDisconnecting(true)
    setError(null)
    try {
      if (connection.deviceID) {
        await revokeCurrentDevice(connection)
      }
      await clearConnection()
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Unable to change connection.")
    } finally {
      setDisconnecting(false)
    }
  }, [clearConnection, connection])

  const handleDisconnect = useCallback(() => {
    if (!connection) return
    Alert.alert("Change connection?", "This revokes the current paired mobile device token.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Change",
        style: "destructive",
        onPress: () => void runDisconnect(),
      },
    ])
  }, [connection, runDisconnect])

  const connectDesktop = useCallback(async (desktop: MobileAccountRelayDesktop) => {
    if (!account || !desktop.online) return
    setConnectingDesktopID(desktop.id)
    setDesktopError(null)
    setError(null)
    try {
      const previousConnection = connection
      const result = await connectAccountRelayDesktop(account, desktop.id, getMobileDeviceName())
      await saveConnection(account.baseUrl, result.token, result.device.id, {
        transport: "relay",
        desktopID: result.desktop?.id ?? result.desktopID ?? desktop.id,
      })
      if (previousConnection?.deviceID) {
        await revokeCurrentDevice(previousConnection).catch(() => undefined)
      }
    } catch (connectError) {
      setDesktopError(describeAccountApiError(connectError, "Unable to connect this desktop."))
    } finally {
      setConnectingDesktopID(null)
    }
  }, [account, connection, saveConnection])

  const connectionState = status?.online ? "Connected" : connection ? "Checking" : "Not connected"
  const relayDisabled = isRelayDisabledByEntitlement(account)
  const desktopName = status?.desktopName?.trim() || currentDesktopName(connection?.desktopID, desktops) || "Desktop"
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
      <Section title="Connection" caption={connectionState}>
        <StateCard
          title={connectionState}
          detail={connection ? `${desktopName}${status?.appVersion ? ` ${status.appVersion}` : ""}` : "Connect a desktop to use project and chat focus."}
          tone={status?.online ? "success" : connection ? "neutral" : "danger"}
        />
        {error ? <StateCard title="Provider refresh failed" detail={error} tone="danger" /> : null}
        <ListRow title="Transport" meta={connection?.transport === "relay" ? "Relay" : connection ? "Local" : "None"} />
        <ListRow title="Endpoint" subtitle={connection ? trimMiddle(connection.baseUrl, 76) : "Not connected"} />
        {connection?.desktopID ? <ListRow title="Desktop ID" subtitle={trimMiddle(connection.desktopID, 76)} /> : null}
        {connection?.deviceID ? <ListRow title="Mobile Device ID" subtitle={trimMiddle(connection.deviceID, 76)} /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Refresh" loading={loading} onPress={() => void load()} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button disabled={!connection} label="Change" loading={disconnecting} onPress={handleDisconnect} variant="secondary" />
          </View>
        </View>
      </Section>

      <Section title="Provider">
        <ListRow title="Provider URL" subtitle={account?.baseUrl ?? connection?.baseUrl ?? "Unknown"} />
        <ListRow title="Version" meta={status?.appVersion ?? "Unknown"} />
        <ListRow title="Capabilities" meta={status?.capabilities?.length ? `${status.capabilities.length}` : "Unknown"} />
        {status?.capabilities?.length ? (
          <StateCard title="Capability list" detail={status.capabilities.join("\n")} />
        ) : null}
      </Section>

      <Section title="Account">
        <ListRow title="Email" subtitle={account?.user.email ?? "Not signed in"} />
        <ListRow title="Workspace" subtitle={account?.workspace?.name ?? "Unknown"} />
        <ListRow title="Plan" meta={formatAccountPlanLabel(account)} />
        <ListRow title="Subscription" meta={formatSubscriptionStatus(account)} />
        <StateCard title="Workspace entitlements" detail={buildEntitlementDetail(account)} tone={relayDisabled ? "danger" : "neutral"} />
        <Button label="Manage account" onPress={() => router.push("/account" as never)} variant="secondary" />
      </Section>

      <Section title="Current Context">
        <ListRow title="Project" subtitle={focusedWorkspace?.name ?? "No project selected"} />
        <ListRow title="Conversation" subtitle={focusedSession?.title ?? "No conversation selected"} />
        <ListRow title="Pending approvals" meta={`${approvals.length}`} onPress={approvals.length ? () => router.push("/approvals") : undefined} />
      </Section>

      <Section title="Desktop Devices" caption={desktopLoading ? "Loading" : `${desktops.length}`}>
        {relayDisabled ? <StateCard title="Relay unavailable" detail="当前套餐不支持 Relay。请在管理后台启用 Relay 权益后重试。" tone="danger" /> : null}
        {desktopError ? <StateCard title="Desktop list failed" detail={desktopError} tone="danger" /> : null}
        {!relayDisabled && desktops.length ? (
          desktops.map((desktop) => {
            const isCurrentDesktop = desktop.id === connection?.desktopID
            const currentConnectionIsOnline = isCurrentDesktop && status?.online === true
            const canConnectDesktop = desktop.online && connectingDesktopID !== desktop.id && (!isCurrentDesktop || !currentConnectionIsOnline)
            return (
              <ListRow
                key={desktop.id}
                title={desktop.appVersion ? `${desktop.name} ${desktop.appVersion}` : desktop.name}
                subtitle={desktop.online ? "Online" : `Last seen ${formatRelativeTime(desktop.lastSeenAt)}`}
                meta={
                  connectingDesktopID === desktop.id
                    ? "Connecting"
                    : isCurrentDesktop
                      ? currentConnectionIsOnline
                        ? "Current"
                        : desktop.online
                          ? "Reconnect"
                          : "Current"
                      : desktop.online
                        ? "Switch"
                        : "Offline"
                }
                onPress={canConnectDesktop ? () => void connectDesktop(desktop) : undefined}
              />
            )
          })
        ) : !relayDisabled ? (
          <StateCard title={desktopLoading ? "Loading desktop devices" : "No desktop devices"} />
        ) : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Refresh" loading={desktopLoading} onPress={() => void loadDesktops()} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Scan QR" onPress={() => router.push("/scan" as never)} />
          </View>
        </View>
      </Section>

      <Section title="Diagnostics">
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

function currentDesktopName(desktopID: string | undefined, desktops: MobileAccountRelayDesktop[]) {
  if (!desktopID) return null
  return desktops.find((desktop) => desktop.id === desktopID)?.name ?? null
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
