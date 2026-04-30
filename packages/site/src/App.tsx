import {
  featureStories,
  navigationItems,
  proofPoints,
  surfaceItems,
  workflowSteps,
} from "./content"

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
    <a className="brand-lockup" href="#top" aria-label="Fanfande Studio 首页">
      <img src="/brand-mark.svg" alt="" />
      <span>Fanfande Studio</span>
    </a>
  )
}

function ProductPreview() {
  return (
    <figure className="product-preview" aria-label="Fanfande Studio 产品界面预览">
      <div className="preview-toolbar">
        <span>workspace/fanfande_studio</span>
        <span>Agent connected</span>
      </div>
      <img src="/product-preview.png" alt="Fanfande Studio 桌面工作台界面" />
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
          <h1>Fanfande Studio</h1>
          <p>
            面向本地项目工作的 AI Agent 桌面工作台。把项目目录、会话、终端、权限确认和工具调用放进同一个产品界面里。
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
        <ProductPreview />
        <ProofList />
      </section>

      <section className="intro-section" id="capabilities">
        <p className="section-kicker">The best way to work with local agents</p>
        <h2>不是再叠一个聊天窗口，而是重做开发者和 Agent 协作的桌面节奏。</h2>
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
          <h2>把桌面壳、Agent 运行时和工具系统接成一个可持续工作的产品。</h2>
          <p>
            官网先讲清楚产品方向：本地优先、过程可见、执行闭环。后续可以在这里接入下载、内测表单、演示预约或版本更新。
          </p>
        </div>
        <div className="surface-list">
          {surfaceItems.map((item) => (
            <SurfaceItem key={item.label} {...item} />
          ))}
        </div>
      </section>

      <section className="launch-section" id="download">
        <h2>先把本地 AI 工作台用起来。</h2>
        <p>
          下一步可以把这里替换成真实下载地址、内测申请表或演示预约入口。当前页面已经适合继续打磨成公开产品官网。
        </p>
        <a className="button button-primary" href="#top">
          回到顶部
        </a>
      </section>

      <footer className="site-footer">
        <span>© {year} Fanfande Studio</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  )
}
