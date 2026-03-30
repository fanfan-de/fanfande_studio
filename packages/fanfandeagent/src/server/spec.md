# Server Module Spec

## Overview
The `server` module provides the HTTP transport layer for fanfandeagent using Hono. It should translate HTTP requests/responses and delegate all business logic to domain modules (`project`, `session`, etc.).

## Current Entry Points
- `createServerApp(options?)`: build and return a Hono app instance
- `startServer(options?)`: start Bun HTTP server with the app fetch handler
- `stopServer()`: stop the active Bun server instance
- `url()`: return current active server URL

## Middleware Pipeline
1. Request ID middleware
- Generate `requestId` by `crypto.randomUUID()`
- Set context variable `requestId`
- Return header `x-request-id`

2. CORS middleware
- Mount on `/api/*`
- Use `corsWhitelist` when provided, otherwise allow default CORS behavior

3. Access log middleware
- Log `method`, `path`, `status`, `duration`, `requestId`

4. Error handling
- Unified not-found response for unmatched routes
- Unified exception handling via `ApiError` and fallback `INTERNAL_ERROR`

## Response Envelope
All API responses should use a consistent envelope.

Success:
```json
{
  "success": true,
  "data": {},
  "requestId": "uuid"
}
```

Error:
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

## Routes (Current)
Base routes:
- `GET /`: service metadata
- `GET /healthz`: health check (`{ ok: true }`)

Project routes (`/api/projects`):
- `GET /api/projects`: list projects
- `GET /api/projects/:id`: get one project by id

Session routes (`/api/sessions`):
- `GET /api/sessions`: route hint payload
- `POST /api/sessions`: create session from request body `{ "directory": "..." }`
- `GET /api/sessions/:id`: get one session by id

## Error Codes (Current)
- `NOT_FOUND`: route not found
- `INVALID_PAYLOAD`: request body schema validation failed
- `PROJECT_NOT_FOUND`: project id does not exist
- `SESSION_NOT_FOUND`: session id does not exist
- `INTERNAL_ERROR`: unexpected server error

## Design Constraints
- Keep route handlers thin: validate input and transform output only
- Do not embed direct DB table logic in route handlers
- Keep all responses request-id traceable
- New routes must include spec updates and tests in `Test/`

## Suggested Next Spec Extensions
- Add API versioning (`/api/v1`)
- Add authentication middleware and error codes (`UNAUTHORIZED`, `FORBIDDEN`)
- Add rate-limit and timeout behavior contracts
- Define streaming protocol contract for agent output (SSE/WebSocket)
