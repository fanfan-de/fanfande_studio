# Server 模块规范

## 概览

`server` 模块基于 Hono 提供 `fanfandeagent` 的 HTTP 接口层。
它只负责：

- 参数校验
- 路由分发
- 响应 envelope 统一
- 错误码映射

业务逻辑由 `project`、`session`、`provider`、`config` 等模块承接。

## 响应约定

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

### 基础

- `GET /`
- `GET /healthz`

### Project

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/sessions`
- `POST /api/projects/:id/sessions`

### Provider / Model Config

- `GET /api/projects/:id/providers/catalog`
- `GET /api/projects/:id/providers`
- `PUT /api/projects/:id/providers/:providerID`
- `DELETE /api/projects/:id/providers/:providerID`
- `GET /api/projects/:id/models`
- `PATCH /api/projects/:id/model-selection`

### Session

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `GET /api/sessions/:id/messages`
- `POST /api/sessions/:id/messages/stream`

## Provider 路由职责

新增的 provider 路由服务于前端模型配置页：

- `providers/catalog`
  - 展示所有可选 provider
- `providers`
  - 展示当前项目已经配置的 provider
- `models`
  - 展示当前项目可选模型
- `model-selection`
  - 保存默认模型和小模型

这些路由内部会进入 `Instance` 上下文，以便读取项目级环境变量和 provider 状态。

## 约束

- 路由层不直接拼接模型 catalog
- 路由层不返回敏感字段，例如 provider key
- 删除 project 时必须同步清理 project 级 provider 配置
- 新增 route 后，至少同步更新：
  - `src/provider/spec.md`
  - `src/server/spec.zh.md`
  - 相关 API 对接文档
  - `Test/server.api.test.ts`

## 测试指令

```powershell
cd C:\Projects\fanfande_studio
bun test packages/fanfandeagent/Test/server.api.test.ts
```
