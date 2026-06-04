import { useLocalSearchParams } from "expo-router"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Image, Text, View } from "react-native"
import { Button } from "@/components/button"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { getWorkspaceFileContent, type MobileWorkspaceFileDocument } from "@/api/mobile-api"
import { useConnection } from "@/state/connection"
import { decodeRouteParam, trimMiddle } from "@/utils/format"

export default function WorkspaceFileScreen() {
  const params = useLocalSearchParams<{ workspaceID?: string; path?: string }>()
  const { connection } = useConnection()
  const workspaceID = useMemo(() => decodeRouteParam(readParam(params.workspaceID)), [params.workspaceID])
  const filePath = useMemo(() => decodeRouteParam(readParam(params.path)), [params.path])
  const [document, setDocument] = useState<MobileWorkspaceFileDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!connection || !workspaceID || !filePath) return
    setLoading(true)
    setError(null)
    try {
      setDocument(await getWorkspaceFileContent(connection, workspaceID, filePath))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load file.")
    } finally {
      setLoading(false)
    }
  }, [connection, filePath, workspaceID])

  useEffect(() => {
    void load()
  }, [load])

  if (!connection) {
    return (
      <Screen>
        <StateCard title="No connection" detail="Return to Anybox and connect to the desktop bridge." tone="danger" />
      </Screen>
    )
  }

  return (
    <Screen>
      <Section title={document?.name ?? "File"} caption={trimMiddle(filePath, 72)}>
        {error ? <StateCard title="File load failed" detail={error} tone="danger" /> : null}
        <Button label="Refresh" loading={loading} onPress={load} variant="secondary" />
      </Section>

      <Section title="Preview">
        {document ? <FilePreview document={document} /> : <StateCard title={loading ? "Loading file" : "No file selected"} />}
      </Section>
    </Screen>
  )
}

function FilePreview({ document }: { document: MobileWorkspaceFileDocument }) {
  if (document.kind === "unsupported") {
    return <StateCard title="Unsupported file" detail={document.unsupportedReason} />
  }

  if (document.kind === "image") {
    return (
      <View style={{ backgroundColor: "#ffffff", borderColor: "#e5e3dc", borderRadius: 8, borderWidth: 1, padding: 10 }}>
        <Image source={{ uri: document.previewUrl }} resizeMode="contain" style={{ width: "100%", height: 360 }} />
      </View>
    )
  }

  return (
    <View
      style={{
        backgroundColor: "#151515",
        borderRadius: 8,
        padding: 12,
      }}
    >
      <Text selectable style={{ color: "#f7f7f4", fontFamily: "monospace", fontSize: 12, lineHeight: 18 }}>
        {document.content}
      </Text>
    </View>
  )
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}
