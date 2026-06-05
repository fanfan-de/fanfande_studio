import React from "react"
import { ScrollView, useWindowDimensions, View } from "react-native"
import { theme } from "@/theme"

export function Screen({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions()
  const maxWidth = width >= 760 ? theme.layout.screenMaxWidth : undefined

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{
        alignItems: "center",
        gap: theme.spacing.screen,
        paddingHorizontal: theme.spacing.screen,
        paddingTop: theme.spacing.screen,
        paddingBottom: theme.spacing.screenBottom,
      }}
    >
      <View style={{ width: "100%", maxWidth, gap: theme.spacing.screen }}>{children}</View>
    </ScrollView>
  )
}
