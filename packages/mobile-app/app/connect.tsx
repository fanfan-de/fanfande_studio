import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { StateCard } from "@/components/state-card"
import {
  normalizeConnectionInput,
  pairDevice,
  previewPairing,
  revokeCurrentDevice,
  type MobilePairPreview,
  type NormalizedConnectionInput,
} from "@/api/mobile-api"
import { useConnection } from "@/state/connection"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function formatPairingExpiry(preview: MobilePairPreview | null) {
  if (!preview?.pairing.expiresAt) return null
  const remaining = Math.max(0, preview.pairing.expiresAt - preview.pairing.serverTime)
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return remaining > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : "expired"
}

function formatPreviewDetail(candidate: NormalizedConnectionInput | null, preview: MobilePairPreview | null) {
  if (!candidate) return undefined
  if (!preview) return `Legacy token access\n${candidate.baseUrl}`

  const desktop = preview.desktopName?.trim() || "Anybox desktop"
  const version = preview.appVersion ? ` ${preview.appVersion}` : ""
  const capabilityCount = preview.capabilities?.length ?? 0
  const expires = formatPairingExpiry(preview)
  return [
    `${desktop}${version}`,
    candidate.baseUrl,
    capabilityCount === 1 ? "1 capability" : `${capabilityCount} capabilities`,
    expires ? `QR expires in ${expires}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export default function ConnectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string; url?: string }>()
  const { connection, loading, saveConnection } = useConnection()
  const [candidate, setCandidate] = useState<NormalizedConnectionInput | null>(null)
  const [preview, setPreview] = useState<MobilePairPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [pairing, setPairing] = useState(false)

  const bridgeUrl = useMemo(() => firstParam(params.url)?.trim() ?? "", [params.url])
  const bridgeToken = useMemo(() => firstParam(params.token)?.trim() ?? "", [params.token])

  useEffect(() => {
    if (loading) return undefined
    let cancelled = false

    async function loadPreview() {
      setLoadingPreview(true)
      setError(null)
      setPreview(null)
      try {
        if (!bridgeUrl) throw new Error("Connection URL is missing.")
        const nextCandidate = normalizeConnectionInput(bridgeUrl, bridgeToken)
        if (connection && nextCandidate.baseUrl === connection.baseUrl) {
          router.replace("/")
          return
        }
        if (cancelled) return
        setCandidate(nextCandidate)

        if (!nextCandidate.pairingCode) {
          return
        }

        const nextPreview = await previewPairing(nextCandidate)
        if (cancelled) return
        setPreview(nextPreview)
        if (!nextPreview.pairing.valid) {
          setError("This pairing QR code is expired or already used. Refresh the QR code on the desktop.")
        }
      } catch (previewError) {
        if (!cancelled) {
          setCandidate(null)
          setError(previewError instanceof Error ? previewError.message : "Unable to read this pairing link.")
        }
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [bridgeToken, bridgeUrl, connection, loading, router])

  async function runPairing() {
    if (!candidate || error) return
    setPairing(true)
    setError(null)
    try {
      const previousConnection = connection
      const result = await pairDevice(candidate, "Anybox Android")
      await saveConnection(candidate.baseUrl, result.token, result.device.id)
      if (previousConnection?.deviceID) {
        await revokeCurrentDevice(previousConnection).catch(() => undefined)
      }
      router.replace("/")
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Unable to pair this Android device.")
    } finally {
      setPairing(false)
    }
  }

  if (loading || loadingPreview) {
    return (
      <Screen>
        <StateCard title="Reviewing connection" detail={bridgeUrl} />
      </Screen>
    )
  }

  const detail = formatPreviewDetail(candidate, preview)
  const canPair = Boolean(candidate && !error)
  const title = error ? "Connection failed" : preview ? "Confirm desktop connection" : "Confirm legacy connection"

  return (
    <Screen>
      <StateCard
        title={title}
        detail={error ?? detail}
        tone={error ? "danger" : "neutral"}
      />
      {connection && candidate ? (
        <StateCard
          title="Replacing current desktop"
          detail={`Current: ${connection.baseUrl}\nNew: ${candidate.baseUrl}`}
          tone="neutral"
        />
      ) : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" onPress={() => router.replace("/")} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <Button disabled={!canPair} label="Confirm connection" loading={pairing} onPress={() => void runPairing()} />
        </View>
      </View>
    </Screen>
  )
}
