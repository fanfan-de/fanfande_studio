import Feather from "@expo/vector-icons/Feather"
import { Stack, useRouter } from "expo-router"
import { StatusBar } from "expo-status-bar"
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Image, Pressable, ScrollView, Share, Text, useWindowDimensions, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { getApprovals, getStatus, isRelayConnection, type MobileStatus } from "@/api/mobile-api"
import { formatAppVersionLabel, getCurrentAppInfo } from "@/services/app-updates"
import { useAccount } from "@/state/account"
import { useConnection } from "@/state/connection"
import { useFocus } from "@/state/focus"
import {
  describeAccountApiError,
  formatAccountPlanLabel,
  formatDeviceLimit,
  formatEntitlementFlag,
  formatSubscriptionStatus,
} from "@/utils/account-entitlements"
import { trimMiddle } from "@/utils/format"

type FeatherName = React.ComponentProps<typeof Feather>["name"]

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { account, clearAccount, loading: accountLoading, refreshAccount } = useAccount()
  const { connection, loading: connectionLoading } = useConnection()
  const focus = useFocus()
  const [status, setStatus] = useState<MobileStatus | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [accountRefreshError, setAccountRefreshError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const refreshedAccountKeyRef = useRef<string | null>(null)
  const appInfo = useMemo(() => getCurrentAppInfo(), [])
  const appVersion = formatAppVersionLabel(appInfo)
  const maxWidth = width >= 760 ? 430 : undefined

  const loadConnectionOverview = useCallback(async () => {
    if (!connection) {
      setStatus(null)
      setPendingApprovals(0)
      setStatusError(null)
      return
    }
    setStatusLoading(true)
    setStatusError(null)
    try {
      const [nextStatus, nextApprovals] = await Promise.all([
        getStatus(connection),
        getApprovals(connection, { status: "pending" }).catch(() => []),
      ])
      setStatus(nextStatus)
      setPendingApprovals(nextApprovals.length)
    } catch (loadError) {
      setStatus(null)
      setStatusError(loadError instanceof Error ? loadError.message : "Unable to check desktop connection.")
    } finally {
      setStatusLoading(false)
    }
  }, [connection])

  useEffect(() => {
    void loadConnectionOverview()
  }, [loadConnectionOverview])

  useEffect(() => {
    if (!account) {
      refreshedAccountKeyRef.current = null
      return
    }
    const refreshKey = `${account.baseUrl}:${account.user.id}`
    if (refreshedAccountKeyRef.current === refreshKey) return
    refreshedAccountKeyRef.current = refreshKey
    let cancelled = false
    refreshAccount()
      .then(() => {
        if (!cancelled) setAccountRefreshError(null)
      })
      .catch((refreshError) => {
        if (!cancelled) setAccountRefreshError(describeAccountApiError(refreshError, "Unable to refresh account."))
      })
    return () => {
      cancelled = true
    }
  }, [account?.baseUrl, account?.user.id, refreshAccount])

  const displayName = account?.user.displayName?.trim() || account?.user.name?.trim() || account?.user.username?.trim() || account?.user.email?.split("@")[0] || "Anybox User"
  const avatarLabel = (displayName.trim()[0] || account?.user.email?.trim()[0] || "A").toLocaleUpperCase()
  const avatarUrl = account?.user.avatarUrl?.trim()
  const planLabel = formatAccountPlanLabel(account)
  const subscriptionLabel = formatSubscriptionStatus(account)
  const relayLabel = formatEntitlementFlag(account?.entitlements?.relayEnabled)
  const modelGatewayLabel = formatEntitlementFlag(account?.entitlements?.modelGatewayEnabled)
  const deviceLimitLabel = account?.entitlements
    ? `${formatDeviceLimit(account.entitlements.maxDesktopDevices)} / ${formatDeviceLimit(account.entitlements.maxMobileDevices)}`
    : "Unknown"
  const accountLabel = accountLoading ? "Loading" : account ? account.user.email : "Sign in"
  const workspaceLabel = account?.workspace?.name ?? "No workspace"
  const connectionState = connectionLoading
    ? "Loading"
    : status?.online
      ? "Connected"
      : connection
        ? statusLoading
          ? "Checking"
          : "Needs attention"
        : "Offline"
  const connectionTone = status?.online ? "#74d58b" : connection ? "#f5c86b" : "#8a8a8a"
  const desktopName = status?.desktopName?.trim() || "Anybox Desktop"
  const desktopVersion = status?.appVersion ? ` ${status.appVersion}` : ""
  const desktopDetail = connection
    ? `${desktopName}${desktopVersion}`
    : "Connect a desktop"
  const providerHost = hostFromUrl(account?.baseUrl ?? connection?.baseUrl)
  const focusLabel = focus.workspaceID || focus.sessionID ? "Saved" : "None"

  function confirmClearFocus() {
    if (!focus.workspaceID && !focus.sessionID) return
    Alert.alert("Clear saved focus?", "Anybox Mobile will forget the selected project and conversation on this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          void focus.clearFocus()
        },
      },
    ])
  }

  function showLanguageInfo() {
    Alert.alert("语言", "当前版本仅支持简体中文。")
  }

  function showAppearanceInfo() {
    Alert.alert("外观", "当前深色界面会继续跟随 Anybox 移动端设计，后续再接完整主题。")
  }

  function confirmSignOut() {
    if (!account || signingOut) return
    Alert.alert("退出登录？", "这会移除此手机上的 Anybox Provider 登录状态。", [
      { text: "取消", style: "cancel" },
      {
        text: "退出登录",
        style: "destructive",
        onPress: () => {
          void runSignOut()
        },
      },
    ])
  }

  async function runSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await clearAccount()
      router.replace("/account" as never)
    } catch (signOutError) {
      Alert.alert("退出登录失败", signOutError instanceof Error ? signOutError.message : "无法退出登录。")
    } finally {
      setSigningOut(false)
    }
  }

  async function shareAnybox() {
    try {
      await Share.share({
        message: `Anybox${account?.baseUrl ? ` ${account.baseUrl}` : ""}`,
      })
    } catch (shareError) {
      Alert.alert("Share failed", shareError instanceof Error ? shareError.message : "Unable to open sharing.")
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: "#191919", flex: 1 }}
        contentContainerStyle={{
          alignItems: "center",
          paddingBottom: Math.max(insets.bottom, 18) + 14,
          paddingHorizontal: 20,
          paddingTop: insets.top + 10,
        }}
      >
        <View style={{ gap: 18, width: "100%", maxWidth }}>
          <View style={{ alignItems: "center", flexDirection: "row", minHeight: 38 }}>
            <HeaderIconButton icon="chevron-left" label="Back" onPress={() => router.back()} />
            <Text numberOfLines={1} style={{ color: "#f2f2f2", flex: 1, fontSize: 24, fontWeight: "900", textAlign: "center" }}>
              Anybox
            </Text>
            <View>
              <HeaderIconButton icon="bell" label="Approvals" onPress={() => router.push("/approvals" as never)} />
              {pendingApprovals ? <View style={{ backgroundColor: "#ff5a64", borderRadius: 5, height: 10, position: "absolute", right: 6, top: 5, width: 10 }} /> : null}
            </View>
          </View>

          <View style={{ alignItems: "center", gap: 8 }}>
            <View style={{ alignItems: "center", backgroundColor: "#7e55d6", borderRadius: 39, height: 78, justifyContent: "center", width: 78 }}>
              {avatarUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: avatarUrl }}
                  style={{ borderRadius: 39, height: 78, width: 78 }}
                />
              ) : (
                <Text style={{ color: "#ffffff", fontSize: 36, fontWeight: "800" }}>{avatarLabel}</Text>
              )}
              <View
                style={{
                  alignItems: "center",
                  backgroundColor: "#5b5b5b",
                  borderColor: "#191919",
                  borderRadius: 12,
                  borderWidth: 2,
                  bottom: 2,
                  height: 24,
                  justifyContent: "center",
                  position: "absolute",
                  right: 1,
                  width: 24,
                }}
              >
                <Feather color="#ffffff" name="star" size={12} />
              </View>
            </View>
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text numberOfLines={1} style={{ color: "#eeeeee", fontSize: 22, fontWeight: "800", textAlign: "center" }}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={{ color: "#8f8f8f", fontSize: 14, fontWeight: "700", textAlign: "center" }}>
                {planLabel}
              </Text>
            </View>
          </View>

          <SettingsCard>
            <View style={{ alignItems: "center", flexDirection: "row", gap: 12, minHeight: 48, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text numberOfLines={1} style={{ color: "#f2f2f2", flex: 1, fontSize: 22, fontWeight: "900" }}>
                Anybox
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/account" as never)}
                style={({ pressed }) => ({
                  backgroundColor: "#f2f2f2",
                  borderRadius: 8,
                  opacity: pressed ? 0.78 : 1,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                })}
              >
                <Text style={{ color: "#151515", fontSize: 14, fontWeight: "800" }}>Manage</Text>
              </Pressable>
            </View>
            <SettingsRow
              icon="activity"
              title="Desktop Connection"
              value={connectionState}
              valueColor={connectionTone}
              onPress={() => router.push("/provider" as never)}
            />
            <SettingsRow icon="cpu" title="Desktop Agent" value={desktopDetail} onPress={() => router.push("/provider" as never)} />
          </SettingsCard>

          {statusError ? <InlineNotice title="Connection check failed" detail={statusError} /> : null}
          {accountRefreshError ? <InlineNotice title="Account sync failed" detail={accountRefreshError} /> : null}

          <SettingsCard>
            <SettingsRow icon="share-2" title="Share Anybox" onPress={() => void shareAnybox()} />
          </SettingsCard>

          <SettingsCard>
            <SettingsRow icon="globe" title="语言" value="简体中文" onPress={showLanguageInfo} />
            <SettingsRow icon="moon" title="外观" value="跟随系统" onPress={showAppearanceInfo} />
            <SettingsRow icon="package" title="版本" value={appVersion} onPress={() => router.push("/updates" as never)} />
          </SettingsCard>

          <SettingsCard>
            <SettingsRow icon="user" title="Account" value={accountLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="briefcase" title="Workspace" value={workspaceLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="star" title="Plan" value={planLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="clock" title="Subscription" value={subscriptionLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="activity" title="Relay" value={relayLabel} onPress={() => router.push("/provider" as never)} />
            <SettingsRow icon="zap" title="Model Gateway" value={modelGatewayLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="monitor" title="Device Limits" value={deviceLimitLabel} onPress={() => router.push("/account" as never)} />
            <SettingsRow icon="monitor" title="Provider Details" value={providerHost} onPress={() => router.push("/provider" as never)} />
            <SettingsRow icon="bell" title="Approvals" value={pendingApprovals ? `${pendingApprovals}` : "None"} onPress={() => router.push("/approvals" as never)} />
          </SettingsCard>

          <SettingsCard>
            <SettingsRow icon="folder" title="Projects and Sessions" onPress={() => router.replace("/" as never)} />
            <SettingsRow icon="camera" title="Scan QR Code" onPress={() => router.push("/scan" as never)} />
            <SettingsRow icon="download-cloud" title="Updates" value={appInfo.channel ?? "Embedded"} onPress={() => router.push("/updates" as never)} />
            <SettingsRow icon="database" title="Saved Focus" value={focusLabel} disabled={!focus.workspaceID && !focus.sessionID} onPress={confirmClearFocus} />
          </SettingsCard>

          <SettingsCard>
            <SettingsRow icon="server" title="Transport" value={isRelayConnection(connection) ? "Relay" : connection ? "Local" : "None"} onPress={() => router.push("/provider" as never)} />
            <SettingsRow icon="globe" title="Endpoint" value={connection ? trimMiddle(connection.baseUrl, 34) : "Not connected"} onPress={() => router.push("/provider" as never)} />
          </SettingsCard>

          {account ? <SignOutButton loading={signingOut} onPress={confirmSignOut} /> : null}
        </View>
      </ScrollView>
    </>
  )
}

function HeaderIconButton({ icon, label, onPress }: { icon: FeatherName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        height: 38,
        justifyContent: "center",
        opacity: pressed ? 0.62 : 1,
        width: 38,
      })}
    >
      <Feather color="#f2f2f2" name={icon} size={24} />
    </Pressable>
  )
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: "#292929",
        borderColor: "#333333",
        borderRadius: 8,
        borderWidth: 1,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  )
}

function SettingsRow({
  disabled,
  icon,
  title,
  value,
  valueColor = "#8f8f8f",
  onPress,
}: {
  disabled?: boolean
  icon: FeatherName
  title: string
  value?: string
  valueColor?: string
  onPress?: () => void
}) {
  const interactive = Boolean(onPress) && !disabled
  return (
    <Pressable
      accessibilityLabel={interactive ? title : undefined}
      accessibilityRole={interactive ? "button" : undefined}
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        gap: 12,
        minHeight: 60,
        opacity: disabled ? 0.48 : pressed ? 0.72 : 1,
        paddingHorizontal: 20,
      })}
    >
      <Feather color="#e4e4e4" name={icon} size={22} />
      <View
        style={{
          alignItems: "center",
          borderBottomColor: "#383838",
          borderBottomWidth: 1,
          flex: 1,
          flexDirection: "row",
          gap: 10,
          minHeight: 60,
        }}
      >
        <Text numberOfLines={1} style={{ color: "#eeeeee", flex: 1, fontSize: 18, fontWeight: "700" }}>
          {title}
        </Text>
        {value ? (
          <Text numberOfLines={1} style={{ color: valueColor, flexShrink: 1, fontSize: 16, fontVariant: ["tabular-nums"], fontWeight: "700", maxWidth: "50%" }}>
            {value}
          </Text>
        ) : null}
        {interactive ? <Feather color="#7f7f7f" name="chevron-right" size={22} /> : null}
      </View>
    </Pressable>
  )
}

