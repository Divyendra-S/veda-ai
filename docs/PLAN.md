# Build Plan — Phased

Nine phases. Each ends at a state you can look at and judge, so we can course-correct
before the next one starts. See `ARCHITECTURE.md` for the system design and
`DESIGN.md` for the tokens and geometry measured off the Figma exports.

Status: **Phases 0–5 complete**, except Phase 0's live URL, which is Phase 9's job.
Phase 2's end-to-end check ran with Phase 4 and passed. **Phase 6 next.**

---

## Phase 0 — Scaffold & infrastructure ✅

Get a deployable skeleton live before writing product code, so deployment is never the
thing that breaks on the last day.

- ✅ `create-next-app` — TypeScript, App Router, Tailwind v4, ESLint
- ✅ TanStack Query provider + devtools
- ✅ Supabase wiring on the publishable/secret key system
- ✅ SQL migration (`supabase/migrations/0001_init.sql`) — five tables, applied
- ✅ Storage bucket `exam-pages` — **private**, 15MB cap, image mime types only
- ✅ Generated DB types in `src/lib/supabase/database.types.ts`
- ✅ `.env.example`, `.gitignore`, `/api/health`
- ⬜ Push to GitHub, connect Vercel, confirm a live URL

**Done when:** the Vercel URL loads and `/api/health` reports Supabase and Gemini green.

Two decisions changed during this phase, both recorded in `ARCHITECTURE.md`:

- The bucket is **private, not public read**. The browser uploads through short-lived
  signed URLs minted server-side and reads through signed download URLs. Page images
  still never pass through a serverless function, but the bucket is not writable by
  anyone holding the publishable key, and a student's answer sheet is not on a
  guessable public URL.
- RLS is enabled on all five tables with **zero policies**, which makes them
  unreachable from the browser. Every read and write goes through a route handler on
  the secret key. The Supabase advisor flags this as INFO; that is the intended state,
  not an oversight.

---

## Phase 1 — Design system & app shell ✅

Unblocked — the four exports landed in `/images`. Tokens were sampled from the pixels
rather than estimated; see `DESIGN.md`.

- ✅ Tailwind theme: brand oranges, ink scale, surfaces, verdict colours, radii, shadows
- ✅ General Sans self-hosted via `next/font/local` (the typeface in the design)
- ✅ App shell — 12px inset, floating rounded panels on a fixed vertical gradient
- ✅ Sidebar, two widths: 304px expanded / 68px collapsed rail
  - Home, My Classroom, Assignments, Exams, My Library
  - **only Exams routes**; the rest are inert by design, and must *look* inert rather
    than dead — cursor, no hover lift, `aria-disabled`
  - "AI Teacher's Toolkit" pill, Settings, school card (crest + name + city)
  - collapse state persisted to `localStorage`, read before paint to avoid a flash
- ✅ Topbar — 56px: back button, clipboard + "Exams" breadcrumb, help, bell with dot,
  sparkle button, avatar + name + chevron
- ✅ Primitives: `Button` is the only one that earned its own file. Card, IconButton and
  FileChip each had exactly one caller, so they live at that call site rather than as
  premature abstractions; `ScorePill` arrives with Phase 7, which is the first screen that
  has a score to put in it.

**Done when:** the shell sits next to `01-upload.png` and `03-loading.png` and matches,
and the sidebar collapses to the rail in the loading/review screenshots.

---

## Phase 2 — Upload & ingestion ✅

The "no coordinate drift" property is established here, so this carries more weight
than a file picker usually would.

- ✅ Two dashed drop cards side by side inside a `#f5f4f4` well — Question Paper |
  Answer Sheet — drag-and-drop, multi-file, PDF + images
- ✅ Filled state: file chip with PDF glyph, name, `2MB • 2 Pages`, and a dark circular
  × that clears just that side
- ✅ `Start Mapping →` is disabled grey until **both** sides hold a file, then goes to ink
- ✅ Client-side rasterization via `pdfjs-dist` at 1600px width; image uploads are
  downscaled to the same contract, so everything downstream sees one `PageImage[]` shape
