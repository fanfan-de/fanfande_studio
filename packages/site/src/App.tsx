import { useEffect, useState } from "react"
import type { MouseEvent } from "react"
import { navigationItems, proofPoints } from "./content"
import { GitActivitySection } from "./GitActivity"

const brandLogoBlack = "/brand-logo-black.svg"
const repositoryUrl = "https://github.com/fanfan-de/fanfande_studio"
const latestReleaseApiUrl =
  "https://api.github.com/repos/fanfan-de/fanfande_studio/releases/latest"
const windowsInstallerFallbackUrl = `${repositoryUrl}/releases/latest/download/Fanfande-Studio-0.1.3-x64.exe`

type GitHubReleaseAsset = {
  browser_download_url?: unknown
  name?: unknown
}

type GitHubRelease = {
  assets?: unknown
}

function getGitHubRepoApiUrl(href: string) {
  const match = href.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/)

  if (!match) return undefined

  return `https://api.github.com/repos/${match[1]}/${match[2]}`
}

function getWindowsInstallerUrl(release: GitHubRelease) {
  if (!Array.isArray(release.assets)) return undefined

  const installer = release.assets.find((asset): asset is GitHubReleaseAsset => {
    if (!asset || typeof asset !== "object") return false

    const { browser_download_url: downloadUrl, name } =
      asset as GitHubReleaseAsset

    if (typeof downloadUrl !== "string" || typeof name !== "string") {
      return false
    }

    const normalizedName = name.toLowerCase()

    return (
      normalizedName.endsWith(".exe") &&
      normalizedName.includes("fanfande-studio") &&
      normalizedName.includes("x64")
    )
  })

  return typeof installer?.browser_download_url === "string"
    ? installer.browser_download_url
    : undefined
}

async function resolveLatestWindowsInstallerUrl() {
  const response = await fetch(latestReleaseApiUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub release request failed: ${response.status}`)
  }

  const downloadUrl = getWindowsInstallerUrl(
    (await response.json()) as GitHubRelease,
  )

  if (!downloadUrl) {
    throw new Error("No Windows installer asset found in latest release")
  }

  return downloadUrl
}

async function downloadLatestWindowsInstaller(
  event: MouseEvent<HTMLAnchorElement>,
) {
  event.preventDefault()

  try {
    window.location.assign(await resolveLatestWindowsInstallerUrl())
  } catch {
    window.location.assign(windowsInstallerFallbackUrl)
  }
}

function formatStarCount(count: number) {
  if (count < 1000) return String(count)
  if (count < 10000) return `${(count / 1000).toFixed(1)}K`

  return `${Math.round(count / 1000)}K`
}

function StarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="nav-star-icon"
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    </svg>
  )
}

function GitHubStarCount({ href }: { href: string }) {
  const [starCount, setStarCount] = useState<number | undefined>()

  useEffect(() => {
    const apiUrl = getGitHubRepoApiUrl(href)

    if (!apiUrl) return

    const controller = new AbortController()

    fetch(apiUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
      },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`GitHub star request failed: ${response.status}`)
        }

        return response.json()
      })
      .then((data: { stargazers_count?: unknown }) => {
        if (typeof data.stargazers_count === "number") {
          setStarCount(data.stargazers_count)
        }
      })
      .catch(() => {})

    return () => {
      controller.abort()
    }
  }, [href])

  if (starCount === undefined) return null

  return (
    <span className="nav-star-count" aria-label={`${starCount} GitHub stars`}>
      <span>[{formatStarCount(starCount)}</span>
      <StarIcon />
      <span>]</span>
    </span>
  )
}

function NavigationLink({
  href,
  label,
  external,
}: {
  href: string
  label: string
  external?: boolean
}) {
  return (
    <a
      className="nav-link"
      href={href}
      rel={external ? "noreferrer" : undefined}
      target={external ? "_blank" : undefined}
    >
      <span>{label}</span>
      {label === "GitHub" ? <GitHubStarCount href={href} /> : null}
    </a>
  )
}

function BrandLockup() {
  return (
    <a className="brand-lockup" href="#top" aria-label="Anybox 首页">
      <img src={brandLogoBlack} alt="" />
      <span>Anybox</span>
    </a>
  )
}

function ProductPreview() {
  return (
    <figure className="product-preview" aria-label="Anybox 产品界面预览">
      <div className="preview-toolbar">
        <span>workspace/anybox</span>
        <span>Agent connected</span>
      </div>
      <img src="/product-preview.png" alt="Anybox 桌面工作台界面" />
    </figure>
  )
}

function ProofList() {
  return (
    <ul className="proof-list" aria-label="产品关键信号">
      {proofPoints.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

export function App() {
  return (
    <main className="page-shell" id="top">
      <header className="site-header">
        <BrandLockup />
        <nav className="site-nav" aria-label="页面导航">
          {navigationItems.map((item) => (
            <NavigationLink
              key={item.href}
              href={item.href}
              label={item.label}
              external={"external" in item ? item.external : undefined}
            />
          ))}
        </nav>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="hero-brand">
            <img className="hero-mark" src={brandLogoBlack} alt="" />
            <h1>Anybox</h1>
          </div>
          <p>开源，灵活的通用agent</p>
          <div className="hero-actions">
            <a
              className="button button-primary"
              href={windowsInstallerFallbackUrl}
              onClick={downloadLatestWindowsInstaller}
            >
              win下载
            </a>
            <p className="hero-platform-note">
              当前为EA版本；mac，linux版本开发中
            </p>
          </div>
        </div>
        <div className="hero-visual-grid">
          <GitActivitySection />
          <ProductPreview />
        </div>
        <ProofList />
      </section>
    </main>
  )
}
