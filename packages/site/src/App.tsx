import { useEffect, useState } from "react"
import type { MouseEvent } from "react"
import {
  featureStories,
  navigationItems,
  proofPoints,
  surfaceItems,
  workflowSteps,
} from "./content"
import { GitActivitySection } from "./GitActivity"

const brandLogoBlack = "/brand-logo-black.svg"
const brandLogoWhite = "/brand-logo-white.svg"
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

function FeatureStory({
  title,
  body,
  mediaTitle,
  mediaItems,
}: {
  title: string
  body: string
  mediaTitle: string
  mediaItems: string[]
}) {
  return (
    <article className="feature-story">
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="feature-console" aria-hidden="true">
        <div className="console-title">{mediaTitle}</div>
        <div className="console-list">
          {mediaItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </article>
  )
}

function WorkflowStep({
  index,
  title,
  body,
}: {
  index: string
  title: string
  body: string
}) {
  return (
    <article className="workflow-step">
      <span>{index}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  )
}

function SurfaceItem({
  label,
  title,
  detail,
}: {
  label: string
  title: string
  detail: string
}) {
  return (
    <article className="surface-item">
      <p>{label}</p>
      <h3>{title}</h3>
      <span>{detail}</span>
    </article>
  )
}

export function App() {
  const year = new Date().getFullYear()

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

      <section className="intro-section" id="capabilities">
        <p className="section-kicker">The best way to work with local agents</p>
        <h2>从配置自由度、模型供应商到 Skills 管理，把 Agent 协作收进一套可掌控的桌面工作流。</h2>
      </section>

      <section className="feature-section" aria-label="核心能力">
        {featureStories.map((story) => (
          <FeatureStory key={story.title} {...story} />
        ))}
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-header">
          <p className="section-kicker">One surface, one rhythm</p>
          <h2>从进入项目，到执行任务，再到检查输出，尽量不离开当前桌面。</h2>
        </div>
        <div className="workflow-grid">
          {workflowSteps.map((step) => (
            <WorkflowStep key={step.index} {...step} />
          ))}
        </div>
      </section>

      <section className="surfaces-section" id="surfaces">
        <div className="surfaces-copy">
          <p className="section-kicker">Connected surfaces</p>
          <h2>把桌面壳、Agent 运行时和工具系统接成 Anybox 的持续工作面。</h2>
          <p>
            Anybox 的产品方向很清晰：本地优先、配置开放、多供应商可接入，并把 Skills 作为团队经验沉淀和复用的核心模块。
          </p>
        </div>
        <div className="surface-list">
          {surfaceItems.map((item) => (
            <SurfaceItem key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="launch-section" id="download">
        <div className="launch-brand" aria-hidden="true">
          <img src={brandLogoWhite} alt="" />
          <span>Anybox</span>
        </div>
        <h2>下载 Anybox Windows EA。</h2>
        <p>
          当前 Windows x64 安装包从 GitHub 最新 Release 获取；mac 和 linux 版本仍在开发中。
        </p>
        <a
          className="button button-primary"
          href={windowsInstallerFallbackUrl}
          onClick={downloadLatestWindowsInstaller}
        >
          下载 Windows 安装包
        </a>
      </section>

      <footer className="site-footer">
        <span>© {year} Anybox</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  )
}
