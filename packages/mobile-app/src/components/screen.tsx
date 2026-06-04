import React from "react"
import { ScrollView, useWindowDimensions, View } from "react-native"

export function Screen({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions()
  const maxWidth = width >= 760 ? 720 : undefined

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: "#f7f7f4" }}
      contentContainerStyle={{
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 32,
      }}
    >
      <View style={{ width: "100%", maxWidth, gap: 16 }}>{children}</View>
    </ScrollView>
  )
}
