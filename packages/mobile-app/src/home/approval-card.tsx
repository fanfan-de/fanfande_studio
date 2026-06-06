import React from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { Button } from "@/components/button"
import type { MobileApproval } from "@/api/mobile-api"
import { formatRelativeTime, trimMiddle } from "@/utils/format"

type ApprovalCardTone = "light" | "dark"

export function ApprovalCard({
  acting,
  approval,
  onApprove,
  onDeny,
  tone = "light",
}: {
  acting: boolean
  approval: MobileApproval
  onApprove?: () => void
  onDeny?: () => void
  tone?: ApprovalCardTone
}) {
  const details = approval.prompt.details
  const isPending = approval.status === "pending"
  const colors = approvalColors(tone, approval.prompt.risk)

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderRadius: tone === "dark" ? 14 : 8,
        borderWidth: 1,
        gap: 12,
        padding: 14,
      }}
    >
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", gap: 10, justifyContent: "space-between" }}>
          <Text selectable style={{ color: colors.title, flex: 1, fontSize: 16, fontWeight: "800" }}>
            {approval.prompt.title}
          </Text>
          <Text selectable style={{ color: colors.risk, fontSize: 12, fontWeight: "800" }}>
            {isPending ? approval.prompt.risk : approval.status}
          </Text>
        </View>
        <Text selectable style={{ color: colors.body, fontSize: 14, lineHeight: 20 }}>
          {approval.prompt.summary}
        </Text>
        <Text selectable style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
          {approval.prompt.rationale}
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        {details?.command ? <Detail label="Command" tone={tone} value={details.command} /> : null}
        {details?.workdir ? <Detail label="Workdir" tone={tone} value={trimMiddle(details.workdir, 72)} /> : null}
        {details?.paths?.length ? <Detail label="Paths" tone={tone} value={details.paths.map((item) => trimMiddle(item, 64)).join("\n")} /> : null}
        {details?.body ? <Detail label="Body" tone={tone} value={details.body} /> : null}
        <Detail label="Requested" tone={tone} value={formatRelativeTime(approval.createdAt)} />
        {approval.resolution ? <Detail label="Resolved" tone={tone} value={`${approval.resolution.decision} ${formatRelativeTime(approval.resolution.resolvedAt)}`} /> : null}
      </View>

      {onApprove && onDeny ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <ApprovalActionButton acting={acting} label="Deny" onPress={onDeny} tone={tone} variant="danger" />
          </View>
          <View style={{ flex: 1 }}>
            <ApprovalActionButton acting={acting} label="Allow" onPress={onApprove} tone={tone} variant="primary" />
          </View>
        </View>
      ) : null}
    </View>
  )
}

function Detail({ label, tone, value }: { label: string; tone: ApprovalCardTone; value: string }) {
  const dark = tone === "dark"
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: dark ? "#9d9d9d" : "#676760", fontSize: 11, fontWeight: "800" }}>{label}</Text>
      <Text selectable style={{ color: dark ? "#e8e8e8" : "#151515", fontFamily: "monospace", fontSize: 12, lineHeight: 17 }}>
        {value}
      </Text>
    </View>
  )
}

function ApprovalActionButton({
  acting,
  label,
  onPress,
  tone,
  variant,
}: {
  acting: boolean
  label: string
  onPress: () => void
  tone: ApprovalCardTone
  variant: "danger" | "primary"
}) {
  if (tone === "light") {
    return <Button disabled={acting} label={label} loading={acting} onPress={onPress} variant={variant} />
  }

  const danger = variant === "danger"
  const backgroundColor = danger ? "#4a2424" : "#e8e8e8"
  const color = danger ? "#ffb7b7" : "#171717"

  return (
    <Pressable
      accessibilityRole="button"
      disabled={acting}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor,
        borderRadius: 12,
        flexDirection: "row",
        gap: 8,
        justifyContent: "center",
        minHeight: 42,
        opacity: acting ? 0.52 : pressed ? 0.78 : 1,
        paddingHorizontal: 12,
        paddingVertical: 10,
      })}
    >
      {acting ? <ActivityIndicator color={color} /> : null}
      <Text style={{ color, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  )
}

function approvalColors(tone: ApprovalCardTone, risk: MobileApproval["prompt"]["risk"]) {
  const riskTone = riskColor(risk, tone)
  if (tone === "dark") {
    return {
      background: "#241f18",
      border: riskTone,
      body: "#dedede",
      muted: "#b7b7b7",
      risk: riskTone,
      title: "#f2f2f2",
    }
  }

  return {
    background: "#ffffff",
    border: riskTone,
    body: "#4d4d49",
    muted: "#676760",
    risk: riskTone,
    title: "#151515",
  }
}

function riskColor(risk: MobileApproval["prompt"]["risk"], tone: ApprovalCardTone) {
  if (tone === "dark") {
    switch (risk) {
      case "critical":
        return "#ff9a9a"
      case "high":
        return "#ffb86c"
      case "medium":
        return "#ffd166"
      case "low":
        return "#74d58b"
    }
  }

  switch (risk) {
    case "critical":
      return "#9d1c1f"
    case "high":
      return "#b14600"
    case "medium":
      return "#8a5a00"
    case "low":
      return "#155c34"
  }
}
