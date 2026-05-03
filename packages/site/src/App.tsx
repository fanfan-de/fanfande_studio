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
      {label}
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
          <p>
            开源通用 Agent
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#workflow">
              查看工作流
            </a>
            <a className="button button-secondary" href="#capabilities">
              了解能力
            </a>
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
        <h2>不是再叠一个聊天窗口，而是把开发者和 Agent 协作收进稳定的桌面节奏。</h2>
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
            Anybox 的产品方向很清晰：本地优先、过程可见、执行闭环。后续可以在这里接入下载、内测表单、演示预约或版本更新。
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
        <h2>先把 Anybox 用起来。</h2>
        <p>
          下一步可以为 Anybox 接入真实下载地址、内测申请表或演示预约入口。当前页面已经适合继续打磨成公开产品官网。
        </p>
        <a className="button button-primary" href="#top">
          回到顶部
        </a>
      </section>

      <footer className="site-footer">
        <span>© {year} Anybox</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  )
}
