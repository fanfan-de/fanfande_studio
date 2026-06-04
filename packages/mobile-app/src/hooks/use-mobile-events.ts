import { useEffect, useRef, useState } from "react"
import EventSource, { type EventSourceListener } from "react-native-sse"
import { isRelayConnection, mobileEventsURL, type MobileConnection, type MobileEventName } from "@/api/mobile-api"

type MobileEventsStatus = "idle" | "connecting" | "connected" | "error"

interface UseMobileEventsInput {
  connection: MobileConnection | null
  enabled: boolean
  onEvent: () => void
}

const REFRESH_EVENTS: MobileEventName[] = [
  "sync.updated",
  "workspace.updated",
  "session.created",
  "session.updated",
  "approval.requested",
  "approval.updated",
]

export function useMobileEvents({ connection, enabled, onEvent }: UseMobileEventsInput) {
  const [status, setStatus] = useState<MobileEventsStatus>("idle")
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!connection || !enabled || isRelayConnection(connection)) {
      setStatus("idle")
      return undefined
    }

    setStatus("connecting")

    const source = new EventSource<MobileEventName>(mobileEventsURL(connection), {
      headers: {
        authorization: `Bearer ${connection.token}`,
      },
      pollingInterval: 5000,
      timeout: 0,
    })

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        onEventRef.current()
      }, 500)
    }

    const handleOpen: EventSourceListener<MobileEventName, "open"> = () => {
      setStatus("connected")
    }

    const handleRefresh: EventSourceListener<MobileEventName, MobileEventName> = () => {
      setStatus("connected")
      scheduleRefresh()
    }

    const handleError: EventSourceListener<MobileEventName, "error"> = () => {
      setStatus("error")
    }

    source.addEventListener("open", handleOpen)
    source.addEventListener("error", handleError)
    for (const eventName of REFRESH_EVENTS) {
      source.addEventListener(eventName, handleRefresh)
    }

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      source.removeAllEventListeners()
      source.close()
    }
  }, [connection, enabled])

  return status
}
