import React from "react"
import { Text, TextInput, View } from "react-native"

interface FieldProps {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  secureTextEntry?: boolean
  multiline?: boolean
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, multiline }: FieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: "#4d4d49", fontSize: 13, fontWeight: "700" }}>{label}</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={secureTextEntry ? "default" : "url"}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8b8b84"
        secureTextEntry={secureTextEntry}
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#deded8",
          borderRadius: 8,
          borderWidth: 1,
          color: "#151515",
          fontSize: 16,
          minHeight: multiline ? 110 : 48,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 10,
          textAlignVertical: multiline ? "top" : "center",
        }}
        value={value}
      />
    </View>
  )
}
