import { Platform } from "react-native"

export const mobilePlatformLabel = Platform.select({
  android: "Android",
  ios: "iOS",
  default: "Mobile",
}) ?? "Mobile"

export function getMobileDeviceName() {
  return `Anybox ${mobilePlatformLabel}`
}
