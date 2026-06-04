import React from "react"
import { Pressable, Text, View } from "react-native"

interface ListRowProps {
  title: string
  subtitle?: string
  meta?: string
  onPress?: () => void
}

export function ListRow({ title, subtitle, meta, onPress }: ListRowProps) {
  const selectable = !onPress

  return (
    <Pressable
      accessibilityLabel={onPress ? title : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      accessible={Boolean(onPress)}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: "#ffffff",
        borderColor: "#e5e3dc",
        borderRadius: 8,
        borderWidth: 1,
        gap: 8,
        opacity: pressed ? 0.78 : 1,
        padding: 14,
      })}
    >
      <View style={{ flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
        <Text selectable={selectable} style={{ color: "#151515", flex: 1, fontSize: 16, fontWeight: "700" }}>
          {title}
        </Text>
        {meta ? (
          <Text selectable={selectable} style={{ color: "#676760", fontSize: 13, fontVariant: ["tabular-nums"] }}>
            {meta}
          </Text>
        ) : null}
      </View>
      {subtitle ? (
        <Text selectable={selectable} style={{ color: "#676760", fontSize: 13, lineHeight: 18 }}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}
