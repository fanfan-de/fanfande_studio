import { useEffect, useRef, useState } from "react"
import EventSource, { type EventSourceListener } from "react-native-sse"
import { isRelayConnection, type MobileConnection } from "@/api/mobile-api"

type SessionEventStatus = "idle" | "connecting" | "connected" | "error"

interface UseSessionEventsInput {
  connection: MobileConnection | null
  sessionID: string
  enabled: boolean
  onRuntimeEvent: () => void
}

export function useSessionEvents({ connection, enabled, onRuntimeEvent, sessionID }: UseSessionEventsInput) {
  const [status, setStatus] = useState<SessionEventStatus>("idle")
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onRuntimeEventRef = useRef(onRuntimeEvent)

  useEffect(() => {
    onRuntimeEventRef.current = onRuntimeEvent
  }, [onRuntimeEvent])

  useEffect(() => {
    if (!connection || !enabled || !sessionID || isRelayConnection(connection)) {
      setStatus("idle")
      return undefined
    }

    setStatus("connecting")

    const url = `${connection.baseUrl}/api/mobile/sessions/${encodeURIComponent(sessionID)}/events/stream`
    const source = new EventSource<"runtime">(url, {
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
        onRuntimeEventRef.current()
      }, 350)
    }

    const handleOpen: EventSourceListener<"runtime", "open"> = () => {
      setStatus("connected")
    }

    const handleRuntime: EventSourceListener<"runtime", "runtime"> = () => {
      setStatus("connected")
      scheduleRefresh()
    }

    const handleError: EventSourceListener<"runtime", "error"> = () => {
      setStatus("error")
    }

    source.addEventListener("open", handleOpen)
    source.addEventListener("runtime", handleRuntime)
    source.addEventListener("error", handleError)

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      source.removeAllEventListeners()
      source.close()
    }
  }, [connection, enabled, sessionID])

  return status
}
