# Learning map

This document maps what was actually built to the working concepts behind Claude Cowork. For each
concept it answers three questions: what we built, why, and how it relates to the concept.

Two limits apply to everything below:

- The project does not use a Cowork API and does not copy the Cowork product. It is a web
  application that makes one Claude API request per analysis. The mapping is about ways of
  working with Claude, not about product features.
- The Claude request path has not been exercised against the live API yet. Statements about what
  Claude "receives" or "is told" describe the code and prompt, verified by unit tests against a
  stubbed SDK client. Everything downstream of the analyzer is verified with the fake analyzer.

## Overview

| Concept | What we built | Main source |
| --- | --- | --- |
| [Knowledge work](#1-knowledge-work) | Notes in, structured analysis out | `meetings.service.ts`, `analysis.schema.ts` |
| [Context](#2-context) | A deliberately small, explicit input to Claude | `anthropic-meeting-analyzer.ts` |
| [Delegation](#3-delegation) | A human-triggered, narrowly specified handoff | `meeting-analyzer.ts`, `app.html` |
| [Task decomposition](#4-task-decomposition) | Notes split into discrete action items | `analysis.schema.ts`, `meetings.service.ts` |
| [Structured collaboration](#5-structured-collaboration) | One schema shared by model, API, database and UI | `analysis.schema.ts`, `schema.prisma`, `models.ts` |
| [Human review](#6-human-review) | Accept, edit, re-own, delete, add | `action-item-card/`, `action-items.service.ts` |
| [AI proposal vs human decision](#7-ai-proposal-vs-human-decision) | Provenance on every item, respected by re-analysis | `schema.prisma`, `models.ts`, `meetings.service.ts` |
| [Persistent work state](#8-persistent-work-state) | Meetings, analysis and task status in PostgreSQL | `schema.prisma`, `meetings.service.ts` |

Paths are relative to `apps/backend/src` or `apps/frontend/src/app` unless written in full.

## 1. Knowledge work

**What we built.** A meeting is a title plus free-form notes (up to 50,000 characters). Analysis
turns those notes into a summary, a list of decisions, a list of open questions, a follow-up flag
with an optional date, and action items. `MeetingsService.analyze()` orchestrates it;
`meetingAnalysisSchema` in `analysis/analysis.schema.ts` defines the result.

**Why.** Reading prose and extracting what was decided and who owes what is slow and easy to get
wrong. It is the kind of work that benefits from a first draft. The original notes stay visible
next to the analysis, so the draft can always be checked against its source.

**Concept.** Knowledge work here means transforming unstructured information into something a team
can act on. Claude does the reading and drafting; the result is an intermediate work product, not
a final answer.

## 2. Context

**What we built.** `buildUserMessage()` in `analysis/anthropic-meeting-analyzer.ts` gives Claude
exactly three things: the meeting title, the meeting date, and the notes inside
`<meeting_notes>` tags. The meeting date exists so relative dates such as "next Friday" can be
resolved. The system prompt states that the notes are the single source of truth, that missing
owners, deadlines and follow-up dates must be `null`, and that instruction-like text inside the
notes is meeting content, not a command.

**Why.** Output quality depends on what the model is given and on what it is told not to assume.
A small, explicit context makes the result explainable: every extracted item should be traceable
to a sentence in the notes. Stating what to do when data is absent is what prevents invented
owners and deadlines.

**Concept.** Context is a design decision. Claude knows nothing about this team beyond the notes,
so the application has to supply what matters (the date) and set the rules (do not fill gaps).
The project deliberately stops there: no other meetings, no retrieval, no external sources.

## 3. Delegation

**What we built.** Analysis never runs on its own. A person opens a meeting and presses
"Analyze with Claude" (`app.html`, `App.analyze()`), which calls
`POST /api/meetings/:id/analyze`. On the backend the handoff is the `MeetingAnalyzer` interface
(`analysis/meeting-analyzer.ts`): one method, a defined input, and a defined set of failures.
Refusals, truncated responses, rate limits and connection errors become typed errors that the
service maps to `502` or `503`.

**Why.** Delegating well means stating the job, the expected shape of the result, and what happens
when it does not work out. Keeping the handoff behind one interface also means the rest of the
system does not depend on a particular model or SDK, and that a deterministic stand-in
(`FakeMeetingAnalyzer`) can take Claude's place in every test.

**Concept.** Delegation is a deliberate act with a clear brief, not a background process. The
person chooses when to hand work over, and the system defines what "done" and "failed" look like
before the request is sent.

## 4. Task decomposition

**What we built.** The analysis contract requires `actionItems` as an array of separate objects,
each with `task`, `owner`, `deadline` and `priority`. Owner and deadline are nullable, and the
prompt says to leave them `null` rather than guess. `MeetingsService.analyze()` stores each
proposed item as its own `ActionItem` row and preserves the order Claude proposed them in.
New items always start with status `OPEN`; the model does not set status.

**Why.** "Follow up on the launch" is not trackable. A task with one owner, one deadline and one
status is. Splitting the notes into such units is what makes the later steps (review, ownership,
tracking) possible. Leaving unknown fields empty makes gaps visible: the card shows "Unassigned"
or "No deadline", which tells the team what still has to be decided.

**Concept.** Decomposition turns a body of discussion into independently ownable pieces. The model
proposes the breakdown; it does not get to complete it with assumptions.

## 5. Structured collaboration

**What we built.** One contract runs through the whole system:

- `meetingAnalysisSchema` (Zod) is sent to Claude as the required output format and is re-applied
  to the response by `parseMeetingAnalysis()`. Output that does not match is rejected with `502`
  and nothing is stored.
- `prisma/schema.prisma` persists the same fields in `MeetingAnalysis` and `ActionItem`.
- `models.ts` in the frontend mirrors the JSON the API returns.
- The AI Workspace panel renders fixed sections: Summary, Decisions, Open Questions, Follow-up,
  Action Items.

People and Claude work on the same `ActionItem` records. An item Claude proposed and an item a
person added have identical fields and sit in the same list.

**Why.** Free text from a model cannot be reviewed field by field, edited, filtered or tracked.
A shared structure can. Validating at the boundary means a malformed response is a handled error,
not corrupt data in the workspace.

**Concept.** Collaboration with an AI works when both sides write into an agreed structure. The
structure is what lets a person take over any single part of the model's output without redoing
the rest.

## 6. Human review

**What we built.** Every action item card (`action-item-card/`) offers:

- **Accept**, for an untouched AI proposal, which confirms it as it stands;
- **Edit** for task, owner, deadline and priority;
- a status selector;
- **Delete**, with an inline confirmation.

"Add item" creates a task by hand. Any update goes through `PATCH /api/action-items/:id`, and
`ActionItemsService.update()` sets `humanReviewed` on the stored item. The workspace header shows
"N total · M awaiting review", and a notice reading "AI analysis is a proposal and requires human
review." is always visible above the analysis.

**Why.** Claude can misread a note, miss a task or attach the wrong owner. Review is the control
that catches this before a proposal becomes someone's commitment. Making review a single click
when the proposal is right keeps the cost of that control low.

**Concept.** Human review is a step in the workflow with its own state, not an optional habit.
The system knows which items have been looked at and shows how many have not.

## 7. AI proposal vs human decision

**What we built.** Each `ActionItem` carries `source` (`AI` or `HUMAN`) and `humanReviewed`.
`provenanceOf()` in `models.ts` turns them into three visible states:

| State | Meaning | Shown as |
| --- | --- | --- |
| AI proposal | Claude proposed it; nobody has touched it | Violet badge, dashed card, Accept button |
| Human-reviewed | Claude proposed it; a person accepted or edited it | Green badge |
| Human-created | A person added it | Blue badge |

The distinction also controls behaviour. Re-analysis (`MeetingsService.analyze()`) replaces the
stored analysis and deletes only items with `source = AI` and `humanReviewed = false`. Anything a
person created or touched is kept. The analysis also stores the name of the model that produced
it, shown next to the AI Workspace heading.

**Why.** If a proposal and a decision look the same, people either trust everything or nothing.
Recording provenance in the data, not only in the UI, means a later analysis cannot overwrite a
human decision, and anyone can see who stands behind each task.

**Concept.** The model proposes; the person decides. That line is only real if the system stores
it and enforces it.

## 8. Persistent work state

**What we built.** PostgreSQL, accessed through Prisma, holds three tables: `Meeting` (with
`analyzedAt`), `MeetingAnalysis` (at most one per meeting, replaced on re-analysis) and
`ActionItem` (with `status`: `OPEN`, `IN_PROGRESS`, `DONE`). The analysis, its action items and
`analyzedAt` are written in one transaction, so a failure cannot leave a half-saved analysis. The
frontend keeps no state of its own beyond the current view; reloading the page shows the same
workspace. In Docker Compose the data lives in the named volume `db-data`.

**Why.** Meeting follow-up takes days or weeks. The value of the analysis is in what happens
afterwards: tasks get owners, move to "In progress", get done. That requires state that outlives
both the browser session and the model request.

**Concept.** Work with an AI is not a single exchange. The durable record of what was proposed,
what was decided and how far each task has come is what turns one analysis into an ongoing
workspace.

## What this project does not demonstrate

- Claude working across files, tools or multiple steps on its own. There is one request and one
  structured response per analysis.
- Subagents, multi-agent setups, Agent Skills, MCP, retrieval or connectors to Slack, Teams,
  Calendar or Gmail. These are explicit non-goals in `PROJECT_SPEC.md`.
- Multi-user collaboration. There is no authentication; "owner" is a name on a task, not an account.
- Verified behaviour of the live Claude API. See [`../PORTFOLIO_STATUS.md`](../PORTFOLIO_STATUS.md).
