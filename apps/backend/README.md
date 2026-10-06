# Backend — Meeting & Action Workspace API

NestJS 12 (ESM) + Prisma 7 + PostgreSQL. Turns meeting notes into a structured,
human-reviewable workspace: Claude proposes a summary, decisions, open questions
and action items; people edit, own and track them.

## Setup

```bash
# from the repository root: start PostgreSQL (host port 5435)
docker compose up -d db

cd apps/backend
cp .env.example .env        # then fill in ANTHROPIC_API_KEY
npm install                 # also generates the Prisma client
npm run prisma:deploy       # apply migrations
npm run start:dev
```

`ANTHROPIC_API_KEY` is read only by this backend. Without it the API still
starts and everything except `POST /api/meetings/:id/analyze` works; that
endpoint answers `503`. Set `MEETING_ANALYZER=fake` to get a deterministic
canned analysis for local development without a key.

## API

| Method | Path                             | Purpose                                   |
| ------ | -------------------------------- | ----------------------------------------- |
| POST   | `/api/meetings`                  | Create a meeting (`title`, `notes`)       |
| GET    | `/api/meetings`                  | List meetings, newest first               |
| GET    | `/api/meetings/:id`              | Meeting with its analysis and action items |
| POST   | `/api/meetings/:id/analyze`      | Analyze the notes and store the proposal  |
| POST   | `/api/meetings/:id/action-items` | Add an action item by hand                |
| PATCH  | `/api/action-items/:id`          | Edit task, owner, deadline, priority, status |
| DELETE | `/api/action-items/:id`          | Delete an action item                     |

Dates without a time (`deadline`, `followUpDate`) are `YYYY-MM-DD` strings.
`owner` and `deadline` are `null` when unknown; sending `null` in a PATCH clears them.

## How analysis is kept safe

- `MeetingAnalyzer` is the only seam to the model. `AnthropicMeetingAnalyzer`
  calls the Claude API with a structured output format; `FakeMeetingAnalyzer`
  is deterministic and used by the tests.
- Whatever an analyzer returns goes through `parseMeetingAnalysis` before it is
  stored. Anything that does not match the contract is rejected with `502`.
- The analysis and its action items are written in one transaction, so a
  rejected or failed analysis leaves the previous state untouched.
- Each action item records its `source` (`AI` or `HUMAN`) and whether a human
  has reviewed it. Re-analysis replaces only AI proposals nobody has touched.

## Commands

```bash
npm run build
npm run lint
npm test            # unit tests, no database needed
npm run test:e2e    # API tests against PostgreSQL (needs `docker compose up -d db`)
```

The e2e tests create and migrate their own `meeting_workspace_test` database and
never call the Anthropic API.
