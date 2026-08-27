# Architecture — AI Assessment Extraction & Answer Mapping

## 1. Goal

A teacher uploads a **question paper** and one **student answer sheet**, and gets back:

- every question, in printed order, with sub-parts split out (`11(a)`, `11(b)`)
- the student's answer for each question
- the **exact region on the answer sheet** where that answer lives
- which questions were left unanswered, and which answers match nothing
- marks, verdict and AI feedback per question, plus an overall summary

Core flow: **Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback**

---

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript | Recommended by the brief; API routes + SSR in one deploy |
| Styling | Tailwind CSS v4 | Fast, matches a Figma handoff cleanly |
| Client data | TanStack Query (React Query) | Polling the job status is the main client concern |
| AI | Gemini `gemini-3.7-flash` via `@google/genai` | Free tier; native spatial grounding (`box_2d`) |
| Storage | Supabase Storage | Page images must outlive a stateless serverless invocation |
| State | Supabase Postgres | Job state must survive across polling requests |
| Validation | Zod | One schema drives both the Gemini response contract and the DB write |
| Deploy | Vercel | Live URL required by the brief |

No auth (not required). Postgres is used for **job durability**, not user data — a serverless
function cannot hold an in-flight job in memory between the client's polling requests.

---

## 3. The central design decision: coordinates

Everything about "highlight the exact answer region" hinges on one question:
**do the coordinates the model returns line up with the pixels the teacher sees?**

The answer here is *yes, by construction*, because of one choice:

> **PDFs are rasterized to PNG in the browser, and those exact PNGs are both
> (a) sent to Gemini and (b) rendered in the viewer.**

`pdfjs-dist` renders each PDF page to a canvas at a fixed width (1600px), which is uploaded
to Supabase Storage. Loose image uploads take the same path (downscale to max 1600px wide).

This buys four things:

1. **No coordinate drift.** The model and the viewer look at the identical bitmap, so a
   normalized box maps 1:1 onto the rendered image at any zoom level.
2. **No native server dependencies.** Rendering PDFs server-side needs `@napi-rs/canvas`
   or similar, which is painful on Vercel serverless. Doing it client-side removes that entirely.
3. **A uniform downstream contract.** After ingestion there is no such thing as a PDF —
   only `PageImage[]`. Every later stage handles exactly one input type.
4. **Free progress UI.** Rasterization is per-page and observable, so the upload screen has
   something real to report before the AI work even starts.

**PNG, and specifically not a lossy format.** Phase 2 briefly encoded pages as WebP at
quality 0.92 to keep uploads small; Phase 4 reversed that on measurement. The same page of
printed 9pt text was put to Gemini 2.5 Flash in eleven encodings: every lossless one (PNG at
768/1024/1600px, lossless WebP) was transcribed correctly, and every lossy one (WebP
q75–q96, JPEG q85–q100) was transcribed **wrong** — the model invented a fluent question
paper on an entirely different subject, with plausible mark allocations and no error of any
kind. Raising the resolution to 2200px did not help; only removing the compression did.
Lossy ringing around glyph edges survives the model's own downscaling as noise, and a vision
model reading noise fills in what a page like that usually says. A silent fabrication is the
worst failure this app can have, so the pages it reads are lossless. `canvas.toBlob` offers
no lossless WebP — quality 1.0 is still lossy VP8 — so PNG is the only option the browser
actually gives.

### Coordinate contract

Gemini returns `box_2d` as `[ymin, xmin, ymax, xmax]`, normalized to **0–1000** (not 0–1,
and y-first — a classic source of transposed-rectangle bugs). We store it verbatim and
convert in exactly one place, `lib/geometry.ts`:

```ts
// box_2d is [ymin, xmin, ymax, xmax] on a 0..1000 scale, y-first.
export function box2dToRect(box: Box2d, w: number, h: number): Rect {
  const [ymin, xmin, ymax, xmax] = box
  return {
    left:   (xmin / 1000) * w,
    top:    (ymin / 1000) * h,
    width:  ((xmax - xmin) / 1000) * w,
    height: ((ymax - ymin) / 1000) * h,
  }
}
```

Storing the raw model output and converting late means the highlight survives zoom,
window resize and responsive layout with no re-computation of stored state.

### Region model (multi-page answers)

The highlight granularity is **one box per answer, per page**:

```ts
type AnswerRegion = { pageIndex: number; box2d: Box2d }
type Answer = { regions: AnswerRegion[]; /* ... */ }
```

Usually `regions.length === 1`. An answer that runs off the bottom of page 2 and continues
on page 3 is simply two regions. This satisfies the brief's multi-page requirement without
per-line box extraction.

