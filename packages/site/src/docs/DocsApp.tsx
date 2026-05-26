import { useEffect, useMemo, useState } from "react"
import { marked, Renderer } from "marked"
import {
  docsArticles,
  docsSections,
  getDocsArticle,
  type DocsArticle,
} from "./docsContent"
import { InstallerDownloadButton } from "../InstallerDownloadButton"
import { repositoryUrl } from "../releaseDownloads"

const brandLogoBlack = "/brand-logo-black.svg"

type DocsHeading = {
  id: string
  level: number
  text: string
}

function getSlugFromUrl() {
  return new URLSearchParams(window.location.search).get("doc")
}

function cleanHeadingText(text: string) {
  return text
    .replace(/\s+#+$/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .trim()
}

function slugifyHeading(text: string) {
  return (
    cleanHeadingText(text)
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  )
}

function extractHeadings(markdown: string) {
  const seen = new Map<string, number>()
  const headings: DocsHeading[] = []
  const headingPattern = /^(#{1,6})\s+(.+)$/gm

  for (const match of markdown.matchAll(headingPattern)) {
    const level = match[1].length
    const text = cleanHeadingText(match[2])
    const baseId = slugifyHeading(text)
    const count = seen.get(baseId) ?? 0
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`

    seen.set(baseId, count + 1)
    headings.push({ id, level, text })
  }

  return headings
}

function renderMarkdown(markdown: string, headings: DocsHeading[]) {
  const renderer = new Renderer()
  let headingIndex = 0

  renderer.heading = ({ tokens, depth }) => {
    const text = renderer.parser.parseInline(tokens)
    const id = headings[headingIndex]?.id
    headingIndex += 1

    if (!id) return `<h${depth}>${text}</h${depth}>`

    return `<h${depth} id="${id}">${text}</h${depth}>`
  }

  return marked.parse(markdown, {
    async: false,
    gfm: true,
    renderer,
  })
}

function useCurrentArticle() {
  const [requestedSlug, setRequestedSlug] = useState(() => getSlugFromUrl())
  const currentArticle = getDocsArticle(requestedSlug) ?? docsArticles[0]

  useEffect(() => {
    const handleLocationChange = () => setRequestedSlug(getSlugFromUrl())

    window.addEventListener("popstate", handleLocationChange)

    return () => {
      window.removeEventListener("popstate", handleLocationChange)
    }
  }, [])

  function navigateToArticle(article: DocsArticle) {
    const url = new URL(window.location.href)

    url.searchParams.set("doc", article.slug)
    url.hash = ""
    window.history.pushState({}, "", `${url.pathname}${url.search}`)
    setRequestedSlug(article.slug)
    window.scrollTo({ top: 0 })
  }

  return {
    currentArticle,
    navigateToArticle,
  }
}

function DocsHeader() {
  return (
    <header className="site-header docs-header">
      <a className="brand-lockup" href="/" aria-label="返回 Anybox 首页">
        <img src={brandLogoBlack} alt="" />
        <span>Anybox</span>
      </a>
      <nav className="docs-header-nav" aria-label="文档导航">
        <a href="/">首页</a>
        <a href={repositoryUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
        <InstallerDownloadButton
          className="button button-primary docs-download-button"
          platform="windows"
        >
          Windows 下载
        </InstallerDownloadButton>
        <InstallerDownloadButton
          className="button button-secondary docs-download-button"
          platform="mac"
        >
          macOS 下载
        </InstallerDownloadButton>
      </nav>
    </header>
  )
}

function DocsSidebar({
  currentArticle,
  onSelectArticle,
}: {
  currentArticle: DocsArticle
  onSelectArticle: (article: DocsArticle) => void
}) {
  return (
    <aside className="docs-sidebar" aria-label="文档目录">
      <div className="docs-sidebar-inner">
        <p>文档</p>
        {docsSections.map((section) => (
          <div className="docs-nav-section" key={section.title}>
            <span>{section.title}</span>
            {section.items.map((article) => (
              <button
                className={
                  article.slug === currentArticle.slug
                    ? "docs-nav-link is-active"
                    : "docs-nav-link"
                }
                key={article.slug}
                onClick={() => onSelectArticle(article)}
                type="button"
              >
                <strong>{article.title}</strong>
              </button>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}

function DocsMobileNav({
  currentArticle,
  onSelectArticle,
}: {
  currentArticle: DocsArticle
  onSelectArticle: (article: DocsArticle) => void
}) {
  return (
    <label className="docs-mobile-nav">
      <span>当前文档</span>
      <select
        value={currentArticle.slug}
        onChange={(event) => {
          const article = getDocsArticle(event.target.value)
          if (article) onSelectArticle(article)
        }}
      >
        {docsArticles.map((article) => (
          <option key={article.slug} value={article.slug}>
            {article.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function DocsToc({ headings }: { headings: DocsHeading[] }) {
  const tocHeadings = headings.filter(
    (heading) => heading.level === 2 || heading.level === 3,
  )

  return (
    <aside className="docs-toc" aria-label="本页目录">
      <div>
        <p>本页目录</p>
        {tocHeadings.length > 0 ? (
          <nav>
            {tocHeadings.map((heading) => (
              <a
                className={heading.level === 3 ? "is-nested" : undefined}
                href={`#${heading.id}`}
                key={heading.id}
              >
                {heading.text}
              </a>
            ))}
          </nav>
        ) : (
          <span>暂无目录</span>
        )}
      </div>
    </aside>
  )
}

export function DocsApp() {
  const { currentArticle, navigateToArticle } = useCurrentArticle()
  const headings = useMemo(
    () => extractHeadings(currentArticle.content),
    [currentArticle.content],
  )
  const articleHtml = useMemo(
    () => renderMarkdown(currentArticle.content, headings),
    [currentArticle.content, headings],
  )

  useEffect(() => {
    document.title = `${currentArticle.title} - Anybox 文档`
  }, [currentArticle.title])

  return (
    <main className="docs-page-shell" id="top">
      <DocsHeader />
      <div className="docs-layout">
        <DocsSidebar
          currentArticle={currentArticle}
          onSelectArticle={navigateToArticle}
        />
        <div className="docs-main-column">
          <DocsMobileNav
            currentArticle={currentArticle}
            onSelectArticle={navigateToArticle}
          />
          <article
            className="docs-content"
            dangerouslySetInnerHTML={{ __html: articleHtml }}
          />
        </div>
        <DocsToc headings={headings} />
      </div>
    </main>
  )
}
