import { useRouter } from "expo-router"
import React, { useEffect, useMemo, useState } from "react"
import { Alert, Image, Text, View } from "react-native"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { theme, type ThemeTone } from "@/theme"
import { useAccount } from "@/state/account"
import {
  describeAccountApiError,
  formatDeviceLimit,
  formatEntitlementFlag,
  formatAccountPlanLabel,
  formatSubscriptionStatus,
} from "@/utils/account-entitlements"

type AccountMode = "login" | "register"

export default function AccountScreen() {
  const router = useRouter()
  const { account, clearAccount, defaultBaseUrl, loading, loginWithEmail, refreshAccount, registerWithEmail, updateProfile } = useAccount()
  const [mode, setMode] = useState<AccountMode>("login")
  const [baseUrl, setBaseUrl] = useState(account?.baseUrl ?? defaultBaseUrl)
  const [email, setEmail] = useState(account?.user.email ?? "")
  const [name, setName] = useState(account?.user.name ?? "")
  const [profileName, setProfileName] = useState(account?.user.displayName ?? account?.user.name ?? "")
  const [profileUsername, setProfileUsername] = useState(account?.user.username ?? "")
  const [profileAvatarUrl, setProfileAvatarUrl] = useState(account?.user.avatarUrl ?? "")
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)

  const profileHasChanges = useMemo(() => {
    if (!account) return false
    return (
      profileName.trim() !== (account.user.displayName ?? account.user.name ?? "").trim() ||
      profileUsername.trim() !== (account.user.username ?? "").trim() ||
      profileAvatarUrl.trim() !== (account.user.avatarUrl ?? "").trim()
    )
  }, [account, profileName, profileUsername, profileAvatarUrl])

  useEffect(() => {
    if (!account) {
      setEditingProfile(false)
      return
    }
    setProfileName(account.user.displayName ?? account.user.name ?? "")
    setProfileUsername(account.user.username ?? "")
    setProfileAvatarUrl(account.user.avatarUrl ?? "")
    setEditingProfile(false)
  }, [account])

  async function submit() {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      if (mode === "register") {
        const registration = await registerWithEmail({ baseUrl, email, password, name })
        setPassword("")
        setMode("login")
        setMessage(
          registration.verificationEmailSent
            ? "Account created. Verify your email, then sign in."
            : "Account created. Email verification is required before sign in.",
        )
        return
      }

      await loginWithEmail({ baseUrl, email, password })
      setPassword("")
      router.replace("/")
    } catch (submitError) {
      setError(describeAccountApiError(submitError, "Account request failed."))
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    Alert.alert("Sign out?", "This removes the Anybox account token from this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          void clearAccount().catch((clearError) => {
            setError(clearError instanceof Error ? clearError.message : "Unable to sign out.")
          })
        },
      },
    ])
  }

  async function refresh() {
    setSubmitting(true)
    setError(null)
    try {
      await refreshAccount()
      setMessage("Account refreshed.")
    } catch (refreshError) {
      setError(describeAccountApiError(refreshError, "Unable to refresh account."))
    } finally {
      setSubmitting(false)
    }
  }

  async function saveProfile() {
    if (!account || submitting) return
    if (!profileHasChanges) {
      setEditingProfile(false)
      return
    }
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      await updateProfile({
        displayName: profileName.trim() || null,
        username: profileUsername.trim() || null,
        avatarUrl: profileAvatarUrl.trim() || null,
      })
      setMessage("Profile saved.")
      setEditingProfile(false)
    } catch (profileError) {
      setError(describeAccountApiError(profileError, "Unable to save profile."))
    } finally {
      setSubmitting(false)
    }
  }

  function cancelProfileEdit() {
    if (!account) return
    setProfileName(account.user.displayName ?? account.user.name ?? "")
    setProfileUsername(account.user.username ?? "")
    setProfileAvatarUrl(account.user.avatarUrl ?? "")
    setEditingProfile(false)
  }

  if (loading) {
    return (
      <Screen>
        <StateCard title="Loading account" />
      </Screen>
    )
  }

  return (
    <Screen>
      {account ? (
        <>
          <Section title="Profile">
            <ProfileSummary
              avatarUrl={account.user.avatarUrl ?? ""}
              displayName={account.user.displayName ?? account.user.name ?? ""}
              email={account.user.email}
              username={account.user.username ?? ""}
            />
            {message ? <StateCard title="Account updated" detail={message} tone="success" /> : null}
            {error ? <StateCard title="Account failed" detail={error} tone="danger" /> : null}
            {editingProfile ? (
              <>
                <Field label="Display name" keyboardType="default" onChangeText={setProfileName} placeholder="Name shown in Anybox" value={profileName} />
                <Field label="Username" keyboardType="default" onChangeText={setProfileUsername} placeholder="lowercase_username" value={profileUsername} />
                <Field label="Avatar URL" keyboardType="url" onChangeText={setProfileAvatarUrl} placeholder="https://example.com/avatar.png" value={profileAvatarUrl} />
                <View style={{ flexDirection: "row", gap: theme.spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Cancel" onPress={cancelProfileEdit} variant="secondary" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button disabled={!profileHasChanges} label="Save profile" loading={submitting} onPress={() => void saveProfile()} />
                  </View>
                </View>
              </>
            ) : (
              <>
                <InfoCard>
                  <InfoRow title="Display name" value={account.user.displayName ?? account.user.name ?? "Not set"} />
                  <InfoRow divided title="Username" value={account.user.username ? `@${account.user.username}` : "Not set"} />
                  <InfoRow divided title="Avatar" value={account.user.avatarUrl ? "Custom image" : "Not set"} />
                </InfoCard>
                <Button
                  label="Edit profile"
                  onPress={() => {
                    setError(null)
                    setMessage(null)
                    setEditingProfile(true)
                  }}
                  variant="secondary"
                />
              </>
            )}
          </Section>

          <Section title="Plan & Workspace">
            <InfoCard>
              <InfoRow title="Workspace" value={account.workspace?.name ?? "Unknown"} />
              <InfoRow badgeTone="neutral" divided title="Plan" value={formatAccountPlanLabel(account)} />
              <InfoRow badgeTone={subscriptionTone(account.subscription?.status)} divided title="Subscription" value={formatSubscriptionStatus(account)} />
              <InfoRow
                badgeTone={flagTone(account.entitlements?.relayEnabled)}
                divided
                title="Relay"
                value={formatEntitlementFlag(account.entitlements?.relayEnabled)}
              />
              <InfoRow
                badgeTone={flagTone(account.entitlements?.modelGatewayEnabled)}
                divided
                title="Model gateway"
                value={formatEntitlementFlag(account.entitlements?.modelGatewayEnabled)}
              />
              <InfoRow divided title="Desktop devices" value={formatDeviceLimit(account.entitlements?.maxDesktopDevices)} />
              <InfoRow divided title="Mobile devices" value={formatDeviceLimit(account.entitlements?.maxMobileDevices)} />
            </InfoCard>
          </Section>

          <Section title="Actions">
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="Refresh" loading={submitting} onPress={() => void refresh()} variant="secondary" />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Sign out" onPress={() => void signOut()} variant="danger" />
              </View>
            </View>
            <Button label="Done" onPress={() => router.replace("/")} />
          </Section>
        </>
      ) : (
        <Section title={mode === "login" ? "Email sign in" : "Create account"}>
          <Field label="Provider URL" onChangeText={setBaseUrl} placeholder="https://anybox.com.cn" value={baseUrl} />
          {mode === "register" ? (
            <Field label="Name" keyboardType="default" onChangeText={setName} placeholder="Optional" value={name} />
          ) : null}
          <Field label="Email" keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" value={email} />
          <Field label="Password" onChangeText={setPassword} placeholder="Password" secureTextEntry value={password} />
          {message ? <StateCard title="Account created" detail={message} tone="success" /> : null}
          {error ? <StateCard title="Account failed" detail={error} tone="danger" /> : null}
          <Button
            disabled={!baseUrl.trim() || !email.trim() || !password || (mode === "register" && password.length < 8)}
            label={mode === "login" ? "Sign in" : "Create account"}
            loading={submitting}
            onPress={() => void submit()}
          />
          <Button
            label={mode === "login" ? "Create account" : "I have an account"}
            onPress={() => {
              setMode((current) => (current === "login" ? "register" : "login"))
              setError(null)
              setMessage(null)
            }}
            variant="secondary"
          />
        </Section>
      )}
    </Screen>
  )
}

function ProfileSummary({
  avatarUrl,
  displayName,
  email,
  username,
}: {
  avatarUrl: string
  displayName: string
  email: string
  username: string
}) {
  const name = displayName || username || email

  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        flexDirection: "row",
        gap: theme.spacing.xl,
        padding: theme.spacing.xxl,
      }}
    >
      <Avatar label={name} uri={avatarUrl} />
      <View style={{ flex: 1, gap: theme.spacing.sm, minWidth: 0 }}>
        <View style={{ alignItems: "center", flexDirection: "row", gap: theme.spacing.md }}>
          <Text
            numberOfLines={1}
            selectable
            style={{
              color: theme.colors.text,
              flex: 1,
              fontSize: theme.typography.size.lg,
              fontWeight: theme.typography.weight.heavy,
            }}
          >
            {name}
          </Text>
          <Badge label="Signed in" tone="success" />
        </View>
        {username ? (
          <Text
            numberOfLines={1}
            selectable
            style={{
              color: theme.colors.textSubtle,
              fontSize: theme.typography.size.sm,
              fontWeight: theme.typography.weight.medium,
            }}
          >
            @{username}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          selectable
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.typography.size.sm,
          }}
        >
          {email}
        </Text>
      </View>
    </View>
  )
}