- ✅ `POST /api/exams` creates the row **and** mints one signed upload URL per page; the
  browser PUTs pages straight to Storage, three at a time
- ✅ Validation: file type, mixed-format rejection, 10MB cap per the design's own label,
  30-page cap per document, encrypted-PDF detection

**Done when:** a mixed PDF + image set produces an exam row whose `question_paper` and
`answer_sheet` hold correct page paths that render through signed URLs. — **met**, run
end to end alongside Phase 4:

```
pages: 2 × 1600×2264
exam:  ce81010d-814d-499f-9003-ce17fbd9189b
paths: …/question/000.png, …/question/001.png
upload: 4 pages via signed URLs
  page 1: HTTP 200 179068B 1600×2264 byte-identical=true
  page 2: HTTP 200 188034B 1600×2264 byte-identical=true
```

Byte-identical matters more than HTTP 200 does: it proves nothing between the encoder and
the model re-compresses or re-samples the page, which is the property the whole coordinate
design rests on.

One deviation from the plan as written, and one reversal:

- **One endpoint, not two.** Creating the row and minting the upload URLs in a single
  `POST /api/exams` means there is no window where a row exists with nowhere to put its
  pages; if signing fails, the row is deleted before the response returns.
- **WebP q0.92 reversed back to lossless PNG.** Phase 2 chose WebP for upload size. Phase 4
  measured it against the model and found it silently destroys extraction — see Phase 4
  below and `lib/pdf/rasterize.ts`. Pages are PNG.

The client rasterizes rather than the server for one reason worth stating plainly: the
model and the review UI must see **the same bitmap**. Rasterizing twice — once to show
the teacher, once to send to Gemini — is how a bounding box ends up 4px off.

---

## Phase 3 — Agent core ✅

Pure infrastructure, no product behaviour. Built and tested on its own because
everything after depends on it, and debugging it through the UI would be miserable.

- ✅ `lib/agent/loop.ts` — turn loop, function-call dispatch, trace events
- ✅ `lib/agent/tools.ts` — tool registry: Zod schema → Gemini declaration → typed handler
- ✅ `lib/agent/limiter.ts` — token bucket + jittered backoff (the free tier is ~10 RPM)
- ✅ `lib/agent/trace.ts` — persist turns to `agent_traces`
- ✅ `lib/gemini/client.ts` — cached client, `gemini-2.5-flash`, `GEMINI_MODEL` override
- ✅ Budgets: `maxTurns`, `budgetMs`, per-tool timeout
- ✅ Harness at `/api/dev/agent-smoke` (404s in production)

**Done when:** the scratch agent completes a multi-turn tool conversation, and an
induced 429 storm is absorbed by the limiter instead of failing the run. — **met**,
all four checks green:

| check | proves |
| --- | --- |
| limiter | 3 synthetic 429s absorbed, `retryDelay` hint honoured, a 400 still propagates |
| dispatch | bad arguments and unknown tools come back as a `functionResponse` carrying `error`, so the model gets a repair turn instead of the run failing |
| trace | batched writes land in `agent_traces`, and a 400KB inline image is redacted to a byte count before it can reach a row |
| agent | 2 round trips, parallel calls in one turn, terminal tool → result |

Decisions taken during the phase:

- **Zod is the only schema.** Gemini's `parametersJsonSchema` accepts plain JSON
  Schema, so `z.toJSONSchema()` feeds the declaration and the same schema validates
  the response. Writing an OpenAPI blob for the model and a validator for the handler
  is how tool arguments silently drift.
- **The model's `Content` is replayed verbatim**, never rebuilt from the parsed text
  and calls. Thinking models attach `thoughtSignature` to their parts and lose their
  own reasoning across a tool call if it is dropped.
- **Tool results can carry attachments.** A `functionResponse` is JSON-only, so a
  handler returning a page image emits it as a separate user turn. Proven with a real
  PNG the model had to look at, because Phase 4's `read_page` depends on it.
