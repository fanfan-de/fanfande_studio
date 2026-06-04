import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Text, View } from "react-native"
import { Button } from "@/components/button"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import {
  checkAppUpdates,
  downloadOtaUpdateAndReload,
  formatAppVersionLabel,
  getCurrentAppInfo,
  openBinaryRelease,
  type AppUpdateCheckResult,
} from "@/services/app-updates"

type UpdatePhase = "idle" | "checking" | "downloading"

export default function UpdatesScreen() {
  const [phase, setPhase] = useState<UpdatePhase>("idle")
  const [result, setResult] = useState<AppUpdateCheckResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = useMemo(() => result?.current ?? getCurrentAppInfo(), [result?.current])
  const release = result?.binary.release ?? null

  const runCheck = useCallback(async () => {
    setPhase("checking")
    setError(null)
    try {
      setResult(await checkAppUpdates())
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : "Unable to check updates.")
    } finally {
      setPhase("idle")
    }
  }, [])

  useEffect(() => {
    void runCheck()
  }, [runCheck])

  const runOtaUpdate = useCallback(async () => {
    setPhase("downloading")
    setError(null)
    try {
      await downloadOtaUpdateAndReload()
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download update.")
      setPhase("idle")
    }
  }, [])

  const confirmOtaUpdate = useCallback(() => {
    Alert.alert("Download and restart?", "The update will be downloaded, then Anybox Mobile will restart.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Restart",
        onPress: () => void runOtaUpdate(),
      },
    ])
  }, [runOtaUpdate])

  const openRelease = useCallback(async () => {
    if (!release) return
    setError(null)
    try {
      await openBinaryRelease(release)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open the update link.")
    }
  }, [release])

  return (
    <Screen>
      <Section title="Installed" caption={formatAppVersionLabel(current)}>
        <ListRow title="Native build" meta={current.buildVersion ?? "Unknown"} subtitle={current.platform} />
        <ListRow
          title="OTA runtime"
          meta={current.updatesEnabled ? "Enabled" : "Disabled"}
          subtitle={current.runtimeVersion ?? "Runtime unavailable"}
        />
        <ListRow title="Update channel" meta={current.channel ?? "None"} subtitle={current.updateId ?? "Embedded bundle"} />
      </Section>

      <Section title="Status">
        {result?.binary.required && release ? (
          <StateCard
            title="App update required"
            detail={`Install ${release.version}${release.buildVersion ? ` (${release.buildVersion})` : ""} to continue receiving compatible updates.`}
            tone="danger"
          />
        ) : result?.binary.available && release ? (
          <StateCard
            title="App update available"
            detail={`Version ${release.version}${release.buildVersion ? ` (${release.buildVersion})` : ""} is ready.`}
            tone="success"
          />
        ) : result?.ota.available ? (
          <StateCard title="OTA update available" detail="Download and restart to apply the latest JavaScript bundle." tone="success" />
        ) : (
          <StateCard
            title={phase === "checking" ? "Checking updates" : "Anybox Mobile is current"}
            detail={result ? `Last checked ${new Date(result.checkedAt).toLocaleString()}` : undefined}
            tone="neutral"
          />
        )}
        {result?.ota.error ? <StateCard title="OTA check failed" detail={result.ota.error} tone="danger" /> : null}
        {result?.binary.error ? <StateCard title="App update check failed" detail={result.binary.error} tone="danger" /> : null}
        {error ? <StateCard title="Update failed" detail={error} tone="danger" /> : null}
      </Section>

      {release?.releaseNotes.length ? (
        <Section title="Release notes">
          {release.releaseNotes.map((note, index) => (
            <Text key={`${index}-${note}`} selectable style={{ color: "#4d4d49", fontSize: 14, lineHeight: 20 }}>
              {note}
            </Text>
          ))}
        </Section>
      ) : null}

      <Section title="Actions">
        <Button label="Check again" loading={phase === "checking"} onPress={runCheck} variant="secondary" />
        {result?.ota.available ? (
          <Button label="Download and restart" loading={phase === "downloading"} onPress={confirmOtaUpdate} />
        ) : null}
        {release ? <Button label="Open app update" onPress={() => void openRelease()} variant={result?.binary.required ? "danger" : "primary"} /> : null}
      </Section>

      <Section title="Sources">
        <ListRow
          title="APK manifest"
          meta={current.releaseManifestUrl ? "Configured" : "Not set"}
          subtitle={current.releaseManifestUrl ?? "Set EXPO_PUBLIC_ANYBOX_MOBILE_RELEASE_URL for native app updates."}
        />
        <ListRow
          title="EAS Update"
          meta={current.updatesEnabled ? "Ready" : "Unavailable"}
          subtitle={current.updatesEnabled ? "Use eas update with the current channel." : "Build with EXPO_PUBLIC_EAS_PROJECT_ID or EXPO_UPDATES_URL."}
        />
      </Section>

      <View style={{ height: 1 }} />
    </Screen>
  )
}
