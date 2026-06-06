import { useRouter } from "expo-router"
import React, { useEffect, useMemo, useState } from "react"
import { Alert, View } from "react-native"
import { Button } from "@/components/button"
import { Field } from "@/components/field"
import { Screen } from "@/components/screen"
import { Section } from "@/components/section"
import { StateCard } from "@/components/state-card"
import { useAccount } from "@/state/account"
import {
  buildEntitlementDetail,
  describeAccountApiError,
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

  const accountDetail = useMemo(() => {
    if (!account) return undefined
    return [
      account.user.displayName || account.user.name ? `Name: ${account.user.displayName ?? account.user.name}` : null,
      account.user.username ? `Username: ${account.user.username}` : null,
      account.user.email,
      account.workspace?.name ? `Workspace: ${account.workspace.name}` : null,
      `Plan: ${formatAccountPlanLabel(account)}`,
      `Subscription: ${formatSubscriptionStatus(account)}`,
      buildEntitlementDetail(account),
    ]
      .filter(Boolean)
      .join("\n")
  }, [account])

  useEffect(() => {
    if (!account) return
    setProfileName(account.user.displayName ?? account.user.name ?? "")
    setProfileUsername(account.user.username ?? "")
    setProfileAvatarUrl(account.user.avatarUrl ?? "")
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
    Alert.alert("Sign out?", "This removes the Anybox Provider token from this phone.", [
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
    } catch (profileError) {
      setError(describeAccountApiError(profileError, "Unable to save profile."))
    } finally {
      setSubmitting(false)
    }
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
        <Section title="Anybox Provider">
          <StateCard title="Signed in" detail={accountDetail} tone="success" />
          {message ? <StateCard title="Account updated" detail={message} tone="success" /> : null}
          {error ? <StateCard title="Account failed" detail={error} tone="danger" /> : null}
          <Field label="Display name" keyboardType="default" onChangeText={setProfileName} placeholder="Name shown in Anybox" value={profileName} />
          <Field label="Username" keyboardType="default" onChangeText={setProfileUsername} placeholder="lowercase_username" value={profileUsername} />
          <Field label="Avatar URL" keyboardType="url" onChangeText={setProfileAvatarUrl} placeholder="https://example.com/avatar.png" value={profileAvatarUrl} />
          <Button label="Save profile" loading={submitting} onPress={() => void saveProfile()} variant="secondary" />
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
