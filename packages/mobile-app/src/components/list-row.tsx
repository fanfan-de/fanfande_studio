import React from "react"
import { Pressable, Text, View } from "react-native"
import { theme } from "@/theme"

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
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        gap: theme.spacing.md,
        opacity: pressed ? theme.opacity.pressed : 1,
        padding: theme.spacing.xxl,
      })}
    >
      <View style={{ flexDirection: "row", gap: theme.spacing.xl, justifyContent: "space-between" }}>
        <Text
          selectable={selectable}
          style={{
            color: theme.colors.text,
            flex: 1,
            fontSize: theme.typography.size.lg,
            fontWeight: theme.typography.weight.bold,
          }}
        >
          {title}
        </Text>
        {meta ? (
          <Text
            selectable={selectable}
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.typography.size.sm,
              fontVariant: ["tabular-nums"],
            }}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      {subtitle ? (
        <Text
          selectable={selectable}
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.typography.size.sm,
            lineHeight: theme.typography.lineHeight.sm,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}
