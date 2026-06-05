import React from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { ListRow } from "@/components/list-row"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import type { MobileAccountRelayDesktop } from "@/api/account-api"
import { formatRelativeTime } from "@/utils/format"
import { darkToneColor } from "./shared"
import type { ProviderStatusTone } from "./types"

export function ConnectionHomePage({
  accountDesktops,
  accountDesktopsLoading,
  accountDesktopError,
  appVersion,
  connectingDesktopID,
  endpoint,
  error,
  manualOpen,
  maxWidth,
  onConnectDesktop,
  onEndpointChange,
  onManualToggle,
  onOpenDiagnostics,
  onOpenProvider,
  onOpenUpdates,
  onRefreshDesktopList,
  onReviewConnection,
  onScan,
  onTokenChange,
  paddingBottom,
  paddingTop,
  providerDetail,
  providerLabel,
  providerTone,
  token,
}: {
  accountDesktops: MobileAccountRelayDesktop[]
  accountDesktopsLoading: boolean
  accountDesktopError: string | null
  appVersion: string
  connectingDesktopID: string | null
  endpoint: string
  error: string | null
  manualOpen: boolean
  maxWidth?: number
  onConnectDesktop: (desktop: MobileAccountRelayDesktop) => Promise<void>
  onEndpointChange: (value: string) => void
  onManualToggle: () => void
  onOpenDiagnostics: () => void
  onOpenProvider: () => void
  onOpenUpdates: () => void
  onRefreshDesktopList: () => void
  onReviewConnection: () => void
  onScan: () => void
  onTokenChange: (value: string) => void
  paddingBottom: number
  paddingTop: number
  providerDetail: string
  providerLabel: string
  providerTone: ProviderStatusTone
  token: string
}) {
  return (
    <View style={{ flex: 1, backgroundColor: "#171717" }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: "center",
          gap: 14,
          paddingBottom,
          paddingHorizontal: 16,
          paddingTop,
        }}
      >
        <View style={{ maxWidth, width: "100%", gap: 14 }}>
          <ConnectionSetupSection
            accountDesktops={accountDesktops}
            accountDesktopsLoading={accountDesktopsLoading}
            accountDesktopError={accountDesktopError}
            connectingDesktopID={connectingDesktopID}
            endpoint={endpoint}
            error={error}
            manualOpen={manualOpen}
            onConnectDesktop={onConnectDesktop}
            onEndpointChange={onEndpointChange}
            onManualToggle={onManualToggle}
            onRefreshDesktopList={onRefreshDesktopList}
            onReviewConnection={onReviewConnection}
            onScan={onScan}
            onTokenChange={onTokenChange}
            token={token}
          />
          <ConnectionSecondaryLinks
            appVersion={appVersion}
            providerDetail={providerDetail}
            providerLabel={providerLabel}
            providerTone={providerTone}
            onOpenDiagnostics={onOpenDiagnostics}
            onOpenProvider={onOpenProvider}
            onOpenUpdates={onOpenUpdates}
          />
        </View>
      </ScrollView>
    </View>
  )
}

function ConnectionSecondaryLinks({
  appVersion,
  providerDetail,
  providerLabel,
  providerTone,
  onOpenDiagnostics,
  onOpenProvider,
  onOpenUpdates,
}: {
  appVersion: string
  providerDetail: string
  providerLabel: string
  providerTone: ProviderStatusTone
  onOpenDiagnostics: () => void
  onOpenProvider: () => void
  onOpenUpdates: () => void
}) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingTop: 2 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, width: "100%" }}>
        <View style={{ backgroundColor: darkToneColor(providerTone), borderRadius: 4, height: 8, width: 8 }} />
        <Text numberOfLines={1} style={{ color: "#9a9a9a", flex: 1, fontSize: 12 }}>
          {providerDetail}
        </Text>
        <Text style={{ color: darkToneColor(providerTone), fontSize: 12, fontWeight: "800" }}>{providerLabel}</Text>
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "center", minHeight: 30 }}>
        <SecondaryLink label="Provider" onPress={onOpenProvider} />
        <SecondaryDivider />
        <SecondaryLink label={`Updates ${appVersion}`} onPress={onOpenUpdates} />
        <SecondaryDivider />
        <SecondaryLink label="Diagnostics" onPress={onOpenDiagnostics} />
      </View>
    </View>
  )
}

function SecondaryDivider() {
  return <Text style={{ color: "#5f5f5f", fontSize: 12 }}> / </Text>
}

function SecondaryLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, padding: 5 })}
    >
      <Text numberOfLines={1} style={{ color: "#c8c8c8", fontSize: 12, fontWeight: "800" }}>
        {label}
      </Text>
    </Pressable>
  )
}

export function ProviderStatusCard({
  detail,
  label,
  tone,
  onPress,
}: {
  detail: string
  label: string
  tone: ProviderStatusTone
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

export function ConnectionSetupSection({
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
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Scan QR" onPress={onScan} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Refresh" loading={accountDesktopsLoading} onPress={onRefreshDesktopList} variant="secondary" />
        </View>
      </View>
      {accountDesktopsLoading ? <StateCard title="Finding desktop devices" /> : null}
      {accountDesktopError ? <StateCard title="Desktop discovery failed" detail={accountDesktopError} tone="danger" /> : null}
      {!accountDesktopsLoading && !accountDesktopError && !accountDesktops.length ? (
        <StateCard title="No desktop devices" detail="Scan the QR code on the desktop Mobile connection page." />
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
      <Button label={manualOpen ? "Hide bridge URL" : "Use bridge URL"} onPress={onManualToggle} variant="secondary" />
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
