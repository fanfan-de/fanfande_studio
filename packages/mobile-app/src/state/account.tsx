import * as SecureStore from "expo-secure-store"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import {
  getDefaultAccountRelayBaseUrl,
  loginAccountWithEmail,
  logoutAccount,
  refreshAccountSession,
  registerAccountWithEmail,
  updateAccountProfile,
  type MobileAccountRegistration,
  type MobileAccountSession,
} from "@/api/account-api"

const ACCOUNT_SESSION_KEY = "anybox.mobile.account.session"
const LEGACY_ACCOUNT_BASE_URL_KEY = "anybox.mobile.account.baseUrl"
const LEGACY_ACCOUNT_TOKEN_KEY = "anybox.mobile.account.token"
const LEGACY_ACCOUNT_USER_KEY = "anybox.mobile.account.user"

interface AccountContextValue {
  account: MobileAccountSession | null
  loading: boolean
  defaultBaseUrl: string
  loginWithEmail: (input: { baseUrl: string; email: string; password: string }) => Promise<MobileAccountSession>
  registerWithEmail: (input: { baseUrl: string; email: string; password: string; name?: string }) => Promise<MobileAccountRegistration>
  updateProfile: (input: { displayName?: string | null; username?: string | null; avatarUrl?: string | null }) => Promise<MobileAccountSession>
  refreshAccount: () => Promise<MobileAccountSession | null>
  clearAccount: () => Promise<void>
}

const AccountContext = createContext<AccountContextValue | undefined>(undefined)

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<MobileAccountSession | null>(null)
  const [loading, setLoading] = useState(true)
  const defaultBaseUrl = useMemo(() => getDefaultAccountRelayBaseUrl(), [])

  const saveAccount = useCallback(async (nextAccount: MobileAccountSession) => {
    await persistAccountSession(nextAccount)
    setAccount(nextAccount)
    return nextAccount
  }, [])

  useEffect(() => {
    let mounted = true
    loadStoredAccountSession()
      .then(async (storedAccount) => {
        if (!storedAccount) return null
        if (!shouldRefresh(storedAccount)) return storedAccount
        const refreshed = await refreshAccountSession(storedAccount.baseUrl, storedAccount.refreshToken).catch(() => storedAccount)
        if (refreshed !== storedAccount) await persistAccountSession(refreshed)
        return refreshed
      })
      .then((nextAccount) => {
        if (!mounted) return
        setAccount(nextAccount)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const loginWithEmail = useCallback(
    async (input: { baseUrl: string; email: string; password: string }) => {
      const nextAccount = await loginAccountWithEmail(input)
      return saveAccount(nextAccount)
    },
    [saveAccount],
  )

  const registerWithEmail = useCallback(
    async (input: { baseUrl: string; email: string; password: string; name?: string }) => {
      return registerAccountWithEmail(input)
    },
    [],
  )

  const clearAccount = useCallback(async () => {
    const currentAccount = account
    await Promise.all([
      SecureStore.deleteItemAsync(ACCOUNT_SESSION_KEY),
      SecureStore.deleteItemAsync(LEGACY_ACCOUNT_BASE_URL_KEY),
      SecureStore.deleteItemAsync(LEGACY_ACCOUNT_TOKEN_KEY),
      SecureStore.deleteItemAsync(LEGACY_ACCOUNT_USER_KEY),
      currentAccount ? logoutAccount(currentAccount.baseUrl, currentAccount.token).catch(() => undefined) : Promise.resolve(),
    ])
    setAccount(null)
  }, [account])

  const updateProfile = useCallback(
    async (input: { displayName?: string | null; username?: string | null; avatarUrl?: string | null }) => {
      const currentAccount = account ?? (await loadStoredAccountSession())
      if (!currentAccount) throw new Error("No account is signed in.")
      const updated = await updateAccountProfile(currentAccount, input)
      return saveAccount(updated)
    },
    [account, saveAccount],
  )

  const refreshAccount = useCallback(async () => {
    const currentAccount = account ?? (await loadStoredAccountSession())
    if (!currentAccount) {
      setAccount(null)
      return null
    }
    const refreshed = await refreshAccountSession(currentAccount.baseUrl, currentAccount.refreshToken)
    await persistAccountSession(refreshed)
    setAccount(refreshed)
    return refreshed
  }, [account])

  const value = useMemo(
    () => ({
      account,
      loading,
      defaultBaseUrl,
      loginWithEmail,
      registerWithEmail,
      updateProfile,
      refreshAccount,
      clearAccount,
    }),
    [account, clearAccount, defaultBaseUrl, loading, loginWithEmail, refreshAccount, registerWithEmail, updateProfile],
  )

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
}

export function useAccount() {
  const value = useContext(AccountContext)
  if (!value) throw new Error("useAccount must be used inside AccountProvider.")
  return value
}

function parseStoredJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

async function persistAccountSession(account: MobileAccountSession) {
  await SecureStore.setItemAsync(ACCOUNT_SESSION_KEY, JSON.stringify(account))
}

async function loadStoredAccountSession() {
  const rawSession = await SecureStore.getItemAsync(ACCOUNT_SESSION_KEY)
  const session = normalizeStoredAccountSession(rawSession ? parseStoredJson(rawSession) : null)
  if (session) return session

  const [baseUrl, token, rawUser] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_ACCOUNT_BASE_URL_KEY),
    SecureStore.getItemAsync(LEGACY_ACCOUNT_TOKEN_KEY),
    SecureStore.getItemAsync(LEGACY_ACCOUNT_USER_KEY),
  ])
  const legacyUser = readRecord(rawUser ? parseStoredJson(rawUser) : null)
  if (!baseUrl || !token || !legacyUser || typeof legacyUser.email !== "string") return null
  return null
}

function normalizeStoredAccountSession(value: unknown): MobileAccountSession | null {
  const record = readRecord(value)
  const user = readRecord(record?.user)
  const email = typeof user?.email === "string" ? user.email : ""
  if (
    typeof record?.baseUrl !== "string" ||
    typeof record?.token !== "string" ||
    typeof record?.refreshToken !== "string" ||
    !email
  ) {
    return null
  }
  return record as unknown as MobileAccountSession
}

function shouldRefresh(account: MobileAccountSession) {
  return Boolean(account.expiresAt && account.expiresAt <= Date.now() + 60_000)
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}