function Avatar({ label, uri }: { label: string; uri: string }) {
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: theme.colors.surfaceSubtle,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        height: 54,
        justifyContent: "center",
        overflow: "hidden",
        width: 54,
      }}
    >
      {uri ? (
        <Image source={{ uri }} style={{ height: "100%", width: "100%" }} />
      ) : (
        <Text
          style={{
            color: theme.colors.textSubtle,
            fontSize: theme.typography.size.lg,
            fontWeight: theme.typography.weight.heavy,
          }}
        >
          {initialsFor(label)}
        </Text>
      )}
    </View>
  )
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.border,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.xxl,
        paddingVertical: theme.spacing.md,
      }}
    >
      {children}
    </View>
  )
}

function InfoRow({
  badgeTone,
  divided,
  title,
  value,
}: {
  badgeTone?: ThemeTone
  divided?: boolean
  title: string
  value: string
}) {
  return (
    <View
      style={{
        alignItems: "center",
        borderColor: theme.colors.border,
        borderTopWidth: divided ? 1 : 0,
        flexDirection: "row",
        gap: theme.spacing.xl,
        justifyContent: "space-between",
        minHeight: 46,
        paddingVertical: theme.spacing.lg,
      }}
    >
      <Text
        style={{
          color: theme.colors.textSubtle,
          flex: 1,
          fontSize: theme.typography.size.sm,
          fontWeight: theme.typography.weight.bold,
        }}
      >
        {title}
      </Text>
      {badgeTone ? (
        <Badge label={value} tone={badgeTone} />
      ) : (
        <Text
          numberOfLines={1}
          selectable
          style={{
            color: theme.colors.text,
            flexShrink: 1,
            fontSize: theme.typography.size.md,
            fontWeight: theme.typography.weight.medium,
            textAlign: "right",
          }}
        >
          {value}
        </Text>
      )}
    </View>
  )
}

function Badge({ label, tone }: { label: string; tone: ThemeTone }) {
  const toneColors = theme.colors.status[tone]
  return (
    <View
      style={{
        backgroundColor: tone === "neutral" ? theme.colors.surfaceSubtle : toneColors.background,
        borderColor: toneColors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          color: toneColors.text,
          fontSize: theme.typography.size.xs,
          fontWeight: theme.typography.weight.bold,
        }}
      >
        {label}
      </Text>
    </View>
  )
}

function flagTone(value: boolean | undefined): ThemeTone {
  if (value === true) return "success"
  if (value === false) return "danger"
  return "neutral"
}

function subscriptionTone(status: string | undefined): ThemeTone {
  const normalized = status?.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_")
  if (normalized === "active" || normalized === "trialing") return "success"
  if (normalized === "past_due" || normalized === "canceled" || normalized === "unpaid") return "danger"
  return "neutral"
}

function initialsFor(value: string) {
  const chunks = value
    .trim()
    .split(/[\s@._-]+/)
    .filter(Boolean)
  if (chunks.length === 0) return "?"
  return chunks
    .slice(0, 2)
    .map((chunk) => chunk.slice(0, 1).toLocaleUpperCase())
    .join("")
}