function SignOutButton({ loading, onPress }: { loading: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="退出登录"
      accessibilityRole="button"
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: "#292929",
        borderColor: "#333333",
        borderRadius: 8,
        borderWidth: 1,
        flexDirection: "row",
        gap: 12,
        minHeight: 60,
        opacity: loading ? 0.52 : pressed ? 0.72 : 1,
        paddingHorizontal: 20,
      })}
    >
      <Feather color="#eeeeee" name="log-out" size={22} />
      <Text numberOfLines={1} style={{ color: "#eeeeee", flex: 1, fontSize: 18, fontWeight: "700" }}>
        {loading ? "正在退出登录" : "退出登录"}
      </Text>
    </Pressable>
  )
}

function InlineNotice({ detail, title }: { detail: string; title: string }) {
  return (
    <View style={{ backgroundColor: "#332323", borderColor: "#4a3030", borderRadius: 8, borderWidth: 1, gap: 6, padding: 14 }}>
      <Text style={{ color: "#ffb7b7", fontSize: 15, fontWeight: "800" }}>{title}</Text>
      <Text style={{ color: "#d9c6c6", fontSize: 13, lineHeight: 18 }}>{detail}</Text>
    </View>
  )
}

function hostFromUrl(value?: string) {
  if (!value) return "Not configured"
  try {
    return new URL(value).host
  } catch {
    return trimMiddle(value, 34)
  }
}
