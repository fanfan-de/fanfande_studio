export const navigationItems = [
  { href: "#capabilities", label: "功能" },
  { href: "#updates", label: "更新日志" },
  { href: "#workflow", label: "文档" },
  { href: "#download", label: "下载" },
  {
    href: "https://github.com/fanfan-de/fanfande_studio",
    label: "GitHub",
    external: true,
  },
]

export const proofPoints = [
  "高可配置，高自由度",
  "多供应商支持",
  "Skills 创建与管理",
]

export const featureStories = [
  {
    title: "高可配置，高自由度的 Agent 工作台",
    body: "Anybox 把模型、工具、权限、终端和项目上下文拆成可配置的模块。你可以按项目习惯调整工作流，选择需要开放给 Agent 的能力，并在关键步骤随时接管。",
    mediaTitle: "Configurable workspace",
    mediaItems: ["模型配置", "工具开关", "权限策略", "项目上下文"],
  },
  {
    title: "多供应商支持，不被单一模型入口锁住",
    body: "通过统一的供应商配置层，Anybox 可以接入不同模型服务和运行环境。团队能在同一套桌面体验里切换、测试和组合模型，根据任务成本、速度和效果选择合适后端。",
    mediaTitle: "Provider layer",
    mediaItems: ["供应商目录", "模型列表", "连接测试", "项目级配置"],
  },
  {
    title: "内置 Skills 创建和管理模块",
    body: "Skills 可以把团队经验、项目约定和常用流程沉淀成可复用能力。Anybox 提供创建、编辑、预览、选择和管理入口，让 Agent 在不同项目里带着合适的上下文工作。",
    mediaTitle: "Skills manager",
    mediaItems: ["创建 Skill", "元数据预览", "项目选择", "全局管理"],
  },
]

export const workflowSteps = [
  {
    index: "01",
    title: "选择一个本地项目",
    body: "先绑定目录，再开始会话。项目结构、终端路径和上下文天然对齐。",
  },
  {
    index: "02",
    title: "把任务交给 Agent",
    body: "用自然语言描述目标，让 Agent 读取代码、运行命令、生成补丁和汇报状态。",
  },
  {
    index: "03",
    title: "在同一界面检查结果",
    body: "查看输出、审批风险操作、对比改动，并把需要继续推进的任务留在当前工作区。",
  },
]

export const surfaceItems = [
  {
    label: "Desktop",
    title: "面向本地开发的桌面壳",
    detail: "Electron + React 负责工作区、会话、终端和设置入口。",
  },
  {
    label: "Runtime",
    title: "可托管也可外接的 Agent 服务",
    detail: "Bun + Hono + AI SDK 承载会话、工具调用和流式输出。",
  },
  {
    label: "Tooling",
    title: "围绕团队习惯扩展",
    detail: "MCP、Skills、PTY 和 Git 操作把执行链路串起来。",
  },
]
