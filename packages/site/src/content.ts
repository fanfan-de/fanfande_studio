export const navigationItems = [
  { href: "#features", label: "能力" },
  { href: "#workflow", label: "工作流" },
  { href: "#launch", label: "开始" },
]

export const proofPoints = [
  "本地项目工作区感知",
  "流式 Agent 会话与工具调用",
  "终端、权限与上下文在同一界面闭环",
]

export const featureItems = [
  {
    id: "01",
    title: "围绕项目目录，而不是围绕聊天窗口工作",
    body: "把工作区、历史会话、文件反馈和模型配置固定在同一个上下文里，避免每次都重新解释项目。",
    detail: "适合需要连续推进代码、文档和命令行任务的本地型产品。",
  },
  {
    id: "02",
    title: "让 Agent 输出过程本身成为可操作界面",
    body: "不仅展示最终回答，也把 reasoning、工具调用、补丁和错误轨迹显式放到桌面工作流里。",
    detail: "用户能看见 Agent 正在做什么，也能随时接管、补充或纠偏。",
  },
  {
    id: "03",
    title: "把终端、权限和多工具协作压缩成一个节奏",
    body: "当对话、终端和审批链路都在一个空间内时，决策和执行不再跨应用来回跳转。",
    detail: "特别适合本地开发、实验验证和带风险操作的任务流。",
  },
]

export const workflowSteps = [
  {
    index: "01",
    title: "选择你的本地工作区",
    body: "先从目录开始，而不是先开一个孤立对话。项目结构、终端路径和会话上下文天然对齐。",
  },
  {
    index: "02",
    title: "让 Agent 在流式界面中逐步展开动作",
    body: "你会连续看到思考、工具调用、补丁和异常反馈，不必等到最后一条消息才知道发生了什么。",
  },
  {
    index: "03",
    title: "在同一块桌面里完成检查、执行和回退",
    body: "终端回显、权限确认和文件反馈保持在视线范围内，减少切换成本，也减少误操作。",
  },
]

export const architectureItems = [
  { label: "Desktop", value: "Electron + React 19" },
  { label: "Agent Runtime", value: "Bun + Hono + AI SDK" },
  { label: "Tooling", value: "MCP / Skills / PTY Terminal" },
  { label: "Delivery", value: "Workspace-first local product flow" },
]
