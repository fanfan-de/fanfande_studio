import { useRouter } from "expo-router"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Linking, Text, View } from "react-native"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import {
  getApprovals,
  getStatus,
  getWorkspaces,
  normalizeConnectionInput,
  readBridgeUrlFromConnectDeepLink,
  revokeCurrentDevice,
  type MobileApproval,
  type MobileStatus,
  type MobileWorkspace,
} from "@/api/mobile-api"
import { useMobileEvents } from "@/hooks/use-mobile-events"
import { formatAppVersionLabel, getCurrentAppInfo } from "@/services/app-updates"
import { useConnection } from "@/state/connection"
import { encodeRouteParam, formatRelativeTime, trimMiddle } from "@/utils/format"

const handledIncomingLinks = new Set<string>()

export default function HomeScreen() {
  const router = useRouter()
  const { connection, loading, clearConnection } = useConnection()
  const [endpoint, setEndpoint] = useState("")
  const [token, setToken] = useState("")
  const [manualOpen, setManualOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [workspaces, setWorkspaces] = useState<MobileWorkspace[]>([])
  const [approvals, setApprovals] = useState<MobileApproval[]>([])
  const [error, setError] = useState<string | null>(null)
  const currentApp = useMemo(() => getCurrentAppInfo(), [])

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!connection) return
    if (!options?.silent) {
      setRefreshing(true)
      setError(null)
    }
    try {
      const [nextStatus, nextWorkspaces, nextApprovals] = await Promise.all([
        getStatus(connection),
        getWorkspaces(connection),
        getApprovals(connection),
      ])
      setStatus(nextStatus)
      setWorkspaces(nextWorkspaces)
      setApprovals(nextApprovals)
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load mobile bridge.")
      }
    } finally {
      if (!options?.silent) setRefreshing(false)
    }
  }, [connection])

  useEffect(() => {
    void load()
  }, [load])

  const eventStatus = useMobileEvents({
    connection,
    enabled: Boolean(connection),
    onEvent: () => void load({ silent: true }),
  })

  const recentSessions = useMemo(
    () =>
      workspaces
        .flatMap((workspace) =>
          workspace.sessions.map((session) => ({
            ...session,
            workspaceName: workspace.name,
          })),
        )
        .sort((left, right) => right.updated - left.updated)
        .slice(0, 12),
    [workspaces],
  )
  const desktopLabel = useMemo(() => {
    const name = status?.desktopName?.trim() || "Desktop bridge"
    return status?.appVersion ? `${name} ${status.appVersion}` : name
  }, [status?.appVersion, status?.desktopName])
  const capabilityLabel = useMemo(() => {
    const count = status?.capabilities?.length ?? 0
    if (!count) return "Capabilities unknown"
    return count === 1 ? "1 capability" : `${count} capabilities`
  }, [status?.capabilities])

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

  const handleSave = useCallback(async () => {
    openConnectionConfirmation(endpoint, token)
  }, [endpoint, openConnectionConfirmation, token])

  const handleIncomingLink = useCallback(
    (url: string) => {
      if (handledIncomingLinks.has(url)) return
      handledIncomingLinks.add(url)
      const bridgeUrl = readBridgeUrlFromConnectDeepLink(url)
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
    if (loading) return undefined
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
  }, [handleIncomingLink, loading])

  const runChangeConnection = useCallback(async () => {
    if (!connection) return
    setDisconnecting(true)
    setError(null)
    try {
      if (connection.deviceID) {
        await revokeCurrentDevice(connection)
      }
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Unable to revoke device token.")
    } finally {
      await clearConnection()
      setDisconnecting(false)
    }
  }, [clearConnection, connection])
  const handleChangeConnection = useCallback(() => {
    if (!connection) return
    Alert.alert("Change connection?", "This revokes the current paired device token and returns to setup.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Change",
        style: "destructive",
        onPress: () => void runChangeConnection(),
      },
    ])
  }, [connection, runChangeConnection])

  if (loading) {
    return (
      <Screen>
        <StateCard title="Loading connection" />
      </Screen>
    )
  }

  if (!connection) {
    return (
      <Screen>
        <Section title="Connect">
          <Button label="Scan QR code" onPress={() => router.push("/scan" as never)} />
          <Button
            label={manualOpen ? "Hide advanced" : "Advanced URL login"}
            onPress={() => setManualOpen((current) => !current)}
            variant="secondary"
          />
          {manualOpen ? (
            <>
              <Field
                label="Bridge URL"
                onChangeText={setEndpoint}
                placeholder="http://192.168.1.20:4896/?code=..."
                value={endpoint}
              />
              <Field
                label="Token"
                onChangeText={setToken}
                placeholder="Optional if URL includes token or code"
                secureTextEntry
                value={token}
              />
              <Button disabled={!endpoint.trim()} label="Review connection" onPress={handleSave} />
            </>
          ) : null}
          {error ? <StateCard title="Connection failed" detail={error} tone="danger" /> : null}
        </Section>

        <Section title="Updates" caption={formatAppVersionLabel(currentApp)}>
          <ListRow title="Check for updates" meta="Open" onPress={() => router.push("/updates" as never)} />
        </Section>
      </Screen>
    )
  }

  return (
    <Screen>
      <Section title="Desktop" caption={status?.online ? (eventStatus === "connected" ? "Live" : "Online") : "Unknown"}>
        <StateCard
          title={status?.online ? desktopLabel : "Bridge not confirmed"}
          detail={`${connection.baseUrl}${connection.deviceID ? " - paired device" : ""} - ${capabilityLabel}`}
          tone={status?.online ? "success" : "neutral"}
        />
        {error ? <StateCard title="Refresh failed" detail={error} tone="danger" /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Refresh" loading={refreshing} onPress={load} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Change" loading={disconnecting} onPress={() => void handleChangeConnection()} variant="secondary" />
          </View>
        </View>
      </Section>

      <Section title="Updates" caption={formatAppVersionLabel(currentApp)}>
        <ListRow title="Check for updates" meta="Open" onPress={() => router.push("/updates" as never)} />
      </Section>

      <Section title="Workspaces" caption={`${workspaces.length}`}>
        {workspaces.length ? (
          workspaces.map((workspace) => (
            <ListRow
              key={workspace.id}
              title={workspace.name}
              subtitle={trimMiddle(workspace.directory)}
              meta={`${workspace.sessions.length} chats`}
              onPress={() =>
                router.push({
                  pathname: "/workspaces/[workspaceID]",
                  params: { workspaceID: encodeRouteParam(workspace.id) },
                })
              }
            />
          ))
        ) : (
          <StateCard title="No workspaces" detail="The current bridge only returns workspaces with existing chats." />
        )}
      </Section>

      <Section title="Approvals" caption={`${approvals.length}`}>
        {approvals.length ? (
          approvals.slice(0, 3).map((approval) => (
            <ListRow
              key={approval.id}
              title={approval.prompt.title}
              subtitle={approval.prompt.summary}
              meta={approval.prompt.risk}
              onPress={() => router.push("/approvals")}
            />
          ))
        ) : (
          <StateCard title="No pending approvals" />
        )}
        <Button label="Open approvals" onPress={() => router.push("/approvals")} variant="secondary" />
      </Section>

      <Section title="Recent" caption={`${recentSessions.length}`}>
        {recentSessions.length ? (
          recentSessions.map((session) => (
            <ListRow
              key={session.id}
              title={session.title}
              subtitle={session.workspaceName}
              meta={formatRelativeTime(session.updated)}
              onPress={() =>
                router.push({
                  pathname: "/sessions/[sessionID]",
                  params: { sessionID: session.id, title: session.title },
                })
              }
            />
          ))
        ) : (
          <Text selectable style={{ color: "#676760", fontSize: 14 }}>
            No recent chats
          </Text>
        )}
      </Section>
    </Screen>
  )
}