**The model flags, the code stitches.** A block records whether it continues the answer
that ran off the previous page; folding that into `regions[]` is done in ordinary code
(`lib/extraction/answers.ts`, `collect`). Asking the model to assemble the final answer
list instead would make a page-4 mistake able to corrupt a page-1 answer, and would make
the per-page "record this page again to correct it" contract impossible. Two signals join a
block to an existing answer, and the order matters: a label the student actually wrote wins,
because it also catches the student who answered Q6, moved on, and came back to Q6 four
pages later — adjacency alone cannot see that. Adjacency is the fallback for the ordinary
page break, where the continuation carries no label because the sentence simply keeps going.

**Known tradeoff:** a single rectangle over-covers when an answer begins or ends mid-line —
the box will include the tail of a neighbouring answer's line. Accepted deliberately in
exchange for far fewer output tokens and simpler code. `AnswerRegion[]` is the natural
upgrade path: swapping to per-line boxes later means more entries in the same array and a
different prompt, with no change to the storage schema or the rendering layer.

---

## 4. The agent layer

Hand-rolled agent loop — no agent framework. `@google/genai` is used only as the HTTP client
for the Gemini API; the loop, the tool dispatch, the budgets and the tracing are ours.

### 4.1 The loop

`lib/agent/loop.ts` is roughly 120 lines and is the only place that talks to Gemini:

```
runAgent({ model, system, input, tools, maxTurns, budgetMs, onEvent })

  loop:
    response = gemini.interactions.create(...)
    calls    = extractFunctionCalls(response)
    if calls.length === 0 -> return response
    results  = await Promise.all(calls.map(dispatch))   // parallel, per-tool timeout
    input.push(...calls, ...results)
    if ++turn > maxTurns or elapsed > budgetMs -> stop with partial results
```

Every turn emits a trace event. Traces persist to `agent_traces`, which makes a bad
extraction debuggable after the fact instead of only reproducible live.

**Guardrails, because a runaway loop on a free tier is a real failure mode:**
- `maxTurns` per agent (hard stop, returns partial work rather than throwing)
- wall-clock `budgetMs` per agent
- per-tool timeout
- unknown tool name → returns an error result *to the model* rather than crashing the run

### 4.2 Rate limiting is not optional

Gemini's free tier allows roughly **10 requests/minute** on Flash. A 12-page paper driven by
an agent loop will blow through that and start returning 429s mid-run.

`lib/agent/limiter.ts` is a serialized queue with a token bucket and exponential backoff
with jitter on 429/5xx. Every Gemini call in the app goes through it. This is treated as a
core component, not error handling bolted on later — without it the app fails on exactly the
inputs it is meant to handle.

The pace itself is `GEMINI_RPM`, defaulting to 10. It cannot be inferred — the free tier
allows ten requests a minute, a billed key allows a thousand, and the API will not say which
one it is looking at — and it is the single largest lever on how long a run takes. The
default stays at the free-tier figure because that is the key a reviewer opening this
project will have; guessing high there turns every run into a 429 storm, while guessing low
only costs time.

Concurrent steps each hold their own bucket, so a retry stays attributable to the agent that
provoked it. The buckets are therefore told how many of them there are (`rpmShare`) — two
steps each pacing at 10 would together fire at 20.

### 4.3 Four agents, one loop

The same loop runs four times with different tool surfaces. Splitting them keeps each
context small and each tool surface unambiguous:

| Agent | Input | Tools | Produces |
|---|---|---|---|
| **Question extraction** | question paper pages (vision) | `read_page`, `record_questions`, `finish` | ordered question register |
| **Answer extraction** | answer sheet pages (vision) | `read_page`, `record_answer_blocks`, `finish` | answer blocks + `box_2d` + transcript + any label the student wrote |
| **Mapping** | the two registers (**text only**) | `map_answers`, `mark_unanswered`, `mark_unmatched`, `finish` | which question each block answers |
| **Grading** | each question with its answer (**text only**) | `record_grades`, `finish` | marks, per-question feedback, summary prose |

The last two see **no images**, which is what makes them cheap and what lets them reason
over the whole paper at once. Extraction has already done the reading; both are
text-to-text problems over lists.

Mapping and grading began as one pass and were split, for the reason the step runner
exists at all: a serverless invocation that dies while writing feedback should not also
throw away the matching. It costs one extra load of two small tables and buys a much
smaller blast radius, plus two contexts that each do one job — mapping never sees a mark,
grading never has to work out which answer is which.

