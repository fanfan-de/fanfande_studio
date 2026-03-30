# Server 模块规范（中文）

## 概述
`server` 模块基于 Hono 提供 `fanfandeagent` 的 HTTP 传输层。它负责请求/响应协议转换，并将业务逻辑委托给领域模块（如 `project`、`session`）。

## 当前入口
- `createServerApp(options?)`：构建并返回 Hono 应用实例
- `startServer(options?)`：使用 Bun 启动 HTTP 服务
- `stopServer()`：停止当前激活的 Bun 服务实例
- `url()`：返回当前服务 URL

## 中间件流水线
1. Request ID 中间件
- 通过 `crypto.randomUUID()` 生成 `requestId`
- 写入上下文变量 `requestId`
- 在响应头返回 `x-request-id`

2. CORS 中间件
- 挂载路径：`/api/*`
- 若提供 `corsWhitelist` 则使用白名单；否则启用默认 CORS

3. 访问日志中间件
- 记录 `method`、`path`、`status`、`duration`、`requestId`

4. 错误处理
- 未匹配路由统一返回 not-found 响应
- 通过 `ApiError` + fallback `INTERNAL_ERROR` 统一异常响应

## 响应包络
所有 API 都使用统一响应结构。

成功：
```json
{
  "success": true,
  "data": {},
  "requestId": "uuid"
}
```

失败：
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "human readable message"
  },
  "requestId": "uuid"
}
```

## 当前路由
基础路由：
- `GET /`：服务元信息
- `GET /healthz`：健康检查（`{ ok: true }`）

项目路由（`/api/projects`）：
- `GET /api/projects`：项目列表
- `GET /api/projects/:id`：按 ID 获取单个项目

会话路由（`/api/sessions`）：
- `GET /api/sessions`：返回路由提示信息
- `POST /api/sessions`：根据请求体 `{ "directory": "..." }` 创建会话
- `GET /api/sessions/:id`：按 ID 获取单个会话

## 当前错误码
- `NOT_FOUND`：路由不存在
- `INVALID_PAYLOAD`：请求体校验失败
- `PROJECT_NOT_FOUND`：项目 ID 不存在
- `SESSION_NOT_FOUND`：会话 ID 不存在
- `INTERNAL_ERROR`：服务内部异常

## 设计约束
- 路由处理器保持轻量：仅做输入校验与输出转换
- 路由层不直接写底层数据表
- 所有响应必须可通过 `requestId` 追踪
- 新增路由时必须同步更新 spec 与 `Test/` 下测试

## 后续建议（规范扩展）
- 增加 API 版本前缀（如 `/api/v1`）
- 增加鉴权中间件与错误码（`UNAUTHORIZED`、`FORBIDDEN`）
- 增加限流与超时契约
- 定义 agent 输出流式协议（SSE/WebSocket）

