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
| `tool_start` | `tool` | agent invoked a tool |
| `tool_end` | `tool`, `data?` | tool finished; `data` carries a renderable result |
| `citations` | `citations[]` | grounded sources for the answer |
| `done` | `messageId`, `conversationId` | stream finished |
| `error` | `content` | failure |

`tool_end.data` is present only for tools the UI can render as a card, and is
projected onto a published schema rather than streamed raw — a new database
column does not reach the browser until the schema declares it:

| tool | `data` shape |
|------|--------------|
| `project_search` | `ProjectCard[]` — `projectCardsSchema` |
| `skills_tool` | `Record<category, SkillCard[]>` — `skillGroupsSchema` |

Every other tool omits `data`, as does any tool that failed or found nothing.
Schemas live in `@ai-portfolio/shared`; validate before rendering.

WebSocket alternative: connect to `/chat` namespace (Socket.IO), emit `ask`,
listen for `chunk`. The web client uses SSE by default and switches to this
transport when `NEXT_PUBLIC_CHAT_TRANSPORT=socket`, falling back to SSE if the
socket cannot connect. The gateway needs a process that outlives the request,
which not every host provides — hence opt-in rather than default.

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

`type` is an allow-list: `visit`, `question`, `project_view`, `skill_query`,
`download_resume`. Where each one comes from:

| event | emitted by |
|-------|-----------|
| `visit` | the web client, once per browser session |
| `question` | the API, on every chat turn |
| `project_view` | the API, when the agent runs `project_search` |
| `skill_query` | the API, when the agent runs `skills_tool` |
| `download_resume` | the API, on `GET /resume` |

`project_view` and `skill_query` are attributed to tool use rather than to page
views, because there are no project or skill pages to land on — the agent is
the interface.

## Rate limiting
Global throttler: `RATE_LIMIT_MAX` requests per `RATE_LIMIT_TTL` seconds (default 60/60).