Every tool that records takes a **list**. The free tier paces requests at roughly one
every six seconds, which makes a round trip, not a token, the unit that costs; one
decision per call would put mapping at twenty-odd turns. Batching does not weaken §4.4's
requirement that each decision be explicit — every entry is still a traced tool call — and
in practice mapping now finishes in one turn.

### 4.4 Why mapping is a separate pass

Handling the brief's three edge cases falls out of this split naturally:

- **Answered out of order** — the agent sees all answer blocks at once and matches on the
  student's written label (`Ans 3.`, `Q7`) first, falling back to semantic similarity.
  Position on the page is a weak hint, not the mechanism.
- **Unanswered** — a question that no block claims. Explicit `mark_unanswered` tool call
  rather than inferred from absence, so the model has to make a decision we can trace. The
  call is a forcing function, not a second source of truth: what reaches the database is
  still derived from the mappings, and `finish` refuses to end a run while any question is
  neither mapped nor explicitly marked.
- **Unmatched** — a block that claims no question. Surfaced in its own UI section rather
  than silently dropped; a mis-extraction stays visible to the teacher.

---

## 5. Job orchestration

Serverless functions time out. A multi-page extraction will not reliably finish inside one
invocation, so the pipeline is **resumable and step-based**.

```
POST /api/exams               -> create exam row, return id
POST /api/exams/[id]/run      -> advance the pipeline; maxDuration = 300
POST /api/exams/[id]/run?retry=1 -> the same, but resume an exam already in error
GET  /api/exams/[id]          -> current status + partial results (React Query polls this)
```

`run` processes steps until the pipeline is done **or** ~240s have elapsed, then returns
`{ done: false }`. The client immediately calls `run` again. Each completed step is
persisted, so re-entry is idempotent and resumes where it left off.

The steps are the four agents of §4.3, and a step's `stage` is also the name its traces are
written under — one union, not two that can drift:

| stage | phase | writes | progress |
|---|---|---|---|
| `questions` | 0 | the question register | 40 |
| `answers` | 0 | answer blocks, regions, transcripts | 70 |
| `mapping` | 1 | `answers.question_id` and `status` | 85 |
| `grading` | 2 | the `gradings` rows and `exams.summary` | 100 |

**Steps sharing a phase run concurrently.** Reading the question paper and reading the
answer sheet touch nothing in common — neither reads what the other writes — and they were
sequential only because a list is sequential. Running them together halves the wait before
matching can start. Matching needs both, so it is a phase of its own; grading needs the
matching.

Two consequences worth naming. A phase that fails re-runs *whole* on retry, including the
step in it that succeeded: one wasted extraction, in exchange for not tracking per-step
completion, and every step replaces its own output so the result is the same either way.
And the stage recorded on a failure is the step that actually broke, not the phase's
name — the review screen reads that stage to say what failed and what survived, and with
two steps in flight the phase name would be a coin flip between them.

Each step reads what the previous one persisted rather than being handed it in memory,
because that is the path a resumed run always takes, so it is the path worth exercising on
every run. Mapping skips its model call entirely when the sheet came back blank — every
question is then unanswered, which grading already handles without asking anyone.

A failed exam is terminal for the polling loop: `run` returns `{ done: true, status:
"error" }` and does not restart, so a client that keeps calling cannot resurrect a hopeless
extraction and burn quota doing it. `?retry=1` is the single exception, and it is a teacher
pressing a button. It clears the error, resumes at the stage that failed — every step
replaces its own output, so the steps that finished stay finished and nothing is uploaded
again — and it deliberately skips the lease check, because an errored exam has no live
invocation to collide with and a lease left by the run that failed must not refuse the
retry that follows it.

The client's own loop absorbs three consecutive *transient* faults with a widening backoff
(a cold function, a dropped connection, a 502 in front of the region) and stops at the
first definite one. A fetch that never reached the server has no status, and that counts as
transient.

Progress is written to the exam row as it happens, so the polling `GET` always reflects real
state — the loading screen reports actual stage and page counts and draws a determinate bar
from `progress`, not a fake animation.

Chosen over SSE deliberately: streaming gives smoother progress but dies with the connection,
and the recovery path ends up being polling anyway. One mechanism, no fallback to maintain.

---

## 6. Data model

```sql
exams        id, status, stage, progress, error, summary jsonb,
             question_paper_pages jsonb,   -- PageImage[]
             answer_sheet_pages   jsonb,   -- PageImage[]
             created_at

questions    id, exam_id, order_index, number, parent_number, text,
             max_marks, page_index, box2d jsonb

answers      id, exam_id, question_id NULL, label_written, transcript,
             regions jsonb,                -- AnswerRegion[]
             confidence, status            -- mapped | unmatched

gradings     id, exam_id, question_id, marks_awarded, max_marks, verdict, feedback

agent_traces id, exam_id, agent, turn, payload jsonb
```