- **`agent_traces.agent` widened to include `grading`** (`0002_grading_trace_agent.sql`),
  so Phase 6 does not have to migrate mid-build.
- The harness is a dev-gated route rather than a node script: it runs in the real
  Next.js runtime, so `server-only`, path aliases and env loading are all exercised as
  they will be in production.

---

## Phase 4 — Question extraction ✅

- ✅ Agent tools: `read_page`, `record_questions`, `finish`
- ✅ Prompt work for the parts the brief grades hardest:
  - every question, in **printed order**
  - labelled sub-parts as **separate entries** — `11 (a)` and `11 (b)` are two rows
  - original numbering preserved verbatim, never renumbered
  - marks captured where printed (`[5 marks]`)
- ✅ Zod validation on every tool payload, with a repair turn on invalid output
- ✅ Persist to `questions` with `number` / `parent_number` / `part_label`
- ✅ Step runner (`lib/exam/pipeline.ts`), `POST /api/exams/[id]/run`, `GET /api/exams/[id]`
- ✅ Review screen scaffold, polling through the three-layer query stack

**Done when:** a real multi-page paper extracts with correct order and correct sub-part
splitting, verified by eye against the PDF. — **met.** A 2-page, 13-item Biology paper
extracted as 14 entries, checked line by line against the source:

| property | result |
| --- | --- |
| count | 14 entries from 13 printed items — `11` split into `11 (a)` and `11 (b)` |
| order | 6 on page 1, 8 on page 2, printed order throughout |
| numbering | copied verbatim, never renumbered |
| marks | 2,2,2,2,2,5 / 5,5,5,5,(2,3),5,5 — every one matches the page |
| shared stem | question 11's figure description carried into both parts, so each reads alone |
| boxes | present on all 14; cropping the page to three of them lands on the right lines |

### The finding that changed the build

The first end-to-end run returned 13 fluent, well-formed questions **about business
ethics**. The paper is Biology. Nothing errored; nothing was retried; the register looked
entirely plausible.

The cause was the page encoding, not the prompt. The same page was put to the model in
eleven encodings:

| encoding | result |
| --- | --- |
| PNG 1600px / 1024px / 768px | transcribed correctly |
| WebP lossless | transcribed correctly |
| WebP q75, q85, q92, q96 | **fabricated** |
| JPEG q85, q92, q96, q100 | **fabricated** |
| WebP q92 at 2200px | **fabricated** |

Resolution is not the variable — 768px lossless passes and 2200px lossy fails. Lossy
ringing around glyph edges survives the model's own downscaling as noise, and a vision
model reading noise writes what a page like that usually says. Pages are now PNG
(`lib/pdf/rasterize.ts`), which is the only lossless encoding `canvas.toBlob` offers.

This is the single most valuable thing the phase produced. It fails silently, it is
invisible to a spot check of the UI, and it would have looked like a bad prompt.

### Decisions taken during the phase

- **The agent reads one page at a time** rather than being handed the whole paper up front.
  It costs round trips on a ~10 RPM budget, but it anchors each recording decision to a
  single image, which is what makes "in printed order" and the per-question page attribution
  fall out instead of being inferred. Page 1 rides along with the instructions, since the
  model would open it first anyway.
- **`record_questions` replaces the register for its page.** A correction is a second call
  carrying the full corrected list, so a repair turn cannot duplicate a question.
- **`finish` is a checkpoint, not just a terminator.** It refuses to end the run if a page
  was never recorded, or if the model's own count disagrees with what it recorded — and it
  refuses by returning an error payload, which hands the model a repair turn rather than
  failing the run. A page with no questions still has to be recorded, explicitly, as empty.
- **The label is authoritative, the decomposition is repaired.** `number` is what was read
  off the page; `parentNumber` and `partLabel` are derived from it when it clearly carries a
  part, because a model that reads "11 (a)" correctly will still occasionally hand back
  `parentNumber: "11 (a)"`.
