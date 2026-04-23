import {
  architectureItems,
  featureItems,
  navigationItems,
  proofPoints,
  workflowSteps,
} from "./content"

function NavigationLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="nav-link" href={href}>
      {label}
    </a>
  )
}

function ProofPoint({ text }: { text: string }) {
  return (
    <li className="proof-point">
      <span className="proof-dot" aria-hidden="true" />
      <span>{text}</span>
    </li>
  )
}

function FeatureItem({
  id,
  title,
  body,
  detail,
}: {
  id: string
  title: string
  body: string
  detail: string
}) {
  return (
    <article className="feature-item">
      <p className="feature-index">{id}</p>
      <h3>{title}</h3>
      <p>{body}</p>
      <p className="feature-detail">{detail}</p>
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
      <p className="workflow-index">{index}</p>
      <div>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
    </article>
  )
}

function ArchitectureRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="architecture-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  )
}

function HeroVisual() {
  return (
    <div className="hero-visual" aria-hidden="true">
      <div className="hero-aura hero-aura-primary" />
      <div className="hero-aura hero-aura-secondary" />
      <div className="hero-orbit hero-orbit-left">Workspace aware</div>
      <div className="hero-orbit hero-orbit-right">Agent + Terminal</div>
      <div className="hero-preview">
        <aside className="preview-rail">
          <div className="preview-mark">
            <img src="/brand-mark.svg" alt="" />
            <span>Fanfande</span>
          </div>
          <div className="preview-rail-stack">
            <span>Project</span>
            <span>Sessions</span>
            <span>Tools</span>
            <span>Settings</span>
          </div>
        </aside>
        <div className="preview-main">
          <div className="preview-topline">
            <span>local/workspace/fanfande_studio</span>
            <span>Agent Connected</span>
          </div>
          <div className="preview-thread">
            <div className="thread-chip thread-chip-primary">Workspace context synced</div>
            <div className="thread-bubble thread-bubble-user">请分析当前项目结构，并准备产品首页。</div>
            <div className="thread-bubble thread-bubble-agent">已加载目录、终端与前端包结构，开始生成页面骨架。</div>
            <div className="thread-actions">
              <span>tool call: shell</span>
              <span>tool call: apply_patch</span>
              <span>patch ready</span>
            </div>
          </div>
          <div className="preview-terminal">
            <p>$ pnpm --filter fanfande-site dev</p>
            <p>VITE v7 ready in 420ms</p>
            <p>Local: http://127.0.0.1:4173</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const year = new Date().getFullYear()

  return (
    <main className="page-shell" id="top">
      <section className="hero-section">
        <header className="site-header">
          <a className="brand-lockup" href="#top" aria-label="Fanfande Studio 首页">
            <img src="/brand-mark.svg" alt="" />
            <div>
              <strong>Fanfande Studio</strong>
              <span>Local-first AI workspace</span>
            </div>
          </a>
          <nav className="site-nav" aria-label="页面导航">
            {navigationItems.map((item) => (
              <NavigationLink key={item.href} href={item.href} label={item.label} />
            ))}
          </nav>
        </header>

        <div className="hero-layout">
          <div className="hero-copy">
            <p className="eyebrow">AI Agent Desktop Workspace</p>
            <h1>把本地项目、终端与 AI Agent 收进同一块工作台。</h1>
            <p className="hero-description">
              Fanfande Studio 面向真实的本地项目流转而设计，让工作区、会话、工具调用、权限确认和终端回显停留在同一视线里。
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#workflow">
                查看工作流
              </a>
              <a className="button button-secondary" href="#features">
                核心能力
              </a>
            </div>
            <ul className="proof-list">
              {proofPoints.map((item) => (
                <ProofPoint key={item} text={item} />
              ))}
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="content-section" id="features">
        <div className="section-heading">
          <p className="eyebrow">Why It Feels Different</p>
          <h2>不是再叠加一个聊天入口，而是重做整个本地工作节奏。</h2>
          <p>
            第一版产品页需要先把差异讲清楚。这里把产品价值压缩为三个判断标准：上下文是否稳定、过程是否可见、执行是否闭环。
          </p>
        </div>
        <div className="feature-grid">
          {featureItems.map((item) => (
            <FeatureItem key={item.id} {...item} />
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="section-heading section-heading-compact">
          <p className="eyebrow">One Surface, One Rhythm</p>
          <h2>从进入项目，到让 Agent 执行，再到校验输出，尽量不离开当前桌面。</h2>
        </div>
        <div className="workflow-layout">
          <div className="workflow-list">
            {workflowSteps.map((step) => (
              <WorkflowStep key={step.index} {...step} />
            ))}
          </div>
          <aside className="workflow-sidepanel">
            <p className="workflow-panel-title">Product framing</p>
            <h3>适合做官网首屏的四个技术信号</h3>
            <ul className="architecture-list">
              {architectureItems.map((item) => (
                <ArchitectureRow key={item.label} {...item} />
              ))}
            </ul>
            <div className="panel-command">
              <span>Suggested CTA</span>
              <strong>先把品牌和工作流讲清楚，再接下载、内测或演示入口。</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="cta-section" id="launch">
        <p className="eyebrow">Launch Ready</p>
        <h2>把产品入口页先立住，再把下载、表单或预约接上去。</h2>
        <p>
          这版首页已经把品牌、价值和核心工作流串起来了。下一步你只需要替换真实 CTA，例如下载地址、内测表单或演示预约链接。
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href="#top">
            回到首屏
          </a>
          <a className="button button-secondary" href="#features">
            再看能力
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <span>© {year} Fanfande Studio</span>
        <span>Workspace-first AI product landing page</span>
      </footer>
    </main>
  )
}
