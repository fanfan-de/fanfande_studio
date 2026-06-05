import React from "react"
import { Text, View } from "react-native"
import { theme, type ThemeTone } from "@/theme"

export function StateCard({
  title,
  detail,
  tone = "neutral",
}: {
  title: string
  detail?: string
  tone?: ThemeTone
}) {
  const toneColors = theme.colors.status[tone]

  return (
    <View
      style={{
        backgroundColor: toneColors.background,
        borderColor: toneColors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        gap: theme.spacing.sm,
        padding: theme.spacing.xxl,
      }}
    >
      <Text
        selectable
        style={{
          color: toneColors.text,
          fontSize: theme.typography.size.md,
          fontWeight: theme.typography.weight.heavy,
        }}
      >
        {title}
      </Text>
      {detail ? (
        <Text
          selectable
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.typography.size.sm,
            lineHeight: theme.typography.lineHeight.sm,
          }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  )
}
