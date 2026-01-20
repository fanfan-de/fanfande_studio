```
E:/cherry-studio/
├── 配置文件
│   ├── package.json                   # 主项目配置和依赖
│   ├── pnpm-workspace.yaml            # PNPM 工作区配置
│   ├── pnpm-lock.yaml                 # 依赖锁定文件
│   ├── biome.jsonc                    # Biome 格式化配置
│   ├── eslint.config.mjs              # ESLint 配置
│   ├── electron.vite.config.ts        # Electron-Vite 配置
│   ├── electron-builder.yml           # Electron 构建配置
│   ├── tsconfig.json                  # TypeScript 主配置
│   ├── tsconfig.node.json             # Node.js TypeScript 配置
│   ├── tsconfig.web.json              # Web TypeScript 配置
│   ├── vitest.config.ts               # Vitest 测试配置
│   ├── playwright.config.ts           # Playwright E2E 测试配置
│   ├── dev-app-update.yml             # 开发环境应用更新配置
│   ├── app-upgrade-config.json        # 应用升级配置
│   └── patches/                       # 依赖补丁目录
├── 源代码目录
│   ├── src/
│   │   ├── main/                      # Electron 主进程代码
│   │   │   ├── apiServer/            # API 服务器 (Express)
│   │   │   │   ├── middleware/       # 中间件 (认证、错误处理等)
│   │   │   │   └── routes/           # API 路由
│   │   │   ├── services/             # 主进程服务
│   │   │   │   └── agents/           # AI 代理服务
│   │   │   └── index.ts              # 主进程入口
│   │   ├── renderer/                  # 渲染进程代码 (React)
│   │   │   ├── src/
│   │   │   │   ├── aiCore/           # AI 核心逻辑
│   │   │   │   ├── components/       # React 组件
│   │   │   │   ├── hooks/            # 自定义 Hooks
│   │   │   │   ├── pages/            # 页面组件
│   │   │   │   ├── store/            # Redux 状态管理
│   │   │   │   └── utils/            # 工具函数
│   │   │   └── index.html             # 主 HTML 文件
│   │   └── preload/                   # 预加载脚本
│   │       └── index.ts               # 预加载脚本入口
│   └── packages/                      # 工作区包 (Monorepo)
│       ├── aiCore/                    # AI 核心功能包
│       │   └── src/
│       │       ├── core/              # 核心 AI 逻辑
│       │       │   ├── middleware/    # AI 中间件
│       │       │   ├── models/        # 数据模型
│       │       │   ├── options/       # 配置选项
│       │       │   └── plugins/       # AI 插件系统
│       │       └── __tests__/         # 测试文件
│       ├── ai-sdk-provider/           # AI SDK 提供商适配器
│       ├── extension-table-plus/      # 表格扩展功能
│       ├── mcp-trace/                 # MCP (Model Context Protocol) 追踪
│       └── shared/                    # 共享代码和工具
├── 构建和资源
│   ├── build/                         # 构建相关文件
│   │   ├── icons/                     # 应用图标 (多种尺寸)
│   │   ├── logo.png                   # 应用 Logo
│   │   ├── icon.icns                  # macOS 图标
│   │   ├── icon.ico                   # Windows 图标
│   │   ├── tray_icon.png              # 托盘图标
│   │   └── entitlements.mac.plist     # macOS 权限配置
│   └── resources/                     # 应用资源文件
│       ├── cherry-studio/             # 应用特定资源
│       ├── data/                      # 数据文件
│       ├── database/                  # 数据库文件
│       └── scripts/                   # 资源脚本
├── 配置目录
│   └── config/
│       └── app-upgrade-segments.json  # 应用升级分段配置
├── 文档
│   ├── docs/
│   │   ├── en/                        # 英文文档
│   │   │   ├── guides/                # 指南
│   │   │   └── references/            # 参考文档
│   │   ├── zh/                        # 中文文档
│   │   │   ├── guides/                # 指南
│   │   │   └── references/            # 参考文档
│   │   ├── assets/                    # 文档资源
│   │   └── README.md                  # 文档首页
│   ├── README.md                      # 项目主 README
│   ├── CONTRIBUTING.md                # 贡献指南
│   ├── SECURITY.md                    # 安全策略
│   ├── CODE_OF_CONDUCT.md             # 行为准则
│   ├── CLAUDE.md                      # Claude 配置文件
│   └── AGENTS.md                      # 代理配置文件
├── 测试目录
│   ├── tests/
│   │   ├── __mocks__/                 # 测试 Mock 文件
│   │   ├── apis/                      # API 测试
│   │   ├── e2e/                       # 端到端测试
│   │   ├── main.setup.ts              # 主进程测试配置
│   │   └── renderer.setup.ts          # 渲染进程测试配置
│   └── scripts/                       # 测试和构建脚本
│       ├── after-pack.js              # 打包后脚本
│       ├── before-pack.js             # 打包前脚本
│       ├── notarize.js                # macOS 公证脚本
│       ├── check-i18n.ts              # 国际化检查
│       ├── sync-i18n.ts               # 国际化同步
│       ├── auto-translate-i18n.ts     # 自动翻译
│       └── feishu-notify.ts           # 飞书通知脚本
├── 开发工具配置
│   ├── .vscode/                       # VS Code 配置
│   │   ├── extensions.json            # 推荐扩展
│   │   ├── launch.json                # 调试配置
│   │   ├── settings.json              # 编辑器设置
│   │   └── snippet.code-snippets      # 代码片段
│   ├── .github/                       # GitHub 配置
│   │   ├── workflows/                 # GitHub Actions 工作流
│   │   │   ├── pr-ci.yml              # PR 持续集成
│   │   │   ├── release.yml            # 发布工作流
│   │   │   ├── nightly-build.yml      # 夜间构建
│   │   │   └── claude.yml             # Claude 自动化工作流
│   │   ├── ISSUE_TEMPLATE/            # Issue 模板
│   │   ├── CODEOWNERS                 # 代码所有者
│   │   ├── dependabot.yml             # Dependabot 配置
│   │   └── pull_request_template.md   # PR 模板
│   ├── .husky/                        # Git Hooks
│   │   └── pre-commit                 # 预提交钩子
│   └── .editorconfig                  # 编辑器配置
└── 其他文件
    ├── .env.example                   # 环境变量示例
    ├── .gitignore                     # Git 忽略配置
    ├── .gitattributes                 # Git 属性
    ├── .git-blame-ignore-revs         # Git Blame 忽略列表
    ├── .npmrc                         # NPM 配置
    ├── .oxlintrc.json                 # Oxlint 配置
    ├── LICENSE                        # 开源许可证
    └── CODE_OF_CONDUCT.md             # 行为准则
```