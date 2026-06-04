import * as SecureStore from "expo-secure-store"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { MobileConnection } from "@/api/mobile-api"
import { normalizeConnectionInput } from "@/api/mobile-api"

const BASE_URL_KEY = "anybox.mobile.baseUrl"
const TOKEN_KEY = "anybox.mobile.token"
const DEVICE_ID_KEY = "anybox.mobile.deviceID"
const TRANSPORT_KEY = "anybox.mobile.transport"
const DESKTOP_ID_KEY = "anybox.mobile.desktopID"

interface ConnectionContextValue {
  connection: MobileConnection | null
  loading: boolean
  saveConnection: (endpoint: string, token: string, deviceID?: string, input?: { transport?: MobileConnection["transport"]; desktopID?: string }) => Promise<MobileConnection>
  clearConnection: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [connection, setConnection] = useState<MobileConnection | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    Promise.all([
      SecureStore.getItemAsync(BASE_URL_KEY),
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(DEVICE_ID_KEY),
      SecureStore.getItemAsync(TRANSPORT_KEY),
      SecureStore.getItemAsync(DESKTOP_ID_KEY),
    ])
      .then(([baseUrl, token, deviceID, transport, desktopID]) => {
        if (!mounted) return
        setConnection(baseUrl && token ? {
          baseUrl,
          token,
          ...(deviceID ? { deviceID } : {}),
          ...(transport === "relay" ? { transport } : {}),
          ...(desktopID ? { desktopID } : {}),
        } : null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const saveConnection = useCallback(async (endpoint: string, token: string, deviceID?: string, input?: { transport?: MobileConnection["transport"]; desktopID?: string }) => {
    const normalized = normalizeConnectionInput(endpoint, token)
    const transport = input?.transport ?? normalized.transport
    const desktopID = input?.desktopID ?? normalized.desktopID
    await Promise.all([
      SecureStore.setItemAsync(BASE_URL_KEY, normalized.baseUrl),
      SecureStore.setItemAsync(TOKEN_KEY, normalized.token),
      deviceID ? SecureStore.setItemAsync(DEVICE_ID_KEY, deviceID) : SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      transport ? SecureStore.setItemAsync(TRANSPORT_KEY, transport) : SecureStore.deleteItemAsync(TRANSPORT_KEY),
      desktopID ? SecureStore.setItemAsync(DESKTOP_ID_KEY, desktopID) : SecureStore.deleteItemAsync(DESKTOP_ID_KEY),
    ])
    const nextConnection = {
      ...normalized,
      ...(transport ? { transport } : {}),
      ...(desktopID ? { desktopID } : {}),
      ...(deviceID ? { deviceID } : {}),
    }
    setConnection(nextConnection)
    return nextConnection
  }, [])

  const clearConnection = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(BASE_URL_KEY),
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(TRANSPORT_KEY),
      SecureStore.deleteItemAsync(DESKTOP_ID_KEY),
    ])
    setConnection(null)
  }, [])

  const value = useMemo(
    () => ({
      connection,
      loading,
      saveConnection,
      clearConnection,
    }),
    [clearConnection, connection, loading, saveConnection],
  )

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection() {
  const value = useContext(ConnectionContext)
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider.")
  return value
}
