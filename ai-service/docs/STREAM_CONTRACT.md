# Chat stream contract

`POST /internal/chat/stream` (ai-service) → proxied unchanged by `POST /api/chat` (api) → parsed by
`frontend/src/lib/sse.ts` and applied by `frontend/src/lib/chatState.ts`.

The response is `text/event-stream`. Every event is one `data:` line holding one JSON frame,
followed by a blank line.

## Request

```json
{ "messages": [{ "role": "user", "content": "What have you built?" }], "session_id": "abc123…" }
```

The api accepts `sessionId` (camelCase) from the browser and forwards it as `session_id`.
History is text only. The last message must be from the user.

## Frames, in the order they usually arrive

| type          | fields                              | meaning |
|---------------|-------------------------------------|---------|
| `tool_start`  | `id`, `name`, `label`               | A tool is about to run. `label` is the progress line ("Checking my GitHub…"). |
| `tool_result` | `id`, `name`, `card`, `data`        | Data for a UI card. Only tools with a card send it, and only when they succeed. |
| `tool_end`    | `id`, `name`, `ok`                  | The tool finished. `ok: false` means it returned an error to the model. |
| `content`     | `delta`                             | Visible answer text. Append the deltas in order. |
| `sources`     | `sources: [{id,title,section,snippet,score}]` | The RAG chunks used this turn (from `search_knowledge` and `get_project_details`). |
| `suggestions` | `items: string[]`                   | 1-3 follow-up questions the model wrote (its `<suggestions>` block, removed from `content`). |
| `done`        | `model`, `steps`, `usage`           | The turn finished. |
| `error`       | `message`                           | The turn failed. `message` is safe to show to the visitor. |

Several tool frames can interleave when the model calls more than one read tool at once. Match
frames by `id`.

## Cards

`card` is one of `profile`, `projects`, `project`, `skills`, `experience`, `resume`, `contact`,
`github`, `message_sent`. The frontend ignores card types it doesn't know. To add one, add a
`ui_card` to a tool in `app/tools/`, then add a component and a `case` in
`frontend/src/components/cards/index.tsx`.
