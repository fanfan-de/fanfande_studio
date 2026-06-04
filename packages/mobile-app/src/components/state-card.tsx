import React from "react"
import { Text, View } from "react-native"

export function StateCard({
  title,
  detail,
  tone = "neutral",
}: {
  title: string
  detail?: string
  tone?: "neutral" | "success" | "danger"
}) {
  const color = tone === "success" ? "#155c34" : tone === "danger" ? "#8f1f1f" : "#4d4d49"
  const backgroundColor = tone === "success" ? "#edf8ef" : tone === "danger" ? "#fff0f0" : "#ffffff"

  return (
    <View
      style={{
        backgroundColor,
        borderColor: tone === "neutral" ? "#e5e3dc" : `${color}33`,
        borderRadius: 8,
        borderWidth: 1,
        gap: 6,
        padding: 14,
      }}
    >
      <Text selectable style={{ color, fontSize: 15, fontWeight: "800" }}>
        {title}
      </Text>
      {detail ? (
        <Text selectable style={{ color: "#676760", fontSize: 13, lineHeight: 18 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}
