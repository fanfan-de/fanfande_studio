import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import React from "react"
import { AccountProvider } from "@/state/account"
import { ConnectionProvider } from "@/state/connection"
import { FocusProvider } from "@/state/focus"
import { UpdateGate } from "@/components/update-gate"
import { theme } from "@/theme"

export default function RootLayout() {
  return (
    <AccountProvider>
      <ConnectionProvider>
        <FocusProvider>
          <UpdateGate />
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: theme.colors.canvas },
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="index" options={{ title: "Anybox" }} />
            <Stack.Screen name="account" options={{ title: "Account" }} />
            <Stack.Screen name="provider" options={{ title: "AnyboxProvider" }} />
            <Stack.Screen name="scan" options={{ title: "Scan QR" }} />
            <Stack.Screen name="connect" options={{ title: "Connect" }} />
            <Stack.Screen name="updates" options={{ title: "Updates" }} />
            <Stack.Screen name="approvals" options={{ title: "Approvals" }} />
            <Stack.Screen name="workspaces/[workspaceID]" options={{ title: "Workspace" }} />
            <Stack.Screen name="workspaces/[workspaceID]/file" options={{ title: "File" }} />
            <Stack.Screen name="sessions/[sessionID]" options={{ title: "Chat" }} />
          </Stack>
        </FocusProvider>
      </ConnectionProvider>
    </AccountProvider>
  )
}
