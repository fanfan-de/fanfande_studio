import { useLocalSearchParams, useRouter } from "expo-router"
import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Text, View } from "react-native"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { ListRow } from "@/components/list-row"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import {
  createSession,
  getWorkspaceDiff,
  getWorkspaceFiles,
  getWorkspaces,
  searchWorkspaceFiles,
  type MobileWorkspace,
  type MobileWorkspaceDiffSummary,
  type MobileWorkspaceFileEntry,
  type MobileWorkspaceFileSearchResult,
} from "@/api/mobile-api"
import { useMobileEvents } from "@/hooks/use-mobile-events"
import { useConnection } from "@/state/connection"
import { decodeRouteParam, encodeRouteParam, formatRelativeTime, trimMiddle } from "@/utils/format"

export default function WorkspaceScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ workspaceID?: string }>()
  const { connection } = useConnection()
  const workspaceID = useMemo(() => decodeRouteParam(readParam(params.workspaceID)), [params.workspaceID])
  const [workspace, setWorkspace] = useState<MobileWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filePath, setFilePath] = useState("")
  const [fileSearch, setFileSearch] = useState("")
  const [fileEntries, setFileEntries] = useState<MobileWorkspaceFileEntry[]>([])
  const [fileResults, setFileResults] = useState<MobileWorkspaceFileSearchResult[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [diff, setDiff] = useState<MobileWorkspaceDiffSummary | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!connection) return
    if (!options?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const workspaces = await getWorkspaces(connection)
      setWorkspace(workspaces.find((item) => item.id === workspaceID) ?? null)
    } catch (loadError) {
      if (!options?.silent) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load workspace.")
      }
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [connection, workspaceID])

  useEffect(() => {
    void load()
  }, [load])

  const loadFiles = useCallback(async () => {
    if (!connection || !workspaceID) return
    const query = fileSearch.trim()
    setFilesLoading(true)
    setFilesError(null)
    try {
      if (query) {
        setFileResults(await searchWorkspaceFiles(connection, workspaceID, query))
        setFileEntries([])
      } else {
        setFileEntries(await getWorkspaceFiles(connection, workspaceID, filePath))
        setFileResults([])
      }
    } catch (loadError) {
      setFilesError(loadError instanceof Error ? loadError.message : "Unable to load files.")
    } finally {
      setFilesLoading(false)
    }
  }, [connection, filePath, fileSearch, workspaceID])

  useEffect(() => {
    void loadFiles()
  }, [loadFiles])

  const loadDiff = useCallback(async () => {
    if (!connection || !workspaceID) return
    setDiffLoading(true)
    setDiffError(null)
    try {
      setDiff(await getWorkspaceDiff(connection, workspaceID))
    } catch (loadError) {
      setDiffError(loadError instanceof Error ? loadError.message : "Unable to load changes.")
    } finally {
      setDiffLoading(false)
    }
  }, [connection, workspaceID])

  useEffect(() => {
    void loadDiff()
  }, [loadDiff])

  const eventStatus = useMobileEvents({
    connection,
    enabled: Boolean(connection),
    onEvent: () => {
      void load({ silent: true })
      void loadDiff()
    },
  })

  const handleCreate = useCallback(async () => {
    if (!connection || !workspace) return
    setCreating(true)
    setError(null)
    try {
      const session = await createSession(connection, workspace.id, {
        title: "Mobile chat",
      })
      router.push({
        pathname: "/sessions/[sessionID]",
        params: { sessionID: session.id, title: session.title },
      })
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create chat.")
    } finally {
      setCreating(false)
    }
  }, [connection, router, workspace])

  const openFile = useCallback(
    (path: string) => {
      router.push({
        pathname: "/workspaces/[workspaceID]/file",
        params: { workspaceID: encodeRouteParam(workspaceID), path },
      })
    },
    [router, workspaceID],
  )

  const parentFilePath = useMemo(() => {
    const parts = filePath.split("/").filter(Boolean)
    parts.pop()
    return parts.join("/")
  }, [filePath])

  if (!connection) {
    return (
      <Screen>
        <StateCard title="No connection" detail="Return to Anybox and connect to the desktop bridge." tone="danger" />
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen>
        <StateCard title="Loading workspace" />
      </Screen>
    )
  }

  if (!workspace) {
    return (
      <Screen>
        <StateCard title="Workspace not found" detail={workspaceID} tone="danger" />
        {error ? <StateCard title="Load failed" detail={error} tone="danger" /> : null}
      </Screen>
    )
  }

  return (
    <Screen>
      <Section title={workspace.name} caption={eventStatus === "connected" ? `${workspace.sessions.length} chats live` : `${workspace.sessions.length} chats`}>
        <StateCard title={workspace.exists ? "Available" : "Missing"} detail={trimMiddle(workspace.directory, 80)} />
        {error ? <StateCard title="Workspace action failed" detail={error} tone="danger" /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="New chat" loading={creating} onPress={handleCreate} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Refresh" onPress={load} variant="secondary" />
          </View>
        </View>
      </Section>

      <Section title="Chats">
        {workspace.sessions.length ? (
          workspace.sessions.map((session) => (
            <ListRow
              key={session.id}
              title={session.title}
              subtitle={session.workflow?.status || session.kind || "chat"}
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
          <StateCard title="No chats" />
        )}
      </Section>

      <Section title="Changes" caption={diff?.stats ? `${diff.stats.files} files` : undefined}>
        {diffError ? <StateCard title="Changes unavailable" detail={diffError} tone="danger" /> : null}
        {diff ? (
          <>
            <StateCard title={diff.title || "Workspace changes"} detail={diff.body} />
            {diff.diffs.slice(0, 6).map((item) => (
              <ListRow
                key={item.file}
                title={item.file}
                subtitle={item.gitState ?? "changed"}
                meta={`+${item.additions} -${item.deletions}`}
              />
            ))}
            {diff.diffs.length > 6 ? <StateCard title={`+${diff.diffs.length - 6} more files`} /> : null}
          </>
        ) : (
          <StateCard title={diffLoading ? "Loading changes" : "No git changes"} detail="This workspace may not be a git repository." />
        )}
        <Button label="Refresh changes" loading={diffLoading} onPress={loadDiff} variant="secondary" />
      </Section>

      <Section title="Files" caption={fileSearch.trim() ? `${fileResults.length} results` : filePath || "Root"}>
        <Field label="Search" onChangeText={setFileSearch} placeholder="File name" value={fileSearch} />
        {filesError ? <StateCard title="File load failed" detail={filesError} tone="danger" /> : null}
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button disabled={!filePath || Boolean(fileSearch.trim())} label="Up" onPress={() => setFilePath(parentFilePath)} variant="secondary" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Refresh" loading={filesLoading} onPress={loadFiles} variant="secondary" />
          </View>
        </View>
        {fileSearch.trim() ? (
          fileResults.length ? (
            fileResults.map((entry) => (
              <ListRow
                key={entry.path}
                title={entry.name}
                subtitle={trimMiddle(entry.path, 82)}
                meta={entry.extension ?? "file"}
                onPress={() => openFile(entry.path)}
              />
            ))
          ) : (
            <StateCard title={filesLoading ? "Searching files" : "No matching files"} />
          )
        ) : fileEntries.length ? (
          fileEntries.map((entry) => (
            <ListRow
              key={entry.path}
              title={entry.name}
              subtitle={entry.kind === "directory" ? "Directory" : trimMiddle(entry.path, 82)}
              meta={entry.kind === "directory" ? "folder" : entry.extension ?? "file"}
              onPress={() => (entry.kind === "directory" ? setFilePath(entry.path) : openFile(entry.path))}
            />
          ))
        ) : (
          <Text selectable style={{ color: "#676760", fontSize: 14 }}>
            {filesLoading ? "Loading files" : "No files"}
          </Text>
        )}
      </Section>
    </Screen>
  )
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}
