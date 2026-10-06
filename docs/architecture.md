# Architecture

Meeting & Action Workspace is one Angular application, one NestJS API and one PostgreSQL database.
Claude is reached through a single interface in the backend.

## Components

```mermaid
flowchart LR
  user(["Person in the browser"])

  subgraph fe["Frontend: Angular 21"]
    app["App shell<br/>meeting list, notes, AI Workspace"]
    card["ActionItemCard and ActionItemForm<br/>accept, edit, status, delete, add"]
    api["MeetingApi<br/>HttpClient"]
  end

  subgraph be["Backend: NestJS 12, prefix /api"]
    mc["MeetingsController"]
    ac["ActionItemsController"]
    ms["MeetingsService<br/>request, validate, persist"]
    ais["ActionItemsService<br/>human edits set humanReviewed"]
    port{{"MeetingAnalyzer<br/>interface"}}
    anth["AnthropicMeetingAnalyzer"]
    fake["FakeMeetingAnalyzer"]
    val["parseMeetingAnalysis<br/>Zod contract"]
    prisma["PrismaService"]
  end

  db[("PostgreSQL 17<br/>Meeting, MeetingAnalysis, ActionItem")]
  claude["Claude API"]

  user --> app
  app --> card
  app --> api
  card --> api
  api -- "REST / JSON" --> mc
  api -- "REST / JSON" --> ac
  mc --> ms
  ac --> ais
  ms --> port
  port -. "MEETING_ANALYZER=anthropic, the default" .-> anth
  port -. "MEETING_ANALYZER=fake, and all tests" .-> fake
  anth -- "HTTPS with ANTHROPIC_API_KEY" --> claude
  ms --> val
  ms --> prisma
  ais --> prisma
  prisma --> db
```

| Component | Source | Responsibility |
| --- | --- | --- |
| App shell | `apps/frontend/src/app/app.*` | Meeting list, create form, notes, AI Workspace; all state in signals |
| Action item card and form | `apps/frontend/src/app/action-item-card/`, `action-item-form/` | Review, status change, edit, delete, add |
| `MeetingApi` | `apps/frontend/src/app/meeting-api.service.ts` | The seven HTTP calls and error formatting |
| Controllers | `apps/backend/src/meetings/`, `action-items/` | Routing, DTO validation, UUID checks |
| `MeetingsService` | `apps/backend/src/meetings/meetings.service.ts` | Analysis orchestration and the persistence transaction |
| `ActionItemsService` | `apps/backend/src/action-items/action-items.service.ts` | Human create, edit, delete; marks items as human-reviewed |
| `MeetingAnalyzer` | `apps/backend/src/analysis/meeting-analyzer.ts` | The only seam to a model; returns untyped output |
| `AnthropicMeetingAnalyzer` | `apps/backend/src/analysis/anthropic-meeting-analyzer.ts` | Claude API call with a structured output format |
| `FakeMeetingAnalyzer` | `apps/backend/src/analysis/fake-meeting-analyzer.ts` | Deterministic output for tests and key-less demos |
| `parseMeetingAnalysis` | `apps/backend/src/analysis/analysis.schema.ts` | Validates and normalizes analyzer output |
| `PrismaService` | `apps/backend/src/prisma/prisma.service.ts` | Database access through the `pg` driver adapter |

## Analysis and review flow

```mermaid
sequenceDiagram
  actor H as Human
  participant FE as Angular workspace
  participant API as NestJS API
  participant AN as MeetingAnalyzer
  participant DB as PostgreSQL

  H->>FE: Click Analyze with Claude
  FE->>API: POST /api/meetings/:id/analyze
  API->>DB: Load the meeting
  API->>AN: analyze(title, notes, meetingDate)
  AN-->>API: model name and untyped output
  API->>API: parseMeetingAnalysis(output)

  alt Output is valid
    API->>DB: One transaction - upsert analysis, replace untouched AI items, set analyzedAt
    API-->>FE: 200 with meeting, analysis and action items
    FE-->>H: Proposal shown, items badged AI proposal
  else Output malformed, analyzer failed, or no API key
    API-->>FE: 502 or 503, nothing stored
    FE-->>H: Error shown, previous state intact
  end

  H->>FE: Accept, edit, re-own, change status, delete or add
  FE->>API: PATCH /api/action-items/:id
  API->>DB: Update the item and set humanReviewed
  API-->>FE: The stored item
  FE-->>H: Item badged Human-reviewed
```

