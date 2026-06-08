import { useEffect, useState } from "react"
import type { MouseEvent, ReactNode } from "react"
import {
  currentProductVersion,
  installerFallbackUrls,
  navigateToLatestInstaller,
  resolveLatestReleaseVersion,
  type InstallerPlatform,
} from "./releaseDownloads"

async function downloadLatestInstaller(
  event: MouseEvent<HTMLAnchorElement>,
  platform: InstallerPlatform,
) {
  event.preventDefault()
  await navigateToLatestInstaller(platform)
}

function useLatestReleaseVersion(platform: InstallerPlatform) {
  const [releaseVersion, setReleaseVersion] = useState(currentProductVersion)

  useEffect(() => {
    let ignoreResult = false

    resolveLatestReleaseVersion(platform)
      .then((version) => {
        if (!ignoreResult) setReleaseVersion(version)
      })
      .catch(() => {})

    return () => {
      ignoreResult = true
    }
  }, [platform])

  return releaseVersion
}

export function InstallerDownloadButton({
  children,
  className,
  platform,
}: {
  children: ReactNode
  className: string
  platform: InstallerPlatform
}) {
  const releaseVersion = useLatestReleaseVersion(platform)

  return (
    <a
      className={className}
      href={installerFallbackUrls[platform]}
      onClick={(event) => void downloadLatestInstaller(event, platform)}
    >
      <span>{children}</span>
      {releaseVersion ? (
        <span className="button-version">{releaseVersion}</span>
      ) : null}
    </a>
  )
}
