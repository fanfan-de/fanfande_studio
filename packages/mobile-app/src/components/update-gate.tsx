import React, { useEffect } from "react"
import { Alert } from "react-native"
import { checkAppUpdates, formatAppVersionLabel, openBinaryRelease } from "@/services/app-updates"

let promptedForRequiredUpdate = false

export function UpdateGate() {
  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(() => {
      void checkRequiredUpdate()
    }, 2500)

    async function checkRequiredUpdate() {
      if (promptedForRequiredUpdate) return
      const result = await checkAppUpdates({ includeOta: false, includeBinary: true })
      if (cancelled || !result.binary.required || !result.binary.release) return

      promptedForRequiredUpdate = true
      const release = result.binary.release
      Alert.alert(
        "Update required",
        `Anybox Mobile ${formatAppVersionLabel(result.current)} needs to update to ${release.version}.`,
        [
          {
            text: "Update",
            onPress: () => void openBinaryRelease(release),
          },
        ],
        { cancelable: false },
      )
    }

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [])

  return null
}
