# Portfolio frontend

React 19 + Vite + Tailwind 4 + shadcn/ui (Base UI). The landing page has a hero and a chat input.
After the first question it becomes a streaming chat with tool cards, sources and suggestion chips.

```bash
npm install
npm run dev      # http://localhost:5173 — /api is proxied to the api gateway on :5010
npm test         # vitest: SSE parser + chat state reducer
npm run build
```

- `src/lib/api.ts`: API client, including the streaming chat call
- `src/lib/sse.ts`: incremental SSE parser
- `src/lib/chatState.ts`: pure reducer from stream frames to an assistant message
- `src/hooks/useChat.ts`: conversation state, stop/retry, sessionStorage persistence
- `src/components/cards/`: one component per tool card
  (contract: `../ai-service/docs/STREAM_CONTRACT.md`)

To use your own avatar, replace `public/avatar.svg` (or point `avatar` in `content/profile.json`
at a PNG). To serve a resume, put `public/resume.pdf` in place.