`order_index` preserves printed order independently of `number`, so `11(a)` sorts correctly
next to `11(b)` and `9` without parsing the label at read time. `parent_number` groups
sub-parts for display.

`question_id NULL` on `answers` **is** the unmatched case — one nullable FK covers an edge
case that would otherwise need its own table.

---

## 7. UI

Two pages, one shell.

**Shell** — collapsible left sidebar: Home, My Classroom, Assignments, **Exams** (the only
live route), My Library. Collapse state persists to `localStorage`.

**Page 1 — Upload** (`/`)
Two upload cards side by side: Question Paper | Answer Sheet. Both accept PDF and images,
multi-file, drag and drop. Then rasterization progress per page, then the processing state
("Extracting… this may take a while") driven by real pipeline stage.

**Page 2 — Review** (`/exams/[id]`)
- **Left:** question list — number badge, part letter, text, score pill; expanding a row
  reveals the student's transcript and the AI feedback
- **Right:** answer sheet viewer — continuous page scroll, zoom, highlight overlay
- Clicking a question draws its regions, scrolls the first into view and rings it
- Unmatched answers in their own section, clickable and highlighting the same way
- Grading summary in the header

`buildReview` turns the one snapshot into rows, targets and regions; the panels hold no
lookup logic. A question and an unplaceable block are different rows on screen but the same
`Target` — a tag and a set of regions — so highlighting has a single code path. Selection is
held as a key and re-resolved against the current model each render, so a poll that replaces
the snapshot cannot leave the viewer drawing boxes from a payload the list has moved past.

Highlights are `div`s positioned from `box2dToRect` against a notional 100x100 page, which
yields exactly the percentages CSS wants: an overlay then tracks its image at any width with
no resize observer. Zoom is therefore only the width of the column the pages sit in — not a
transform and emphatically not the CSS `zoom` property, which cancels against percentage
widths and silently magnifies nothing (`PLAN.md` Phase 7).

**Below 64rem** the two panes become one, with a tab switch above them, and selecting a
question moves you to the sheet — otherwise the highlight is drawn on a panel nobody can
see. Both panels stay mounted and the hidden one is only `display: none`, so the viewer
keeps its scroll and zoom and the box a highlight scrolls to already exists by the time the
pane appears. The sidebar is forced to its rail at the same width, by the `rail:` variant
matching on the viewport rather than on the stored attribute, so the attribute keeps
meaning exactly what the teacher chose.

**A failed run does not empty the screen.** What survived renders and a banner names what
did not, because the steps persist independently: a run that died at grading still has a
full register, real answers and working highlights. Only a failure with nothing behind it
takes the whole panel. Selection also writes a line into a live region — which tag, which
page, which region of how many, or that the question was never attempted — because the box
appears in a panel a screen-reader user is not looking at.

---

## 8. Failure modes and how they surface

| Failure | Handling |
|---|---|
| Gemini 429 (free tier) | Limiter queues and retries with backoff; job stays `running` |
| Agent hits `maxTurns` | Returns partial results, job completes with a warning banner |
| Unreadable handwriting | Answer block recorded with low `confidence`; flagged in the UI |
| Question extracted with no answer | `unanswered` — a first-class state, not an error |
| Answer matching no question | `unmatched` — shown to the teacher, never dropped |
| Serverless timeout | Step runner returns `done: false`; client re-invokes and resumes |
| A step that failed outright | The exam is terminal for the polling loop. `POST /run?retry=1` — the **Try again** button — clears the error and resumes at that step; nothing is re-uploaded and no finished step is redone |
| A stage failing with earlier stages done | Partial results render and a banner names the failed step and what survived. Ungraded questions show `—`, not `0` |
| Transient fault between the client and the run route | Three consecutive ones are absorbed with a widening backoff; the first definite status stops the run |
| A page image that never finished uploading | `signPages` returns `url: null` for that page rather than throwing. The page keeps its slot at its own proportions, the numbering and every other page's highlights survive, and the placeholder says what happened |
| The snapshot itself failing to load | An explicit panel offering a re-read, not a spinner that never resolves |
| Corrupt / encrypted PDF | Caught during client-side rasterization, before any spend |
| A document with too many pages | Refused at `MAX_PAGES_PER_DOCUMENT` (`lib/exam/limits.ts`, currently **2**) — in the browser before anything is rasterized, and again in the route handler. A spend control, not a technical one: nothing breaks at thirty pages, it just costs fifteen times as much. See below |
| Box under-covers the answer | Every box is padded vertically before it is stored, because a highlight that clips reads as broken while one that over-covers reads as fine. Measured, not assumed — see Phase 5 in `PLAN.md` |
| Marks above the question's total | Clamped to the total and rounded to a half, and the adjustment is handed back to the model in the tool result — a mark over the total usually means it has the wrong question, which it can only notice if it is told |
| Verdict disagreeing with the marks | Not representable: `correct`/`partial`/`incorrect` is derived from awarded-vs-total. The model's own verdict is used only when the paper prints no marks to derive from |
| Summary contradicting the marks below it | Every figure in the summary is computed from the grades; the model supplies prose only, and is forbidden to state a score in it |
| A drawing recorded as prose | Grading credits a drawing however the transcript words it, and extraction is told to always use the `[Diagram: …]` form. Before both, one run in four deducted a mark for a diagram that the transcript plainly described — see Phase 6 in `PLAN.md` |

