import React from "react"
import { Pressable, Text, View } from "react-native"
import type { ProviderStatusTone } from "./types"

export function DarkProviderRow({
  detail,
  label,
  tone,
  onPress,
}: {
  detail: string
  label: string
  tone: ProviderStatusTone
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        flexDirection: "row",
        gap: 10,
        minHeight: 34,
        opacity: pressed ? 0.78 : 1,
      })}
    >
      <View style={{ backgroundColor: darkToneColor(tone), borderRadius: 4, height: 8, width: 8 }} />
      <Text numberOfLines={1} style={{ color: "#e8e8e8", flex: 1, fontSize: 14, fontWeight: "800" }}>
        {detail}
      </Text>
      <Text style={{ color: darkToneColor(tone), fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

export function DarkToolbarButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, padding: 6 })}>
      <Text style={{ color: "#cfcfcf", fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

export function DarkEmpty({ title }: { title: string }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", minHeight: 360 }}>
      <Text selectable style={{ color: "#777777", fontSize: 15, fontWeight: "700" }}>
        {title}
      </Text>
    </View>
  )
}

export function DarkNotice({
  detail,
  title,
  tone,
}: {
  detail?: string
  title: string
  tone: "danger" | "neutral"
}) {
  return (
    <View style={{ backgroundColor: tone === "danger" ? "#341c1c" : "#262626", borderRadius: 14, gap: 5, padding: 12 }}>
      <Text selectable style={{ color: tone === "danger" ? "#ffb7b7" : "#e8e8e8", fontSize: 14, fontWeight: "800" }}>
        {title}
      </Text>
      {detail ? (
        <Text selectable style={{ color: "#cfcfcf", fontSize: 13, lineHeight: 18 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

export function darkToneColor(tone: ProviderStatusTone) {
  if (tone === "success") return "#74d58b"
  if (tone === "danger") return "#ff9a9a"
  return "#a9a9a9"
}
