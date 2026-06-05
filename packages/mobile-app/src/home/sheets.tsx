import React from "react"
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native"
import { Button } from "@/components/button"
import { StateCard } from "@/components/state-card"
import type { MobileApproval, MobileMessage, MobileSessionSummary, MobileWorkspace } from "@/api/mobile-api"
import { formatRelativeTime, trimMiddle } from "@/utils/format"
import { messageRole, messageText } from "@/utils/message"

export function FocusHero({
  focusedSession,
  focusedWorkspace,
  onNewChat,
  onOpenConversationPicker,
  onOpenProjectPicker,
  onOpenSession,
  onRefresh,
  refreshing,
  sending,
}: {
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  onNewChat: () => void
  onOpenConversationPicker: () => void
  onOpenProjectPicker: () => void
  onOpenSession: () => void
  onRefresh: () => void
  refreshing: boolean
  sending: boolean
}) {
  return (
    <View
      style={{
        backgroundColor: "#ffffff",
        borderColor: "#e5e3dc",
        borderRadius: 16,
        borderWidth: 1,
        gap: 14,
        padding: 16,
      }}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onOpenProjectPicker}
        style={({ pressed }) => ({
          gap: 8,
          opacity: pressed ? 0.78 : 1,
        })}
      >
        <Text selectable style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0 }}>
          Current project
        </Text>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
          <Text selectable numberOfLines={2} style={{ color: "#151515", flex: 1, fontSize: 24, fontWeight: "800", letterSpacing: 0, lineHeight: 30 }}>
            {focusedWorkspace?.name ?? "Select a project"}
          </Text>
          <Text style={{ color: "#676760", fontSize: 13, fontWeight: "800", letterSpacing: 0, paddingTop: 7 }}>
            Change
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenConversationPicker}
        style={({ pressed }) => ({
          backgroundColor: "#f7f7f4",
          borderRadius: 12,
          gap: 6,
          opacity: pressed ? 0.78 : 1,
          padding: 12,
        })}
      >
        <Text selectable style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0 }}>
          Conversation
        </Text>
        <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
          <Text selectable numberOfLines={2} style={{ color: "#151515", flex: 1, fontSize: 16, fontWeight: "700", letterSpacing: 0, lineHeight: 21 }}>
            {focusedSession?.title ?? "New conversation"}
          </Text>
          <Text style={{ color: "#676760", fontSize: 12, fontWeight: "800", letterSpacing: 0, paddingTop: 2 }}>
            Select
          </Text>
        </View>
      </Pressable>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button label="Refresh" loading={refreshing} onPress={onRefresh} variant="secondary" />
        </View>
        <View style={{ flex: 1 }}>
          <Button disabled={!focusedWorkspace} label="New chat" loading={sending} onPress={onNewChat} />
        </View>
      </View>
      {focusedSession ? (
        <Button label="Open chat" onPress={onOpenSession} variant="secondary" />
      ) : null}
    </View>
  )
}