### What a run costs

Measured from this project's own `agent_traces`, on the 6-page fixture (2 question-paper
pages, 4 answer-sheet pages, 14 questions):

| agent | prompt tokens | output tokens |
| --- | --- | --- |
| questions (2 pages) | 9,201 | 3,104 |
| answers (4 pages) | 22,195 | 2,805 |
| mapping | 2,338 | 1,453 |
| grading | 12,686 | 9,485 |
| **total** | **46,420** | **16,847** |

At `gemini-2.5-flash` list price — $0.30/M in, $2.50/M out — that is **$0.056**.

The shape of that bill is the part worth knowing. Output tokens cost eight times what
input tokens do, and mapping and grading produce 65% of them while reading no images at
all: they scale with the **number of questions**, not the number of pages. So the page cap
is a real guard against a 40-page scan and a poor lever on cost — halving pages saves
around a tenth. The levers that actually move it are a paper with fewer questions and
`GEMINI_MODEL`, which is read from the environment: `gemini-2.5-flash-lite` is roughly six
times cheaper.

### How long a run takes

Measured end to end in Chrome, twice, on the same two files — the CBSE 2024 Class X Science
pair in `public/samples/` (2 question-paper pages, 2 answer-sheet pages, 13 question entries). The
clock starts at **Start Mapping** and stops when the review screen has rows.

| | as committed at Phase 8 | now |
|---|---|---|
| upload + rasterize | 8s | 9s |
| reading both documents | 48s, then 30s | **41s, together** |
| matching | 13s | 10s |
| grading | 16s | 15s |
| **total** | **118s** | **75s** |
| model calls | 11 | 9 |
| tokens | 28,346 in / 13,159 out | 23,348 in / 13,314 out |
| cost | $0.041 | $0.040 |

Three changes, and the comparison bundles all three because that is what a teacher
experiences:

1. **The two extractions run at the same time** (§5). They never shared data; they were
   sequential because a list is sequential. This is most of the 41 seconds.
2. **Pages no longer cost a round trip to fetch.** Each `read_page` call was a full turn
   that ended with the model looking at an image we were always going to send it — and
   because the whole history is re-sent every turn, removing turns takes prompt tokens
   down with it. The question paper gets every page attached to the opening request
   (`PRELOAD_PAGES` caps that at four, past which the opening request stops being a
   saving and starts being a wall of images). The answer sheet gets one page at a time,
   each arriving on the previous page's `record_answer_blocks` result — same turn count,
   for the reason in the next section.
3. **`GEMINI_RPM`** (§4.2). The old code paced at a hardcoded 10 requests a minute, which
   is the free tier's limit; the run above sets 300 because the key is billed.

### Why the answer sheet is still read one page at a time

Handed both pages at once, the model sometimes records both in a single response — and
when it does, the second page's boxes slide down by roughly a block: on the sample sheet,
answer 23's box came back drawn over answer 24's opening lines. Three replays of the real
conversation reproduced it once; the two replays that recorded each page in its own turn
were exact. A highlight on the wrong paragraph is the one failure this app cannot have.

So the page the model is boxing is the page it has just been given, and the next one
arrives only once this one is recorded. It costs nothing over the alternative — a two-page
sheet is two record turns and a finish either way — and it takes a page image out of the
opening request, so the answer agent's prompt tokens went **down**.

The question paper keeps every page up front: nothing it extracts carries a bounding box,
so there is no coordinate frame to confuse.

Note what did **not** change: the bill. Nine calls over the same images cost what eleven
did, within run-to-run noise. Speed and cost are separate levers here — the page cap moves
neither much, and the thing that would move cost is `GEMINI_MODEL`.
