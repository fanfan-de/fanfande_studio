export const navigationItems = [
  { href: "#top", label: "简介" },
  { href: "#capabilities", label: "功能" },
  { href: "#updates", label: "更新" },
  { href: "#workflow", label: "学习" },
  { href: "#download", label: "下载" },
  {
    href: "https://github.com/fanfan-de/fanfande_studio",
    label: "GitHub",
    external: true,
  },
]

export const proofPoints = [
  "本地项目上下文",
  "Agent 执行过程可见",
  "终端与权限闭环",
]

export const featureStories = [
  {
    title: "为真实工程任务准备的本地工作台",
    body: "Anybox 从项目目录开始组织上下文，把文件、会话、终端和模型配置放在同一条工作流里。你不需要反复解释项目结构，也不需要在多个窗口之间搬运信息。",
    mediaTitle: "Workspace context",
    mediaItems: ["项目目录", "会话历史", "模型配置", "文件反馈"],
  },
  {
    title: "把 Agent 的执行过程变成可检查的界面",
    body: "不只显示最终回答。思考、工具调用、补丁、错误和权限确认都会留在桌面工作区里，方便你随时接管、追问或撤回。",
    mediaTitle: "Execution trace",
    mediaItems: ["reasoning", "tool call", "permission", "patch"],
  },
  {
    title: "让终端、权限和多工具协作保持一个节奏",
    body: "当命令行输出、审批链路和 Agent 会话在同一块界面里发生，开发者可以更快判断下一步，而不是被切换成本打断。",
    mediaTitle: "Local runtime",
    mediaItems: ["PTY terminal", "MCP tools", "Skills", "Git"],
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
