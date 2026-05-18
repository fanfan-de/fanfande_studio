# Fanfande Studio 插件模块 v1

插件模块是 Agent 能力包管理层，不引入新的执行运行时。插件只声明能力，实际执行继续落在现有 MCP、Skill、App Connector、Auth、Permission 和项目选择链路上。

## 插件包结构

插件包入口固定为：

```text
<plugin-package>/.fanfande-plugin/plugin.json
```

manifest v1 支持以下顶层字段：

- `name`、`version`、`description`、`author`
- `interface`：插件在市场和详情页中的展示信息。
- `mcpServers`：生成全局 MCP server 配置的模板。
- `skills`：插件包内 Skill 目录，默认是 `skills`。
- `apps`：需要独立凭据的远程 MCP Connector。
- `commands`、`agents`：v1 保留字段，不实现执行语义。

插件来源 v1 只有两类：

- 内置 curated catalog：仓库内置插件包放在 `packages/fanfandeagent/plugins/builtin/<plugin-package>`，打包后复制到 Agent runtime 的 `plugins/builtin`。
- `FanFande_PLUGIN_PACKAGE_DIRS` 指向的本地插件包目录。

插件包本身不放在 `src` 代码目录；`src/plugin` 只负责扫描、校验、安装和生成运行时绑定。

## ID 规则

- `pluginID`：manifest `name` 小写化。
- MCP server：`plugin.<pluginID>` 或 `plugin.<pluginID>.<serverID>`。
- App Connector：`plugin-app:<pluginID>:<appID>`。
- App Connector MCP server：`plugin.<pluginID>.app.<appID>`。
- Plugin Skill：`plugin:<pluginID>:<skillName>`。

## 安装行为

安装插件时只生成绑定：

- 写入 `installed_plugins`。
- 按 manifest 生成全局 MCP server 配置。
- 记录插件 Skill 根目录，供 Skill 发现流程读取。
- 为 App Connector 生成 connector id。

安装不会自动把插件暴露给所有项目。项目仍通过现有 MCP picker 和 Skill selection 显式选择可用能力。

`critical` 风险插件禁止安装。其他风险等级的具体工具调用继续由 MCP tool policy、权限审批和工具 annotation 决定。

## Settings API

插件管理 API 挂载在 Agent Settings routes 下：

```text
GET    /api/plugins/catalog
GET    /api/plugins/installed
PUT    /api/plugins/installed/:pluginID
PATCH  /api/plugins/installed/:pluginID
DELETE /api/plugins/installed/:pluginID
GET    /api/plugins/installed/:pluginID/diagnostic
GET    /api/plugins/installed/:pluginID/connectors
PUT    /api/plugins/installed/:pluginID/connectors/:appID/api-key
DELETE /api/plugins/installed/:pluginID/connectors/:appID/api-key
GET    /api/plugins/installed/:pluginID/connectors/:appID/diagnostic
```

Connector API key 存入 credential store，运行时由 `plugin-app:<pluginID>:<appID>` 解析并注入远程 MCP 请求。密钥不写入普通 MCP server 配置。
