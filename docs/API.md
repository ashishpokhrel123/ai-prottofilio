# API Reference

Base URL: `http://localhost:4000/api/v1`
Interactive Swagger UI: `http://localhost:4000/api/docs`

All admin endpoints require `Authorization: Bearer <token>` obtained from `POST /auth/login`.

## Chat

### `POST /chat` — ask the agent (SSE stream)
```json
{ "message": "Explain your Immortalis project", "conversationId": "optional-uuid", "visitorId": "anon-id" }
```
Response is `text/event-stream`. Each `data:` line is a JSON `ChatStreamChunk`:

| type | fields | meaning |
|------|--------|---------|
| `token` | `content`, `conversationId` | a streamed text delta |
| `tool_start` / `tool_end` | `tool` | agent invoked/finished a tool |
| `citations` | `citations[]` | grounded sources for the answer |
| `done` | `messageId`, `conversationId` | stream finished |
| `error` | `content` | failure |

WebSocket alternative: connect to `/chat` namespace (Socket.IO), emit `ask`, listen for `chunk`.

## Content (public reads)
- `GET /projects` — all projects
- `GET /projects/:slug` — one project
- `GET /skills` — skills grouped by category
- `GET /resume` — download resume PDF (streams file, tracks analytics)

## Admin (JWT)
- `POST /auth/login` → `{ accessToken, user }`
- `POST /documents/upload` (multipart: `file`, `title`, `docType`, `source`, `tags`) → queues ingestion
- `GET /documents` — list documents + status
- `POST /documents/:id/reindex` — rebuild embeddings for one document
- `DELETE /documents/:id`
- `POST /embeddings/index` `{ documentId? }` — queue (re)indexing (all pending if omitted)
- `POST /github/sync` — fetch repos + READMEs, embed them
- `GET /analytics` — visitor/question/project metrics

## Analytics (public write)
- `POST /analytics/event` `{ type, visitorId?, payload? }` — e.g. `type: "visit"`

## Rate limiting
Global throttler: `RATE_LIMIT_MAX` requests per `RATE_LIMIT_TTL` seconds (default 60/60).
