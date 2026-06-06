import { AccountApiError, type MobileAccountSession } from "@/api/account-api"

export function formatAccountPlanLabel(account: MobileAccountSession | null | undefined) {
  if (!account) return "Guest"
  return account.planLabel ?? formatPlanCode(account.planType ?? account.subscription?.planCode) ?? "Personal"
}

export function formatSubscriptionStatus(account: MobileAccountSession | null | undefined) {
  const status = account?.subscription?.status
  if (!status) return "Unknown"
  return formatPlanCode(status) ?? status
}

export function formatEntitlementFlag(value: boolean | undefined) {
  if (value === true) return "Enabled"
  if (value === false) return "Disabled"
  return "Unknown"
}

export function formatDeviceLimit(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${value}` : "Unknown"
}

export function buildEntitlementDetail(account: MobileAccountSession | null | undefined) {
  if (!account) return "Sign in to sync workspace entitlements."
  const entitlements = account.entitlements
  if (!entitlements) return "Entitlements have not synced yet."
  return [
    `Relay: ${formatEntitlementFlag(entitlements.relayEnabled)}`,
    `Model gateway: ${formatEntitlementFlag(entitlements.modelGatewayEnabled)}`,
    `Desktop devices: ${formatDeviceLimit(entitlements.maxDesktopDevices)}`,
    `Mobile devices: ${formatDeviceLimit(entitlements.maxMobileDevices)}`,
  ].join("\n")
}

export function isRelayDisabledByEntitlement(account: MobileAccountSession | null | undefined) {
  return account?.entitlements?.relayEnabled === false
}

export function describeAccountApiError(error: unknown, fallback: string) {
  if (error instanceof AccountApiError) {
    if (error.code === "relay_disabled") {
      return "当前套餐不支持 Relay。请在管理后台启用 Relay 权益后重试。"
    }
    if (error.code === "device_limit_exceeded") {
      return "设备数量已达上限。请移除旧设备，或在管理后台提高设备上限后重试。"
    }
    if (error.code === "model_gateway_disabled") {
      return "当前 workspace 没有模型网关权限。请在管理后台启用模型网关权益后重试。"
    }
    return error.message || fallback
  }
  return error instanceof Error ? error.message : fallback
}

function formatPlanCode(value: string | undefined) {
  const normalized = value?.trim()
  if (!normalized) return undefined
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toLocaleUpperCase()}${part.slice(1).toLocaleLowerCase()}`)
    .join(" ")
}