export function ContextSelectorSheet({
  focusedSessionID,
  focusedWorkspaceID,
  kind,
  maxWidth,
  onClose,
  onNewChat,
  onSelectSession,
  onSelectWorkspace,
  paddingBottom,
  sending,
  sessions,
  workspaces,
}: {
  focusedSessionID?: string
  focusedWorkspaceID?: string
  kind: "projects" | "conversations" | null
  maxWidth?: number
  onClose: () => void
  onNewChat: () => void
  onSelectSession: (session: MobileSessionSummary) => void
  onSelectWorkspace: (workspace: MobileWorkspace) => void
  paddingBottom: number
  sending: boolean
  sessions: MobileSessionSummary[]
  workspaces: MobileWorkspace[]
}) {
  const visible = Boolean(kind)
  const title = kind === "projects" ? "Select project" : "Select conversation"

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={{
            backgroundColor: "rgba(21, 21, 21, 0.24)",
            flex: 1,
          }}
        />
        <View
          style={{
            alignItems: "center",
            backgroundColor: "rgba(21, 21, 21, 0.24)",
          }}
        >
          <View
            style={{
              backgroundColor: "#f7f7f4",
              borderColor: "#e5e3dc",
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderWidth: 1,
              gap: 14,
              maxHeight: "78%",
              maxWidth,
              paddingBottom,
              paddingHorizontal: 16,
              paddingTop: 10,
              width: "100%",
            }}
          >
            <View style={{ alignItems: "center", gap: 12 }}>
              <View style={{ backgroundColor: "#d4d4cd", borderRadius: 2, height: 4, width: 40 }} />
              <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
                <Text style={{ color: "#151515", fontSize: 18, fontWeight: "800", letterSpacing: 0 }}>{title}</Text>
                <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1, padding: 8 })}>
                  <Text style={{ color: "#676760", fontSize: 15, fontWeight: "800", letterSpacing: 0 }}>Done</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 2 }} showsVerticalScrollIndicator={false}>
              {kind === "projects" ? (
                workspaces.length ? (
                  workspaces.map((workspace) => (
                    <SheetChoiceRow
                      key={workspace.id}
                      meta={`${workspace.sessions.length} chats`}
                      selected={workspace.id === focusedWorkspaceID}
                      subtitle={trimMiddle(workspace.directory, 72)}
                      title={workspace.name}
                      onPress={() => onSelectWorkspace(workspace)}
                    />
                  ))
                ) : (
                  <StateCard title="No projects" detail="The current desktop only returns projects with existing chats." />
                )
              ) : (
                <>
                  <SheetChoiceRow
                    meta="Create"
                    selected={false}
                    title={sending ? "Creating" : "New conversation"}
                    onPress={onNewChat}
                  />
                  {sessions.length ? (
                    sessions.map((session) => (
                      <SheetChoiceRow
                        key={session.id}
                        meta={session.workflow?.status || formatRelativeTime(session.updated)}
                        selected={session.id === focusedSessionID}
                        title={session.title}
                        onPress={() => onSelectSession(session)}
                      />
                    ))
                  ) : (
                    <StateCard title="No conversations" />
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function SheetChoiceRow({
  meta,
  selected,
  subtitle,
  title,
  onPress,
}: {
  meta: string
  selected: boolean
  subtitle?: string
  title: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: selected ? "#151515" : "#ffffff",
        borderColor: selected ? "#151515" : "#e5e3dc",
        borderRadius: 14,
        borderWidth: 1,
        gap: 6,
        minHeight: 58,
        opacity: pressed ? 0.78 : 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
      })}
    >
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 12 }}>
        <Text
          numberOfLines={2}
          style={{
            color: selected ? "#ffffff" : "#151515",
            flex: 1,
            fontSize: 16,
            fontWeight: "800",
            letterSpacing: 0,
            lineHeight: 20,
          }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: selected ? "#d8d8d2" : "#676760",
            fontSize: 12,
            fontVariant: ["tabular-nums"],
            fontWeight: "800",
            letterSpacing: 0,
            paddingTop: 2,
          }}
        >
          {meta}
        </Text>
      </View>
      {subtitle ? (
        <Text
          numberOfLines={1}
          style={{
            color: selected ? "#d8d8d2" : "#676760",
            fontSize: 12,
            letterSpacing: 0,
            lineHeight: 16,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}

export function ChatPreviewPanel({
  focusedSession,
  focusedWorkspace,
  messageError,
  messagesLoading,
  recentMessages,
  visibleMessageCount,
}: {
  focusedSession: MobileSessionSummary | null
  focusedWorkspace: MobileWorkspace | null
  messageError: string | null
  messagesLoading: boolean
  recentMessages: MobileMessage[]
  visibleMessageCount: number
}) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHeader caption={focusedSession ? `${visibleMessageCount}` : undefined} title="Chat" />
      <View
        style={{
          backgroundColor: "#ffffff",
          borderColor: "#e5e3dc",
          borderRadius: 16,
          borderWidth: 1,
          gap: 12,
          minHeight: 260,
          padding: 14,
        }}
      >
        {messageError ? <StateCard title="Composer failed" detail={messageError} tone="danger" /> : null}
        {focusedSession ? (
          recentMessages.length ? (
            recentMessages.map((message, index) => (
              <MessagePreview key={message.info?.id ?? `${index}`} message={message} />
            ))
          ) : (
            <ChatEmpty title={messagesLoading ? "Loading conversation" : "No messages"} />
          )
        ) : (
          <ChatEmpty title={focusedWorkspace ? "Ready for a new conversation" : "No project selected"} />
        )}
      </View>
    </View>
  )
}

function ChatEmpty({ title }: { title: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1, justifyContent: "center", minHeight: 220 }}>
      <Text selectable style={{ color: "#676760", fontSize: 15, fontWeight: "700", letterSpacing: 0 }}>
        {title}
      </Text>
    </View>
  )
}

