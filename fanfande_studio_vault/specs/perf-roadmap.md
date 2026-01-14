## Performance roadmap

Sequenced delivery plan for app scalability + maintainability

---

### Objective

Deliver the top 5 app improvements (performance + long-term flexibility) in a safe, incremental sequence that:

- minimizes regression risk
- keeps changes reviewable (small PRs)
- provides escape hatches (flags / caps)
- validates improvements with targeted measurements

This roadmap ties together:

- `specs/01-persist-payload-limits.md`
- `specs/02-cache-eviction.md`
- `specs/03-request-throttling.md`
- `specs/04-scroll-spy-optimization.md`
- `specs/05-modularize-and-dedupe.md`

---

### Guiding principles

- Prefer “guardrails first”: add caps/limits and do no harm, then optimize.
- Always ship behind flags if behavior changes (especially persistence and eviction).
- Optimize at chokepoints (SDK call wrappers, storage wrappers, scroll-spy module) instead of fixing symptoms at every call site.
- Make “hot paths” explicitly measurable in dev (e.g. via `packages/app/src/utils/perf.ts`).

---

### Phase 0 — Baseline + flags (prep)

**Goal:** make later changes safe to land and easy to revert.

**Deliverables**

- Feature-flag plumbing for:
  - persistence payload limits (`persist.payloadLimits`)
  - request debouncing/latest-only (`requests.*`)
  - cache eviction (`cache.eviction.*`)
  - optimized scroll spy (`session.scrollSpyOptimized`)
  - shared scoped cache (`scopedCache.shared`)
- Dev-only counters/logs for:
  - persist oversize detections
  - request aborts/stale drops
  - eviction counts and retained sizes
  - scroll-spy compute time per second

**Exit criteria**

- Flags exist but default “off” for behavior changes.
- No user-visible behavior changes.

**Effort / risk**: `S–M` / low

---

### Phase 1 — Stop the worst “jank generators” (storage + request storms)

**Goal:** remove the highest-frequency sources of main-thread blocking and redundant work.

**Work items**

- Implement file search debounce + stale-result protection
  - Spec: `specs/03-request-throttling.md`
  - Start with file search only (lowest risk, easy to observe).
- Add persistence payload size checks + warnings (no enforcement yet)
  - Spec: `specs/01-persist-payload-limits.md`
  - Focus on detecting oversized keys and preventing repeated write attempts.
- Ship prompt-history “strip image dataUrl” behind a flag
  - Spec: `specs/01-persist-payload-limits.md`
  - Keep image metadata placeholders so UI remains coherent.

**Exit criteria**

- Fast typing in file search generates at most 1 request per debounce window.
- Oversize persisted keys are detected and do not cause repeated blocking writes.
- Prompt history reload does not attempt to restore base64 `dataUrl` on web when flag enabled.

**Effort / risk**: `M` / low–med

---

### Phase 2 — Bound memory growth (in-memory eviction)

**Goal:** stabilize memory footprint for long-running sessions and “project hopping”.

**Work items**

- Introduce shared LRU/TTL cache helper
  - Spec: `specs/02-cache-eviction.md`
- Apply eviction to file contents cache first
  - Spec: `specs/02-cache-eviction.md`
  - Pin open tabs / active file to prevent flicker.
- Add conservative eviction for global-sync per-directory child stores
  - Spec: `specs/02-cache-eviction.md`
  - Ensure evicted children are fully disposed.
- (Optional) session/message eviction if memory growth persists after the above
  - Spec: `specs/02-cache-eviction.md`

**Exit criteria**

- Opening many files does not continuously increase JS heap without bound.
- Switching across many directories does not keep all directory stores alive indefinitely.
- Eviction never removes currently active session/file content.

**Effort / risk**: `M–L` / med

---

### Phase 3 — Large session scroll scalability (scroll spy)

**Goal:** keep scrolling smooth as message count increases.

**Work items**

- Extract scroll-spy logic into a dedicated module (no behavior change)
  - Spec: `specs/04-scroll-spy-optimization.md`
- Implement IntersectionObserver tracking behind flag
  - Spec: `specs/04-scroll-spy-optimization.md`
- Add binary search fallback for non-observer environments
  - Spec: `specs/04-scroll-spy-optimization.md`

**Exit criteria**

- Scroll handler no longer calls `querySelectorAll('[data-message-id]')` on every scroll tick.
- Long sessions (hundreds of messages) maintain smooth scrolling.
- Active message selection remains stable during streaming/layout shifts.

**Effort / risk**: `M` / med

---

### Phase 4 — “Make it easy to keep fast” (modularity + dedupe)

**Goal:** reduce maintenance cost and make future perf work cheaper.

**Work items**