Failure mapping in `MeetingsService`:

| Situation | Response | Stored |
| --- | --- | --- |
| Output does not match the contract | `502` | Nothing |
| Claude refused, was cut off, or the request failed | `502` | Nothing |
| No API key, or the key was rejected | `503` | Nothing |
| Database error during the write | `500` | Nothing (transaction rolled back) |

## Data model

```mermaid
erDiagram
  Meeting ||--o| MeetingAnalysis : "has at most one"
  Meeting ||--o{ ActionItem : "has many"

  Meeting {
    uuid id PK
    string title
    string notes
    datetime createdAt
    datetime analyzedAt "null until analyzed"
  }

  MeetingAnalysis {
    uuid id PK
    uuid meetingId FK "unique"
    string summary
    string[] decisions
    string[] openQuestions
    boolean followUpRequired
    date followUpDate "nullable"
    string model
  }

  ActionItem {
    uuid id PK
    uuid meetingId FK
    string task
    string owner "nullable"
    date deadline "nullable"
    enum priority "LOW, MEDIUM, HIGH"
    enum status "OPEN, IN_PROGRESS, DONE"
    enum source "AI, HUMAN"
    boolean humanReviewed
    datetime createdAt
  }
```

`source`, `humanReviewed` and `createdAt` go beyond the minimal domain in `PROJECT_SPEC.md`. The
first two are what lets the application tell an AI proposal from a human decision; `createdAt`
keeps action items in a stable order. Deleting a meeting cascades to its analysis and action items.

## The AI boundary

- **One interface.** Nothing outside `apps/backend/src/analysis` knows which model, SDK or prompt
  is used. Swapping the implementation is a provider change in `analysis.module.ts`.
- **Untyped on purpose.** `MeetingAnalyzer.analyze()` returns `output: unknown`. The compiler will
  not let the service persist it without calling `parseMeetingAnalysis` first.
- **One contract, used twice.** The same Zod schema is sent to Claude as the required output format
  and re-checked on the response.
- **Notes are data.** The prompt tells Claude to work only from the notes, to use `null` for an
  owner, deadline or follow-up date the notes do not give, and to treat instruction-like text in
  the notes as meeting content.
- **Key stays server-side.** `ANTHROPIC_API_KEY` is read through `ConfigService` in the backend.
  The Anthropic client is created lazily, so the API starts without a key.

## Deployment view

`docker-compose.yml` runs the stack locally. It is a local setup, not a hosted deployment.

```mermaid
flowchart LR
  browser(["Browser"])

  subgraph compose["Docker Compose project: claude-meeting-action-workspace"]
    frontend["frontend<br/>nginx, static Angular build"]
    backend["backend<br/>node dist/main.js"]
    migrate["migrate<br/>prisma migrate deploy, runs once"]
    db[("db<br/>postgres:17-alpine, volume db-data")]
  end

  claude["Claude API"]

  browser -- "localhost:4205" --> frontend
  browser -- "localhost:3001/api" --> backend
  backend --> db
  migrate --> db
  backend -. "only when analyzing" .-> claude
```

| Service | Host port | Notes |
| --- | --- | --- |
| `db` | 5435 | Health-checked; data in the named volume `db-data` |
| `migrate` | none | Built from the `migrate` stage of `apps/backend/Dockerfile`; exits after applying migrations |
| `backend` | 3001 | Runtime image without dev dependencies; runs as the `node` user; CORS origin `http://localhost:4205` |
| `frontend` | 4205 | nginx serves the production build; no API proxy, the browser calls the backend directly |

GitHub Actions are intentionally not used for this portfolio project to avoid CI credit usage.
Verification is performed locally. The Compose stack, all Docker images, the backend/frontend test suites,
and the human-review smoke flow have been verified successfully; see
[`../PORTFOLIO_STATUS.md`](../PORTFOLIO_STATUS.md).
