import React from "react"
import Feather from "@expo/vector-icons/Feather"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import type { MobileMessage, MobileSessionSummary, MobileWorkspace } from "@/api/mobile-api"
import { messageRole, messageText } from "@/utils/message"
import { DarkEmpty, DarkNotice } from "./shared"

type FeatherName = React.ComponentProps<typeof Feather>["name"]

export function ThreadViewPage({
  disabled,
  draft,
  focusedSession,
  focusedWorkspace,
  messageError,
  messages,
  messagesLoading,
  onChangeText,
  onNewChat,
  onOpenApprovals,
  onOpenDrawer,
  onOpenProvider,
  onRefresh,
  onSend,
  paddingBottom,
  paddingTop,
  pendingApprovals,
  placeholder,
  refreshing,
  sending,
}: {
  disabled: boolean
  draft: string
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  messageError: string | null
  messages: MobileMessage[]
  messagesLoading: boolean
  onChangeText: (value: string) => void
  onNewChat: () => void
  onOpenApprovals: () => void
  onOpenDrawer: () => void
  onOpenProvider: () => void
  onRefresh: () => void
  onSend: () => void
  paddingBottom: number
  paddingTop: number
  pendingApprovals: number
  placeholder: string
  refreshing: boolean
  sending: boolean
}) {
  const title = focusedSession?.title ?? "New session"

  return (
    <View style={{ backgroundColor: "#171717", flex: 1, paddingBottom, paddingTop }}>
      <View style={{ alignSelf: "center", flex: 1, width: "100%", maxWidth: 430 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10, height: 58, paddingHorizontal: 14 }}>
          <TopIconButton accessibilityLabel="Open projects and sessions" icon="menu" onPress={onOpenDrawer} />
          <View style={{ alignItems: "center", flex: 1, flexDirection: "row" }}>
            <Text numberOfLines={1} style={{ color: "#e8e8e8", flexShrink: 1, fontSize: 25, fontWeight: "800" }}>
              {title}
            </Text>
          </View>
          <TopIconButton label={refreshing ? "…" : "↻"} onPress={onRefresh} />
          <TopIconButton label={pendingApprovals ? String(pendingApprovals) : "□"} onPress={onOpenApprovals} />
          <TopIconButton label="…" onPress={onOpenProvider} />
        </View>

        <ScrollView
          contentContainerStyle={{ gap: 14, paddingBottom: 18, paddingHorizontal: 22, paddingTop: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        >
          {messageError ? (
            <DarkNotice title="Composer failed" detail={messageError} tone="danger" />
          ) : null}
          {focusedWorkspace && !focusedSession ? (
            <AssistantIntro workspaceName={focusedWorkspace.name} />
          ) : null}
          {focusedSession ? (
            messages.length ? (
              messages.map((message, index) => (
                <ThreadMessage key={message.info?.id ?? `${index}`} message={message} />
              ))
            ) : (
              <DarkEmpty title={messagesLoading ? "Loading session" : "No messages"} />
            )
          ) : null}
        </ScrollView>

        <ThreadComposer
          disabled={disabled}
          draft={draft}
          onChangeText={onChangeText}
          onNewChat={onNewChat}
          onSend={onSend}
          placeholder={placeholder}
          sending={sending}
        />
      </View>
    </View>
  )
}

function ThreadMessage({ message }: { message: MobileMessage }) {
  const role = messageRole(message)
  const isUser = role === "user"
  const text = messageText(message)

  if (isUser) {
    return (
      <View style={{ alignItems: "flex-end" }}>
        <View style={{ backgroundColor: "#474747", borderRadius: 17, borderTopRightRadius: 4, maxWidth: "84%", paddingHorizontal: 14, paddingVertical: 10 }}>
          <Text selectable style={{ color: "#ffffff", fontSize: 16, lineHeight: 22 }}>
            {text}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text style={{ color: "#e8e8e8", fontSize: 16, fontWeight: "900" }}>⌘</Text>
        <Text style={{ color: "#e8e8e8", fontSize: 15, fontWeight: "800" }}>anybox</Text>
      </View>
      <Text selectable style={{ color: "#dedede", fontSize: 16, lineHeight: 22 }}>
        {text || "..."}
      </Text>
    </View>
  )
}

function AssistantIntro({ workspaceName }: { workspaceName: string }) {
  return (
    <View style={{ gap: 10, paddingTop: 14 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8 }}>
        <Text style={{ color: "#e8e8e8", fontSize: 16, fontWeight: "900" }}>⌘</Text>
        <Text style={{ color: "#e8e8e8", fontSize: 15, fontWeight: "800" }}>anybox</Text>
      </View>
      <Text selectable style={{ color: "#dedede", fontSize: 16, lineHeight: 22 }}>
        {`Ready in ${workspaceName}. Send a task to create a focused session.`}
      </Text>
    </View>
  )
}

function ThreadComposer({
  disabled,
  draft,
  onChangeText,
  onNewChat,
  onSend,
  placeholder,
  sending,
}: {
  disabled: boolean
  draft: string
  onChangeText: (value: string) => void
  onNewChat: () => void
  onSend: () => void
  placeholder: string
  sending: boolean
}) {
  return (
    <View style={{ backgroundColor: "#171717", paddingHorizontal: 14, paddingTop: 10 }}>
      <View
        style={{
          backgroundColor: "#262626",
          borderRadius: 28,
          gap: 8,
          minHeight: 64,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#666666"
          spellCheck={false}
          style={{
            color: "#e8e8e8",
            fontSize: 17,
            maxHeight: 96,
            minHeight: 26,
            padding: 0,
            textAlignVertical: "top",
          }}
          value={draft}
        />
        <View style={{ alignItems: "center", flexDirection: "row", height: 36, justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <ComposerIcon label="+" onPress={onNewChat} />
            <ComposerIcon label="⌘" onPress={onNewChat} />
          </View>
          <View style={{ flexDirection: "row", gap: 14 }}>
            <ComposerIcon label="mic" onPress={() => undefined} />
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={onSend}
              style={({ pressed }) => ({
                alignItems: "center",
                backgroundColor: disabled ? "#3a3a3a" : "#e8e8e8",
                borderRadius: 16,
                height: 32,
                justifyContent: "center",
                opacity: pressed ? 0.78 : 1,
                width: 32,
              })}
            >
              <Text style={{ color: disabled ? "#777777" : "#171717", fontSize: 15, fontWeight: "900" }}>
                {sending ? "…" : "↑"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  )
}

function ComposerIcon({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, paddingVertical: 5 })}>
      <Text style={{ color: "#cfcfcf", fontSize: label.length > 1 ? 12 : 20, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function TopIconButton({
  accessibilityLabel,
  icon,
  label,
  onPress,
}: {
  accessibilityLabel?: string
  icon?: FeatherName
  label?: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        borderRadius: 8,
        height: 32,
        justifyContent: "center",
        opacity: pressed ? 0.62 : 1,
        width: 32,
      })}
    >
      {icon ? (
        <Feather color="#e8e8e8" name={icon} size={22} />
      ) : (
        <Text style={{ color: "#e8e8e8", fontSize: (label?.length ?? 0) > 1 ? 14 : 24, fontWeight: "800" }}>{label}</Text>
      )}
    </Pressable>
  )
}
