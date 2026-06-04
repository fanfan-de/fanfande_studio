import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useEffect, useMemo, useRef, useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { StateCard } from "@/components/state-card"
import { normalizeConnectionInput, pairDevice, revokeCurrentDevice } from "@/api/mobile-api"
import { useConnection } from "@/state/connection"

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default function ConnectScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ token?: string; url?: string }>()
  const { connection, loading, saveConnection } = useConnection()
  const startedPairingKey = useRef<string | null>(null)
  const [confirmedReplace, setConfirmedReplace] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pairing, setPairing] = useState(true)

  const bridgeUrl = useMemo(() => firstParam(params.url)?.trim() ?? "", [params.url])
  const bridgeToken = useMemo(() => firstParam(params.token)?.trim() ?? "", [params.token])
  const isSameDesktopPairingLink = useMemo(() => {
    if (!connection || !bridgeUrl) return false
    try {
      return normalizeConnectionInput(bridgeUrl, bridgeToken).baseUrl === connection.baseUrl
    } catch {
      return false
    }
  }, [bridgeToken, bridgeUrl, connection])

  useEffect(() => {
    if (loading) return undefined
    if (isSameDesktopPairingLink) {
      router.replace("/")
      return undefined
    }
    if (connection && !confirmedReplace) {
      setPairing(false)
      return undefined
    }
    const pairingKey = `${bridgeUrl}\n${bridgeToken}\n${confirmedReplace ? "replace" : "initial"}`
    if (startedPairingKey.current === pairingKey) return undefined
    startedPairingKey.current = pairingKey

    let cancelled = false
    async function run() {
      if (!bridgeUrl) {
        setError("Connection URL is missing.")
        setPairing(false)
        return
      }

      setPairing(true)
      setError(null)
      try {
        const bootstrapConnection = normalizeConnectionInput(bridgeUrl, bridgeToken)
        const previousConnection = connection
        const result = await pairDevice(bootstrapConnection, "Anybox Android")
        if (cancelled) return
        await saveConnection(bootstrapConnection.baseUrl, result.token, result.device.id)
        if (previousConnection?.deviceID) {
          await revokeCurrentDevice(previousConnection).catch(() => undefined)
        }
        if (!cancelled) router.replace("/")
      } catch (connectError) {
        if (!cancelled) {
          setError(connectError instanceof Error ? connectError.message : "Unable to pair this Android device.")
          setPairing(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [bridgeToken, bridgeUrl, confirmedReplace, connection, isSameDesktopPairingLink, loading, router, saveConnection])

  if (!loading && connection && !confirmedReplace) {
    return (
      <Screen>
        <StateCard
          title="New pairing link received"
          detail={`Current: ${connection.baseUrl}\nNew: ${bridgeUrl || "Missing connection URL"}`}
          tone="neutral"
        />
        {error ? <StateCard title="Pairing failed" detail={error} tone="danger" /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Keep current" onPress={() => router.replace("/")} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button disabled={!bridgeUrl} label="Replace" onPress={() => setConfirmedReplace(true)} />
          </View>
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <StateCard
        title={pairing ? "Pairing Android device" : "Pairing failed"}
        detail={error ?? bridgeUrl}
        tone={error ? "danger" : "neutral"}
      />
      {error ? <Button label="Back to connect" onPress={() => router.replace("/")} variant="secondary" /> : null}
    </Screen>
  )
}
