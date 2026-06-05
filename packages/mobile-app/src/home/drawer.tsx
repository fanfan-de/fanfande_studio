import React from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import type { MobileSessionSummary, MobileWorkspace } from "@/api/mobile-api"
import { DarkProviderRow, DarkToolbarButton, darkToneColor } from "./shared"
import type { ProviderStatusTone } from "./types"

export function SessionDrawerPage({
  appVersion,
  focusedSessionID,
  focusedWorkspaceID,
  onNewChat,
  onOpenProvider,
  onOpenUpdates,
  onRefresh,
  onSelectSession,
  onSelectWorkspace,
  paddingBottom,
  paddingTop,
  providerDetail,
  providerLabel,
  providerTone,
  refreshing,
  sending,
  sessions,
  workspaces,
}: {
  appVersion: string
  focusedSessionID?: string
  focusedWorkspaceID?: string
  onNewChat: () => void
  onOpenProvider: () => void
  onOpenUpdates: () => void
  onRefresh: () => void
  onSelectSession: (session: MobileSessionSummary) => void
  onSelectWorkspace: (workspace: MobileWorkspace) => void
  paddingBottom: number
  paddingTop: number
  providerDetail: string
  providerLabel: string
  providerTone: ProviderStatusTone
  refreshing: boolean
  sending: boolean
  sessions: MobileSessionSummary[]
  workspaces: MobileWorkspace[]
}) {
  return (
    <View style={{ backgroundColor: "#191919", flex: 1, paddingBottom, paddingTop }}>
      <View style={{ alignSelf: "center", flex: 1, width: "100%", maxWidth: 430 }}>
        <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 14 }}>
          <DarkProviderRow detail={providerDetail} label={providerLabel} tone={providerTone} onPress={onOpenProvider} />

          <ScrollView
            contentContainerStyle={{ gap: 4, paddingBottom: 18, paddingTop: 14 }}
            showsVerticalScrollIndicator={false}
          >
            {workspaces.length ? (
              workspaces.map((workspace) => {
                const selected = workspace.id === focusedWorkspaceID
                return (
                  <View key={workspace.id} style={{ gap: 3 }}>
                    <DrawerProjectRow
                      selected={selected}
                      title={workspace.name}
                      onPress={() => onSelectWorkspace(workspace)}
                    />
                    {selected ? (
                      <View style={{ gap: 2, paddingLeft: 18 }}>
                        {sessions.length ? (
                          sessions.map((session) => (
                            <DrawerSessionRow
                              key={session.id}
                              meta={session.workflow?.status}
                              selected={session.id === focusedSessionID}
                              title={session.title}
                              onPress={() => onSelectSession(session)}
                            />
                          ))
                        ) : (
                          <Text selectable style={{ color: "#8c8c8c", fontSize: 13, paddingHorizontal: 8, paddingVertical: 8 }}>
                            No sessions
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                )
              })
            ) : (
              <View style={{ alignItems: "center", justifyContent: "center", minHeight: 220 }}>
                <Text selectable style={{ color: "#8c8c8c", fontSize: 15, fontWeight: "700" }}>
                  No projects
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        <View style={{ gap: 10, paddingHorizontal: 14, paddingTop: 10 }}>
          <View style={{ alignItems: "center", flexDirection: "row", gap: 18, justifyContent: "center", minHeight: 34 }}>
            <DarkToolbarButton label={refreshing ? "Refreshing" : "Refresh"} onPress={onRefresh} />
            <DarkToolbarButton label={sending ? "Creating" : "New"} onPress={onNewChat} />
            <DarkToolbarButton label="Updates" onPress={onOpenUpdates} />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onOpenProvider}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: "#363636",
              borderRadius: 27,
              flexDirection: "row",
              gap: 12,
              height: 54,
              opacity: pressed ? 0.78 : 1,
              paddingHorizontal: 16,
            })}
          >
            <View style={{ backgroundColor: "#e8e8e8", borderRadius: 4, height: 8, width: 8 }} />
            <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 15, fontWeight: "800" }}>
              AnyboxProvider
            </Text>
            <Text numberOfLines={1} style={{ color: "#a9a9a9", fontSize: 12, fontVariant: ["tabular-nums"], fontWeight: "700" }}>
              {appVersion}
            </Text>
          </Pressable>
          <View style={{ alignItems: "center", flexDirection: "row", height: 44, justifyContent: "space-between" }}>
            <Text numberOfLines={1} style={{ color: "#a9a9a9", flex: 1, fontSize: 12 }}>
              {providerDetail}
            </Text>
            <Text style={{ color: darkToneColor(providerTone), fontSize: 12, fontWeight: "800" }}>{providerLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

function DrawerProjectRow({
  selected,
  title,
  onPress,
}: {
  selected: boolean
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 9,
        flexDirection: "row",
        gap: 8,
        height: 42,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 8,
      })}
    >
      <Text style={{ color: "#cfcfcf", fontSize: 16, width: 12 }}>{selected ? "⌄" : "›"}</Text>
      <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 15, fontWeight: "700" }}>
        {title}
      </Text>
    </Pressable>
  )
}

function DrawerSessionRow({
  meta,
  selected,
  title,
  onPress,
}: {
  meta?: string
  selected: boolean
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: selected ? "#474747" : "transparent",
        borderRadius: 10,
        flexDirection: "row",
        height: 32,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 10,
      })}
    >
      <Text numberOfLines={1} style={{ color: selected ? "#ffffff" : "#d6d6d6", flex: 1, fontSize: 13, fontWeight: selected ? "800" : "600" }}>
        {title}
      </Text>
      {meta ? (
        <Text numberOfLines={1} style={{ color: "#a9a9a9", fontSize: 11, fontWeight: "700" }}>
          {meta}
        </Text>
      ) : null}
    </Pressable>
  )
}
