import React from "react"
import { Text, TextInput, View, type KeyboardTypeOptions } from "react-native"
import { theme } from "@/theme"

interface FieldProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
  keyboardType?: KeyboardTypeOptions
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, multiline, keyboardType }: FieldProps) {
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text
        style={{
          color: theme.colors.textSubtle,
          fontSize: theme.typography.size.sm,
          fontWeight: theme.typography.weight.bold,
        }}
      >
        {label}
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType ?? (secureTextEntry ? "default" : "url")}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textPlaceholder}
        secureTextEntry={secureTextEntry}
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderStrong,
          borderRadius: theme.radius.sm,
          borderWidth: 1,
          color: theme.colors.text,
          fontSize: theme.typography.size.lg,
          minHeight: multiline ? 110 : 48,
          paddingHorizontal: theme.spacing.xxl,
          paddingVertical: multiline ? theme.spacing.xl : theme.spacing.lg,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  )
}
