import React from "react"
import { Text, View } from "react-native"

export function Section({
  title,
  caption,
  children,
}: {
  title: string
  caption?: string
  children: React.ReactNode
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
        <Text style={{ color: "#151515", fontSize: 18, fontWeight: "800" }}>{title}</Text>
        {caption ? (
          <Text selectable style={{ color: "#676760", fontSize: 13, fontVariant: ["tabular-nums"] }}>
            {caption}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  )
}