export function ApprovalStrip({
  approvals,
  onOpen,
}: {
  approvals: MobileApproval[]
  onOpen: () => void
}) {
  const firstApproval = approvals[0]
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => ({
        backgroundColor: "#fff8ec",
        borderColor: "#e9d7b6",
        borderRadius: 16,
        borderWidth: 1,
        gap: 8,
        opacity: pressed ? 0.78 : 1,
        padding: 14,
      })}
    >
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Text style={{ color: "#8a5a00", flex: 1, fontSize: 15, fontWeight: "800", letterSpacing: 0 }}>
          Pending approval
        </Text>
        <Text selectable style={{ color: "#8a5a00", fontSize: 13, fontVariant: ["tabular-nums"], fontWeight: "800", letterSpacing: 0 }}>
          {approvals.length}
        </Text>
      </View>
      <Text selectable numberOfLines={2} style={{ color: "#4d4d49", fontSize: 14, lineHeight: 19 }}>
        {firstApproval?.prompt.title ?? "Approval request"}
      </Text>
    </Pressable>
  )
}

function SectionHeader({ caption, title }: { caption?: string; title: string }) {
  return (
    <View style={{ alignItems: "center", flexDirection: "row", gap: 12, justifyContent: "space-between" }}>
      <Text style={{ color: "#151515", fontSize: 17, fontWeight: "800", letterSpacing: 0 }}>{title}</Text>
      {caption ? (
        <Text selectable style={{ color: "#676760", fontSize: 13, fontVariant: ["tabular-nums"], letterSpacing: 0 }}>
          {caption}
        </Text>
      ) : null}
    </View>
  )
}

function MessagePreview({ message }: { message: MobileMessage }) {
  const isUser = messageRole(message) === "user"

  return (
    <View
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        backgroundColor: isUser ? "#151515" : "#f1f1ed",
        borderRadius: 16,
        maxWidth: "88%",
        paddingHorizontal: 13,
        paddingVertical: 10,
      }}
    >
      <Text selectable style={{ color: isUser ? "#ffffff" : "#151515", fontSize: 15, letterSpacing: 0, lineHeight: 21 }}>
        {messageText(message)}
      </Text>
    </View>
  )
}

export function ComposerBar({
  disabled,
  draft,
  maxWidth,
  onChangeText,
  onSend,
  paddingBottom,
  placeholder,
  sending,
}: {
  disabled: boolean
  draft: string
  maxWidth?: number
  onChangeText: (value: string) => void
  onSend: () => void
  paddingBottom: number
  placeholder: string
  sending: boolean
}) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: "#f7f7f4",
        borderTopColor: "#e5e3dc",
        borderTopWidth: 1,
        paddingBottom,
        paddingHorizontal: 16,
        paddingTop: 10,
      }}
    >
      <View style={{ flexDirection: "row", gap: 10, maxWidth, width: "100%" }}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8b8b84"
          spellCheck={false}
          style={{
            backgroundColor: "#ffffff",
            borderColor: "#deded8",
            borderRadius: 8,
            borderWidth: 1,
            color: "#151515",
            flex: 1,
            fontSize: 16,
            maxHeight: 112,
            minHeight: 46,
            paddingHorizontal: 14,
            paddingVertical: 10,
            textAlignVertical: "top",
          }}
          value={draft}
        />
        <View style={{ width: 92 }}>
          <Button disabled={disabled} label="Send" loading={sending} onPress={onSend} />
        </View>
      </View>
    </View>
  )
}
