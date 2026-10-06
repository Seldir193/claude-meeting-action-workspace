# Claude Portfolio Project 05 — Meeting & Action Workspace

## Goal
Build a small but real portfolio-ready full-stack application demonstrating Claude Cowork learning concepts without pretending a Cowork API exists or cloning the Cowork product.

Core story:
unstructured meeting knowledge -> Claude analysis -> structured collaborative workspace -> human review -> owned/tracked tasks.

## Scope
Frontend: Angular, TypeScript, SCSS, responsive >=325px.
Backend: Node.js, TypeScript, NestJS, PostgreSQL, Prisma, Claude API.
Engineering: Jest/Vitest, Angular tests, Docker, Docker Compose.

Do NOT add Slack, Teams, Calendar, Gmail, auth, organizations, permissions, subscriptions, MCP, RAG, vectors, multi-agent, subagents, Agent Skills, mobile, or production SaaS features.

## Domain
Meeting: id, title, notes, createdAt, analyzedAt.
MeetingAnalysis: id, meetingId, summary, decisions, openQuestions, followUpRequired, followUpDate, model.
ActionItem: id, meetingId, task, owner, deadline, priority, status.
Statuses: OPEN, IN_PROGRESS, DONE.
Keep tables minimal.

## Claude analysis contract
Use a MeetingAnalyzer interface.
Production implementation: AnthropicMeetingAnalyzer.
Test implementation: FakeMeetingAnalyzer.
Claude must return structured output and must not invent missing data.
Owner absent => null.
Deadline absent => null.
Extract summary, decisions, actionItems, owner, deadline, priority, openQuestions, follow-up required/date.
Validate malformed model output before persistence.
ANTHROPIC_API_KEY backend env only; never frontend, source control, README real value, or commit.

## API
POST /api/meetings
GET /api/meetings
GET /api/meetings/:id
POST /api/meetings/:id/analyze
PATCH /api/action-items/:id
POST /api/meetings/:id/action-items if needed for human creation
DELETE /api/action-items/:id if needed for human deletion
Do not grow API unnecessarily.

## Frontend workspace
One professional workspace.
Left: Meetings list.
Center: meeting notes + Analyze with Claude.
Right/below: AI Workspace with Summary, Decisions, Open Questions, Action Items.
Human can edit action item, owner, deadline, priority/status, delete, add new item.
Clearly distinguish AI proposal from human decision/review.

## Tests
Backend: meeting creation, analysis orchestration, structured result validation, action item persistence, manual override, malformed AI output.
Frontend: meeting list, analysis rendering, status update, loading/error.

## Portfolio proof
Claude-assisted knowledge work; structured output; human-in-loop; task extraction; delegation; collaboration; NestJS; PostgreSQL/Prisma; clean AI boundary; deterministic AI tests; secure secrets.

## Learning map
At important stages document:
1. What we built.
2. Why.
3. Which Cowork concept it maps to.
Focus: knowledge work, context, delegation, task decomposition, structured collaboration, human review, AI proposal vs human decision, persistent work state.

## Completion
Angular frontend works.
NestJS backend works.
PostgreSQL + Prisma works.
Real Anthropic integration exists.
Meeting creation and AI analysis flow work.
Summary, decisions, action items, owner/deadline extraction work.
Human editing and status tracking work.
Analyzer abstraction + fake tests.
Backend/frontend tests PASS.
Frontend/backend builds PASS.
Lint PASS.
Docker build PASS.
GitHub Actions intentionally omitted to avoid CI credit usage.
Public GitHub repo.
README, screenshot, architecture diagram, docs/learning-map.md.
Clean main synchronized with GitHub.

Repository name: claude-meeting-action-workspace.
