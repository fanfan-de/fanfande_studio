import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import React from "react"
import { ConnectionProvider } from "@/state/connection"
import { UpdateGate } from "@/components/update-gate"

export default function RootLayout() {
  return (
    <ConnectionProvider>
      <UpdateGate />
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: "#f7f7f4" },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: "Anybox" }} />
        <Stack.Screen name="connect" options={{ title: "Connect" }} />
        <Stack.Screen name="updates" options={{ title: "Updates" }} />
        <Stack.Screen name="approvals" options={{ title: "Approvals" }} />
        <Stack.Screen name="workspaces/[workspaceID]" options={{ title: "Workspace" }} />
        <Stack.Screen name="workspaces/[workspaceID]/file" options={{ title: "File" }} />
        <Stack.Screen name="sessions/[sessionID]" options={{ title: "Chat" }} />
      </Stack>
    </ConnectionProvider>
  )
}
