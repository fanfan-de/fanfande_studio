import React from "react"
import { ActivityIndicator, Pressable, Text } from "react-native"

interface ButtonProps {
  label: string
  onPress: () => void
  disabled?: boolean
  loading?: boolean
  variant?: "primary" | "secondary" | "danger"
}

export function Button({ label, onPress, disabled, loading, variant = "primary" }: ButtonProps) {
  const isDisabled = disabled || loading
  const backgroundColor =
    variant === "primary" ? "#151515" : variant === "danger" ? "#9d1c1f" : "rgba(21, 21, 21, 0.06)"
  const color = variant === "secondary" ? "#151515" : "#ffffff"

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor,
        borderRadius: 8,
        flexDirection: "row",
        gap: 8,
        justifyContent: "center",
        minHeight: 46,
        opacity: isDisabled ? 0.52 : pressed ? 0.82 : 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
      })}
    >
      {loading ? <ActivityIndicator color={color} /> : null}
      <Text style={{ color, fontSize: 16, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  )
}
