# Project rules

Three services plus shared content: `frontend/` (React + Vite + shadcn/ui), `api/` (Express + TS
gateway), `ai-service/` (FastAPI agent + RAG), and `content/` (the owner's data). See README.md for
the architecture.

## Content
- `content/profile.json` and `content/knowledge/**/*.md` are the single source of truth for facts
  about the owner. Both the api and the ai-service read them. Never hardcode facts about the owner in
  code or prompts.
- A project deep-dive is `content/knowledge/projects/<slug>.md` with `project: <slug>` in its
  frontmatter, and the slug must match `profile.json`.

## ai-service
- **Tools**: one class per tool in `app/tools/`, extending `BaseTool` with a Pydantic `args_schema`,
  registered in `TOOL_CLASSES` (`app/tools/__init__.py`). Tools return `ToolResult`: `data` goes
  to the model, `ui` becomes a card, `sources` become citations. Errors are returned as data and
  never raised.
- **Write tools** set `is_write = True`. The agent runs them alone and in order. A write tool may only
  use values the visitor typed. Say so in its description.
- **New cards** need a `ui_card` on the tool, a component in `frontend/src/components/cards/`, a
  `case` in `cards/index.tsx`, and the `CardType` union in `frontend/src/types.ts`.
- **Stream frames** are documented in `ai-service/docs/STREAM_CONTRACT.md`. Change it together with
  `agent_service.py`, `frontend/src/types.ts` and `frontend/src/lib/chatState.ts`.
- **The prompt** (`app/prompts/system.py`) takes the owner's name from the profile and must use no
  hardcoded names.
- ai-service is internal-only: no nginx route and no published port in production.
- Checks: `uv run ruff check app tests`, `uv run ruff format --check app tests`, `uv run mypy app`
  (strict), `uv run pytest`. Tests never call Groq; use `FakeLLM` from `tests/conftest.py`.

## api
- Every public route is validated with zod (`src/utils/validation.ts`), rate-limited
  (`src/middleware/rateLimiters.ts`), and documented with an `@openapi` JSDoc block.
- `X-Internal-Service-Key` and the admin token are compared only with `safeEqual` /
  `isValidInternalServiceKey` (`src/utils/internalServiceKey.ts`). Never use `===`.
- **Database**: after any change to `prisma/schema.prisma`, create a migration with
  `npx prisma migrate dev --name <name>`. Never use `prisma db push`. Every table has `createdAt` and
  `updatedAt`.
- Admin and stats queries use Prisma aggregates (`count`, `groupBy`, `aggregate`). Never load rows into
  Node just to count them.
- Background work (notifications, chat logs) catches its own errors and never fails the request.
- Tests live in `api/tests/*.test.ts` with Prisma and `fetch` mocked (`tests/helpers.ts`).

## frontend
- UI components come from shadcn/ui (`src/components/ui/`, Base UI flavour: use `render` props,
  not `asChild`). Icons come from lucide-react. Brand logos are in `src/components/BrandIcons.tsx`.
- Every text size scales across breakpoints (base / `sm` / `md` / `lg`). The page must work at
  phone width.
- Model text is rendered only through `<Markdown>` (no raw HTML). External links open with
  `rel="noopener noreferrer"`.
- Forms validate before submit, and a field's error clears as soon as the user types in it (see
  `ContactDialog.tsx`).
- Browser storage access always goes through `src/lib/storage.ts` (guarded).

## Process
- Follow the existing patterns in each service before adding new ones.
- When a new rule comes up, add it to this file.
