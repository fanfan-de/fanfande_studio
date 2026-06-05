import React from "react"
import { Text, View } from "react-native"
import { theme } from "@/theme"

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
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.xl, justifyContent: "space-between" }}>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.typography.size.xl,
            fontWeight: theme.typography.weight.heavy,
          }}
        >
          {title}
        </Text>
        {caption ? (
          <Text
            selectable
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.typography.size.sm,
              fontVariant: ["tabular-nums"],
            }}
          >
            {caption}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: theme.spacing.lg }}>{children}</View>
    </View>
  )
}
