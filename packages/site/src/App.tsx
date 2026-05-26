import { useEffect, useState } from "react"
import { navigationItems, proofPoints } from "./content"
import { GitActivitySection } from "./GitActivity"
import { InstallerDownloadButton } from "./InstallerDownloadButton"
import { repositoryUrl } from "./releaseDownloads"

const brandLogoBlack = "/brand-logo-black.svg"
const wechatCommunityQrImage = "/wechat-community-qr-20260525.png"

function getGitHubRepoApiUrl(href: string) {
  const match = href.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)/)

  if (!match) return undefined

  return `https://api.github.com/repos/${match[1]}/${match[2]}`
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

function ProductCommunityQr() {
  return (
    <section className="community-qr-section" id="product">
      <img className="community-qr-image" src={wechatCommunityQrImage} alt="" />
    </section>
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
            <InstallerDownloadButton
              className="button button-primary"
              platform="windows"
            >
              Windows 下载
            </InstallerDownloadButton>
            <InstallerDownloadButton
              className="button button-secondary"
              platform="mac"
            >
              macOS 下载
            </InstallerDownloadButton>
            <p className="hero-platform-note">
              当前提供 Windows x64 与 macOS Apple Silicon；Linux 版本开发中
            </p>
          </div>
        </div>
        <div className="hero-visual-grid">
          <GitActivitySection />
          <ProductPreview />
        </div>
        <ProofList />
      </section>
      <ProductCommunityQr />
    </main>
  )
}
