import type { MobileAccountRelayDesktop } from "@/api/account-api"
import type { MobileConnection, MobileSessionSummary, MobileStatus } from "@/api/mobile-api"

export function formatProviderStatus({
  accountDesktopsLoading,
  connectingDesktopID,
  connection,
  onlineDesktops,
  status,
}: {
  accountDesktopsLoading: boolean
  connectingDesktopID: string | null
  connection: MobileConnection | null
  onlineDesktops: MobileAccountRelayDesktop[]
  status: MobileStatus | null
}) {
  if (connection) {
    const name = status?.desktopName?.trim() || "Desktop"
    if (status?.online) {
      return {
        label: "Connected",
        detail: status.appVersion ? `${name} ${status.appVersion}` : name,
        tone: "success" as const,
      }
    }
    return {
      label: "Checking",
      detail: connection.transport === "relay" ? "Relay connection is saved." : connection.baseUrl,
      tone: "neutral" as const,
    }
  }

  if (connectingDesktopID) {
    return {
      label: "Connecting",
      detail: "Preparing the AnyboxProvider bridge.",
      tone: "neutral" as const,
    }
  }

  if (accountDesktopsLoading) {
    return {
      label: "Searching",
      detail: "Looking for desktop devices signed in to this account.",
      tone: "neutral" as const,
    }
  }

  if (onlineDesktops.length) {
    return {
      label: "Available",
      detail: onlineDesktops.length === 1 ? `${onlineDesktops[0].name} is online.` : `${onlineDesktops.length} desktops are online.`,
      tone: "neutral" as const,
    }
  }

  return {
    label: "Offline",
    detail: "Start Anybox on the desktop to connect.",
    tone: "danger" as const,
  }
}

export function sortSessions(sessions: MobileSessionSummary[]) {
  return [...sessions].sort((left, right) => right.updated - left.updated)
}

export function buildSessionTitle(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim())?.trim() || "Mobile chat"
  return firstLine.length > 48 ? `${firstLine.slice(0, 45)}...` : firstLine
}