- **Steps, not one long function.** The pipeline is a list; each step persists its output and
  moves the stage on before the next starts, so re-entry after a serverless timeout redoes
  one step and nothing else. A `updated_at` lease stops two tabs running the same extraction
  twice. Phases 5 and 6 append to the list.
- **The coordinate contract is confirmed on real output.** Cropping the page to three
  returned boxes lands on the right lines, so `box2dToRect`'s y-first 0–1000 reading is
  right — the thing Phase 7's highlighting depends on.

## Phase 5 — Answer extraction ✅

- ✅ Agent tools: `read_page`, `record_answer_blocks`, `finish`
- ✅ Per block: transcript, `box2d`, any label the student wrote (`Q2.`), confidence
- ✅ Continuation detection — a block flagged as continuing the previous page becomes a
  second region on the same answer rather than a new answer
- ✅ Persist to `answers` with `regions[]`

The tool is `record_answer_blocks`, plural and per page, not the singular
`record_answer_block` this plan first named. A per-block call cannot express "here is
this page again, corrected", so it would have given up the replace-on-re-record
contract that makes a repair turn safe in question extraction.

### Decisions taken during the phase

- **This agent never sees the question paper.** It reads the answer sheet as a sheet of
  paper and reports what is on it. Every hard case in the brief then falls out of the
  split instead of needing its own code path: answered out of order is just blocks in
  the order they were written, unanswered is a block that never appears, and an answer
  to no question is a block whose label matches nothing. Mapping decides all three, with
  both registers in view.
- **The label is copied, never inferred.** The prompt forbids working out from the
  content which question a block probably answers. An invented label is worse than no
  label, because the next pass will trust it.
- **The model flags a continuation; the code stitches it.** Folding a flagged block into
  the previous answer's `regions[]` happens in ordinary code, so a page-4 mistake cannot
  corrupt a page-1 answer. Two signals join a block to an existing answer, and the order
  matters: a label the student actually wrote wins, because it also catches a student who
  answered Q6, moved on, and came back to Q6 four pages later — adjacency cannot see
  that. Adjacency is the fallback for the ordinary page break, where the continuation
  carries no label because the sentence simply keeps going.
- **`status` is derived, not stored by the extractor.** An answer with no `question_id`
  is exactly what "unmatched" means, so `replaceAnswers` computes one from the other and
  `AnswerDraft` has no `status` field to get wrong.
- **A blank answer sheet is a result, not a failure.** Unlike the question register, an
  empty answer list is recorded rather than raised — every question simply goes
  unanswered.
- **`finish` gained a third check.** As well as unrecorded pages and a count mismatch, it
  refuses once if any block came back without a box, since a block with no box cannot be
  highlighted and highlighting is what this pass exists for. Once, not forever: if the
  model still cannot place a block, the transcript is worth keeping.

### Done when

> boxes visually land on the right handwriting, and an answer deliberately split across a
> page break yields two regions — **both met.**

A 4-page handwritten sheet against the 13-item paper from Phase 4, written to exercise
every case in the brief at once: answers out of order, one running across a page break,
one for a question that does not exist, and five questions left unanswered.

| property | result |
| --- | --- |
| blocks → answers | 11 blocks folded into 10 answers |
| page break | `Q6` is one answer with two regions, pages 2 and 3 |
| out of order | recorded `Q1, Q2, Q5, Q3, Q6, Q7, Q11 (a), Q11 (b), Q14, Q9` — as written, not sorted |
| no matching question | `Q14` recorded; the paper stops at 13 |
| unanswered | `4, 8, 10, 12, 13` produce no block, which is the correct absence |
| labels | copied verbatim, `Q11 (a).` kept as the student wrote it |
| transcripts | verbatim including the diagram descriptions; confidence 1.0 throughout |

Boxes were checked by measurement rather than by eye. The verification script thresholds
each page into rows of ink and asks, per box, which rows it covers and which it cuts:

```
page 4 ink rows: 83-96 114-126 168-180 221-233 255-264 304-317 334-348 369-378
  Q11 (a).  box  69-138  covers 2 rows
  Q11 (b).  box 154-192  covers 1 row
  Q14.      box 208-276  covers 2 rows
  Q9.       box 270-390  covers 3 rows
```

