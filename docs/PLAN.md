# Build Plan — Phased

Nine phases. Each ends at a state you can actually look at and judge, so we can
course-correct before the next one starts. See `ARCHITECTURE.md` for the system design.

---

## Phase 0 — Scaffold & infrastructure

Get a deployable skeleton live before writing any product code, so deployment is never
the thing that breaks on the last day.

- `create-next-app` — TypeScript, App Router, Tailwind v4, ESLint
- TanStack Query provider + devtools
- Supabase client wiring (browser client + server service-role client)
- SQL migration for the six tables in `ARCHITECTURE.md` §6
- Storage bucket `exam-pages`, public read
- `.env.example`, `.gitignore`, README skeleton
- Push to GitHub, connect Vercel, confirm a live URL serves a placeholder page

**Done when:** the Vercel URL loads and a `/api/health` route reports Supabase and Gemini
connectivity.

---

## Phase 1 — Design system & app shell

Blocked on the exported Figma PNGs — drop them in `/design`. Until they land I build to the
described structure, then reconcile.

- Extract tokens from the exports: colors, type scale, spacing, radii, shadows → Tailwind theme
- Collapsible sidebar: Home, My Classroom, Assignments, Exams, My Library
  - only Exams routes; the rest render disabled with a tooltip
  - collapse state persisted to `localStorage`
- App shell layout, top bar, base primitives (Button, Card, Chip, Progress, Tooltip)

**Done when:** the shell matches the Figma frames side by side and the sidebar collapses.

---

## Phase 2 — Upload & ingestion

The whole "no coordinate drift" property is established here, so this phase carries more
weight than a file picker usually would.

- Dual upload cards (Question Paper | Answer Sheet), drag-and-drop, multi-file, PDF + images
- Client-side rasterization via `pdfjs-dist` → PNG at 1600px width
- Image uploads downscaled to the same 1600px contract
- Per-page upload to Supabase Storage with real progress
- `POST /api/exams` creates the row and returns an id
- Validation: file type, size cap, page-count cap, encrypted-PDF detection

**Done when:** uploading a mixed PDF + image set produces a row whose
`question_paper_pages` / `answer_sheet_pages` hold correct, publicly-fetchable PNG URLs.

---

## Phase 3 — Agent core

Pure infrastructure, no product behaviour. Built and tested on its own because everything
after this depends on it and debugging it through the UI would be miserable.

- `lib/agent/loop.ts` — the turn loop, function-call dispatch, trace events
- `lib/agent/tools.ts` — tool registry: Zod schema → Gemini declaration → typed handler
- `lib/agent/limiter.ts` — token bucket + backoff with jitter (the free tier is ~10 RPM)
- `lib/agent/trace.ts` — persist turns to `agent_traces`
- Budgets: `maxTurns`, `budgetMs`, per-tool timeout
- A scratch script that runs a trivial two-tool agent end to end

**Done when:** the scratch agent completes a multi-turn tool conversation, and an induced
429 storm is absorbed by the limiter instead of failing the run.

---

## Phase 4 — Question extraction

- Question-extraction agent: `read_page`, `record_questions`, `finish`
- Prompt work for the parts the brief grades hardest:
  - every question, in **printed order**
  - labelled sub-parts as **separate entries** (`11(a)`, `11(b)`)
  - original numbering preserved verbatim, not renumbered
  - marks captured where printed (`[5 marks]`)
- Zod validation on every tool payload, with a repair turn on invalid output
- Persist to `questions` with `order_index` and `parent_number`

**Done when:** a real multi-page paper extracts with correct order and correct sub-part
splitting, verified by eye against the PDF.

---

## Phase 5 — Answer extraction

- Answer-extraction agent: `read_page`, `record_answer_block`, `finish`
- Per block: transcript, `box_2d`, any label the student wrote (`Ans 3.`), confidence
- Continuation detection — a block flagged as continuing the previous page becomes a second
  region on the same answer rather than a new answer
- Persist to `answers` with `regions[]`

**Done when:** blocks come back with boxes that visually land on the right handwriting, and
an answer deliberately split across a page break yields two regions.

---

## Phase 6 — Mapping, grading & feedback

- Mapping agent, **text only** — question register + answer blocks, no images
- Matching: written label first, semantic similarity as fallback
- Explicit `mark_unanswered` and `mark_unmatched` calls, so both are traceable decisions
- Grading: marks awarded vs max, verdict, per-question feedback
- Overall summary: total, percentage, strengths, gaps
- Full pipeline wired into the resumable step runner from `ARCHITECTURE.md` §5

**Done when:** all three edge cases hold on a fixture built to contain them — answers out of
order, a skipped question, and an answer matching nothing.

---

## Phase 7 — Review UI & highlighting

The screen the assignment is actually judged on.

- Left: question list with number, text, status chip, marks, feedback
- Right: answer sheet viewer — continuous scroll, zoom, page markers
- Highlight overlay per page, positioned via `box2dToRect`
- Click a question → scroll to page, animate the highlight
- Multi-page answers → page-indicator chips (`p2, p3`) to jump between regions
- Unanswered questions → explicit empty state, no viewer scroll
- Unmatched answers → their own section, clickable, highlights the same way
- Grading summary in the header

**Done when:** clicking through every question highlights the right region, including the
multi-page and unanswered cases.

---

## Phase 8 — Edge cases, resilience & polish

- Loading states with real stage reporting; skeletons over spinners
- Error states: upload failure, extraction failure, partial results, rate-limit stall
- Retry a failed stage without re-uploading
- Empty and zero states
- Keyboard nav through the question list; focus management on highlight jump
- Responsive down to laptop; the viewer degrades to a tab switch on narrow screens
- Mobile-safe fallback rather than a broken two-pane layout

---

## Phase 9 — Deploy & submission

- Final Vercel deploy, environment variables verified in production
- README: approach, model used, assumptions, limitations, local setup
- Test fixtures committed (`/fixtures`) with a note on what each one exercises
- Known-limitations section, written honestly — single-rect highlighting granularity,
  free-tier rate limits, handwriting-quality dependence
- Submission form: live URL, repo, approach, model, assumptions

---

## Sequencing notes

**Phase 1 is the only one blocked on you** — it needs the Figma exports in `/design`.
If they aren't ready, Phases 2 and 3 can run first; neither touches visual design.

**Phase 3 before 4** is deliberate. Building the loop while also debugging extraction
prompts means never knowing which layer is at fault.

**Risk to watch:** the Gemini free tier at ~10 RPM is the most likely thing to make this
feel broken during a demo. That's why the limiter is core (Phase 3), not polish (Phase 8).