- Introduce shared scoped-cache utility and adopt in one low-risk area
  - Spec: `specs/05-modularize-and-dedupe.md`
- Incrementally split mega-components (one PR per extraction)
  - Spec: `specs/05-modularize-and-dedupe.md`
  - Prioritize extracting:
    - session scroll/backfill logic
    - prompt editor model/history
    - layout event/shortcut wiring
- Remove duplicated patterns after confidence + one release cycle

**Exit criteria**

- Each mega-file drops below a target size (suggestion):
  - `session.tsx` < ~800 LOC
  - `prompt-input.tsx` < ~900 LOC
- “Scoped cache” has a single implementation used across contexts.
- Future perf fixes land in isolated modules with minimal cross-cutting change.

**Effort / risk**: `L` / med–high

---

### Recommended PR slicing (keeps reviews safe)

- PR A: add request helpers + file search debounce (flagged)
- PR B: persist size detection + logs (no behavior change)
- PR C: prompt history strip images (flagged)
- PR D: cache helper + file content eviction (flagged)
- PR E: global-sync child eviction (flagged)
- PR F: scroll-spy extraction (no behavior change)
- PR G: optimized scroll-spy implementation (flagged)
- PR H+: modularization PRs (small, mechanical refactors)

---

### Rollout strategy

- Keep defaults conservative and ship flags “off” first.
- Enable flags internally (dev builds) to gather confidence.
- Flip defaults in this order:
  1. file search debounce
  2. prompt-history image stripping
  3. file-content eviction
  4. global-sync child eviction
  5. optimized scroll-spy

---

### Open questions

- What are acceptable defaults for storage caps and cache sizes for typical OpenCode usage?
- Does the SDK support `AbortSignal` end-to-end for cancellation, or do we rely on stale-result dropping?
- Should web and desktop persistence semantics be aligned (even if desktop has async storage available)?




这段文字是一个名为 **Starlight Starter Kit: Basics** 的项目自述文件（README）。 **Starlight** 是由 Astro 团队开发的一个专门用于构建高质量、高性能**文档网站**的框架。这份文件是为你初始化项目后提供的快速入门指南。 以下是内容的详细翻译与解释： --- ### 1. 标题与快速启动 * **标题**: Starlight 入门示例：基础版。 * **安装命令**: ```bash npm create astro@latest -- --template starlight ``` 这条命令会让你通过模板直接创建一个新的 Starlight 项目。 * **快捷按钮**: 提供了在 StackBlitz、CodeSandbox 等在线 IDE 中直接打开项目的链接，以及一键部署到 Netlify 或 Vercel 的按钮。 > 🧑‍🚀 **资深航天员？**（意指如果你是经验丰富的开发者）可以直接删除此文件。祝玩得开心！ --- ### 2. 🚀 项目结构 (Project Structure) 这一部分介绍了项目的文件目录布局： * **`public/`**: 存放静态资源，如网站图标（Favicon）。 * **`src/assets/`**: 存放图片等资源，可以在 Markdown 中通过相对路径引用。 * **`src/content/docs/`**: **核心目录**。Starlight 会读取这里的 `.md` 或 `.mdx` 文件。每个文件会根据文件名自动生成对应的路由（网址路径）。 * **`src/content.config.ts`**: 内容配置，用于定义文档的数据结构。 * **`astro.config.mjs`**: Astro 项目的配置文件。 * **`package.json`** & **`tsconfig.json`**: 项目依赖管理和 TypeScript 配置。 --- ### 3. 🧞 常用命令 (Commands) 这些命令需要在项目的根目录下通过终端运行： | 命令 | 作用 | | :--- | :--- | | `npm install` | 安装项目所需的依赖包。 | | `npm run dev` | 启动本地开发服务器，地址通常是 `localhost:4321`。 | | `npm run build` | 将项目打包，生成用于生产环境的文件（存放在 `./dist/`）。 | | `npm run preview` | 在本地预览打包后的效果。 | | `npm run astro ...` | 运行 Astro 的特定命令行工具，如添加插件或检查代码。 | | `npm run astro -- --help` | 获取 Astro CLI 的帮助信息。 | --- ### 4. 👀 想了解更多？ 提供了进一步学习的资源链接： * **Starlight 官方文档**: 了解如何配置侧边栏、搜索、国际化等。 * **Astro 官方文档**: 了解底层框架的原理。 * **Astro Discord**: 加入社区进行交流。 --- ### 总结 这份文件的核心逻辑是：**“把你的 Markdown 文档放在 `src/content/docs/` 下，运行 `npm run dev` 就能看到你的文档网站了。”** 它体现了 Starlight “开箱即用”和“内容驱动”的设计理念。
