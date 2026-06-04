import { useRouter } from "expo-router"
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera"
import React, { useState } from "react"
import { Text, View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { normalizeConnectionInput, readBridgeUrlFromConnectDeepLink } from "@/api/mobile-api"

function readPairingBridgeUrl(value: string) {
  const bridgeUrl = readBridgeUrlFromConnectDeepLink(value) ?? value.trim()
  if (!bridgeUrl) return null

  try {
    const normalized = normalizeConnectionInput(bridgeUrl, "")
    return normalized.pairingCode ? bridgeUrl : null
  } catch {
    return null
  }
}

export default function ScanScreen() {
  const router = useRouter()
  const [permission, requestPermission] = useCameraPermissions()
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (paused) return
    setPaused(true)
    const bridgeUrl = readPairingBridgeUrl(result.data)
    if (!bridgeUrl) {
      setError("This is not an Anybox pairing QR code.")
      return
    }
    router.replace(`/connect?url=${encodeURIComponent(bridgeUrl)}` as never)
  }

  if (!permission) {
    return (
      <Screen>
        <StateCard title="Checking camera access" />
      </Screen>
    )
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Section title="Scan QR code">
          <StateCard title="Camera access is required" detail="Anybox Mobile uses the camera only to scan desktop pairing QR codes." />
          <Button label="Grant camera access" onPress={() => void requestPermission()} />
          <Button label="Back" onPress={() => router.replace("/")} variant="secondary" />
        </Section>
      </Screen>
    )
  }

  return (
    <Screen>
      <Section title="Scan QR code">
        <View
          style={{
            backgroundColor: "#151515",
            borderRadius: 8,
            height: 420,
            overflow: "hidden",
          }}
        >
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={paused ? undefined : handleBarcodeScanned}
            style={{ flex: 1 }}
          />
          <View
            pointerEvents="none"
            style={{
              borderColor: "rgba(255, 255, 255, 0.82)",
              borderRadius: 8,
              borderWidth: 2,
              height: 220,
              left: "50%",
              marginLeft: -110,
              marginTop: -110,
              position: "absolute",
              top: "50%",
              width: 220,
            }}
          />
        </View>
        <Text selectable style={{ color: "#676760", fontSize: 13, lineHeight: 18 }}>
          Scan the QR code on the desktop Mobile connection page.
        </Text>
        {error ? (
          <>
            <StateCard title="QR code not accepted" detail={error} tone="danger" />
            <Button
              label="Scan again"
              onPress={() => {
                setError(null)
                setPaused(false)
              }}
              variant="secondary"
            />
          </>
        ) : null}
      </Section>
    </Screen>
  )
}