**26 of the 27 written lines are covered, and none is clipped.**

### The one that is wrong, and what fixing it cost

The first pass clipped the descenders of the last line of nearly every answer — the model
puts the bottom edge on the baseline rather than below it — and on page 1 it started `Q1`'s
box a full line low, losing the opening line.

The descender clipping is gone: boxes are padded 8 units vertically before they are stored.
That is a deliberately blunt instrument, and it is the right shape of instrument here,
because the two errors are not equally bad. A highlight that clips its last line reads as
broken; one that over-covers by a fifth of a line reads as fine. The gap between two
adjacent answers on a ruled sheet is several times the pad, so nothing bleeds into its
neighbour.

`Q1` is still wrong, in the same way, in all three runs at temperature 0 — its box covers
the second of its two lines. A prompt telling the model to check the top edge of the first
block on a page hardest did not fix it and cost a fresh clip elsewhere, so it was reverted;
the pad did all the real work. Snapping boxes to measured ink rows would fix it exactly,
and was rejected: it works on a clean render and would be actively unreliable on a
photographed page with shadows, skew and ruled lines, which is the input this app is
actually for. Recorded as a limitation — the highlight still lands on the right answer, one
line short at the top.

---

## Phase 6 — Mapping, grading & feedback

- Mapping agent, **text only** — question register + answer blocks, no images
- Matching: written label first, semantic similarity as fallback
- Explicit `mark_unanswered` and `mark_unmatched` calls, so both are traceable decisions
- Grading: marks awarded vs max, verdict, per-question feedback in the voice the design
  shows ("Excellent work! You correctly identified the chloroplast…")
- Overall summary: total, percentage, strengths, gaps
- Wired into the resumable step runner from `ARCHITECTURE.md` §5

**Done when:** all three edge cases hold on a fixture built to contain them — answers
out of order, a skipped question, and an answer matching nothing.

---

## Phase 7 — Review UI & highlighting

The screen the assignment is actually judged on.

- Left panel: `Extracted Questions (from question paper)` + `Expand All`
  - each row: dark round number badge, optional part letter, question text, score pill,
    chevron
  - score pill colour is derived, not stored: full marks green, zero red, anything
    between amber
  - expanding a row reveals an **AI Feedback** block in a `#f0f0f0` well
  - the selected row takes a 2px `#ff8d36` border and its badge turns brand orange
- Right panel: dark `#303030` viewer — `Answer Sheet`, `− 100% +` zoom, `‹ Page n of N ›`
  - continuous vertical scroll through all pages, not a pager
- Highlight overlay per page positioned via `box2dToRect`, drawn as a translucent green
  fill with a `#3dd218` border and a `#34ac15` `Q2` tab above its top-left corner
- Click a question → scroll its region into view and animate the highlight
- Multi-page answers → one overlay per region, plus page chips to jump between them
- Unanswered questions → explicit empty state, no viewer scroll
- Unmatched answers → their own section, clickable, highlights the same way
- Grading summary in the header

**Done when:** clicking through every question highlights the right region, including
the multi-page and unanswered cases.

---

## Phase 8 — Edge cases, resilience & polish

- The `Extracting… / This may take a while` screen wired to real stage reporting
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
- Known limitations, written honestly — single-rect highlighting granularity, free-tier
  rate limits, handwriting-quality dependence
- Submission form: live URL, repo, approach, model, assumptions

---

## Sequencing notes

**Phase 3 before 4** is deliberate. Building the loop while also debugging extraction
prompts means never knowing which layer is at fault.

**Risk to watch:** the Gemini free tier at ~10 RPM is the most likely thing to make this
feel broken during a demo. That is why the limiter is core (Phase 3), not polish
(Phase 8).

**Design fidelity:** the exports are a 1440px-wide frame. The build treats those numbers
as a baseline and flexes around them rather than pinning to them, because a reviewer
will open the live URL at whatever width their laptop happens to be.
