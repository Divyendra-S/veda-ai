# AI Assessment Extraction & Answer Mapping

A teacher uploads a **question paper** and one **student's handwritten answer sheet**. The app
reads both, works out which answer belongs to which question, and — when you click a question —
draws a box over the **exact region of the sheet** where that answer was written. It also marks
the paper: score per question, a verdict, per-question feedback and an overall summary.

**Question Extraction → Answer Extraction → Answer Mapping → Grading/Feedback**

| | |
|---|---|
| **Live URL** | **https://veda-ai-five-phi.vercel.app** |
| **Repo** | https://github.com/Divyendra-S/veda-ai |
| **Model** | Google **Gemini 2.5 Flash** (`@google/genai`), function calling + native `box_2d` spatial grounding |
| **Stack** | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · TanStack Query · Supabase (Postgres + Storage) · Zod · pdf.js |

---

## Try it in one click

You don't need to go and find a matching paper and answer sheet. The upload screen has a
**"Load a real sample pair"** button that fills both cards, and the same two files are in
[`public/samples/`](public/samples) to download:

| file | what it is |
|---|---|
| `question-paper.pdf` | CBSE Class X Science, Board Exam 2024, code 31/5/1 — pages 11 and 13 of the official paper from `cbse.gov.in` |
| `answer-sheet.pdf` | Pages 4–5 of a topper's real answer booklet for that same paper, published by CBSE as a "model answer by candidate" |

Nothing there is generated. The pair deliberately exercises the hard cases: sub-parts as separate
entries, three questions never attempted, multi-line descriptive answers with their own `(1)/(2)`
numbering, and one block of writing ("Section B") that answers no question at all. Expected
result: **8/14, 57%** — seven answered, six skipped, one unplaceable.

A run takes about **75 seconds** and costs about **$0.04**.

> **Two notes the app also prints on the upload screen.** Uploads are capped at **2 pages per
> file** — that is a *spending* limit, not a technical one; every page is an image the model is
> billed to read, and the cap keeps a run to a few cents. And the deployed key is a **tier-1
> Gemini key**, so requests are paced rather than fired all at once — part of the wait is the run
> holding for its next slot.

---

## The ten decisions that shaped this

### 1. PDFs are rasterized **in the browser**, and those exact pixels go to both the model and the viewer

This is the one decision everything else leans on. `pdf.js` renders each page to a canvas at a
fixed 1600px width; that PNG is uploaded to Storage, sent to Gemini, *and* rendered in the review
pane. The model and the teacher look at the identical bitmap, so a normalized box maps 1:1 onto
the image at any zoom — **the highlight cannot drift**, by construction rather than by tuning.

It also removes any server-side native canvas dependency (painful on serverless), collapses PDFs
and images into one downstream type (`PageImage[]`), and gives the upload screen real per-page
progress before any AI work starts.

### 2. Pages are PNG, and specifically never lossy

An earlier phase encoded pages as WebP q0.92 to keep uploads small. Measuring reversed it: the
same page of printed 9pt text was put to Gemini in eleven encodings, and **every lossless one was
transcribed correctly while every lossy one was transcribed wrong** — the model invented a
fluent, confidently formatted question paper on an entirely different subject, with plausible
mark allocations and no error of any kind. Raising resolution didn't help; only removing the
compression did. A silent fabrication is the worst failure this app can have, so the pages it
reads are lossless. (`src/lib/pdf/rasterize.ts`)

### 3. The agent loop is hand-rolled — no agent framework

`src/lib/agent/loop.ts` is ~120 lines and the only place that talks to Gemini. A framework hides
exactly the details that decide whether a box lands on the right line: whether the model's own
`Content` is replayed **verbatim** (thinking models attach `thoughtSignature` to their parts, and
dropping it loses the model's reasoning across a tool call), whether parallel calls come back as
one `Content` or several, how a bad tool payload is fed back for repair, and where the rate
limiter sits. A tool never throws at the model — bad arguments return as a `functionResponse`
carrying an `error`, which gives the model a turn to fix itself instead of failing the run.

### 4. Four agents, not one prompt

| agent | sees | tools | produces |
|---|---|---|---|
| **Questions** | question-paper pages (vision) | `read_page`, `record_questions`, `finish` | ordered question register |
| **Answers** | answer-sheet pages (vision) | `read_page`, `record_answer_blocks`, `finish` | answer blocks + `box_2d` + transcript + the label the student wrote |
| **Mapping** | the two registers (**text only**) | `map_answers`, `mark_unanswered`, `mark_unmatched`, `finish` | which question each block answers |
| **Grading** | each question with its answer (**text only**) | `record_grades`, `finish` | marks, verdict, feedback, summary prose |

Each context stays small and each tool surface unambiguous. The last two see **no images**, which
is what makes them cheap and lets them reason over the whole paper at once — extraction already
did the reading, so both are text-to-text problems over lists.

### 5. Mapping is its own pass, which is what makes the brief's edge cases ordinary

- **Answered out of order** — every block is in view at once, so *position on the page is never
  load-bearing*. The student's own written label (`Ans 3.`, `Q7`) decides it; content similarity
  is the fallback.
- **Unanswered** — asserted by an explicit `mark_unanswered` call, not inferred from a gap, so
  the decision is traceable. `finish` refuses to end while any question is neither mapped nor
  explicitly marked.
- **Answer matching no question** — kept and surfaced in its own UI section rather than forced
  onto a near neighbour. *A wrong mapping is worse than an admitted one, because it is invisible.*

Nothing here decides whether an answer is *right*: a completely wrong answer to Q5 is still an
answer to Q5, and conflating the two would make a misgraded answer disappear from its question.

### 6. Multi-page answers: one box per answer **per page**, and the code does the stitching

```ts
type AnswerRegion = { pageIndex: number; box2d: Box2d }
type Answer = { regions: AnswerRegion[]; /* … */ }
```

An answer that runs off page 2 and continues on page 3 is simply two regions. The **model flags**
that a block continues the previous one; **ordinary code folds** it into `regions[]`. Letting the
model assemble the final list instead would let a page-4 mistake corrupt a page-1 answer.

Two signals join a block to an existing answer, and the order matters: a label the student
actually wrote wins (it catches the student who answered Q6, moved on, and came back to Q6 four
pages later — adjacency cannot see that), with adjacency as the fallback for an ordinary page
break where the sentence just keeps going. A bare sub-point marker like `(2)` is *not* treated as
a name — students number the points inside one answer exactly as they number the next one's — and
a repeated label only stitches when the writing genuinely crossed a page boundary.

### 7. The answer sheet is read **one page at a time**, on measurement

Handed both pages at once, the model sometimes records both in a single response — and when it
does, **the second page's boxes slide down by roughly a block**: answer 23's box came back drawn
over answer 24's opening lines. Three replays of the real conversation reproduced it once; the
replays that recorded each page in its own turn were exact.

So the page the model is boxing is the page it has just been given, and the next one arrives on
the previous page's `record_answer_blocks` result. It costs nothing — two record turns and a
finish either way — and it takes an image out of the opening request, so prompt tokens went
*down*. The question paper still gets every page up front: nothing it extracts carries a box, so
there is no coordinate frame to confuse.

### 8. The pipeline is a resumable step runner, and the client polls

Serverless functions time out; a multi-page extraction will not reliably finish in one
invocation. So the pipeline is four steps that each persist their own output and move the exam's
stage forward — re-entry is idempotent, and a run that dies halfway redoes that step and nothing
else. `run` works until done or ~255s elapse, then returns `{ done: false }` and the client calls
again.

Steps sharing a **phase** run concurrently: reading the question paper and reading the answer
sheet touch nothing in common and were only sequential because a list is sequential. Running them
together is most of the 118s → 75s improvement.

Polling over SSE deliberately: streaming gives smoother progress but dies with the connection,
and the recovery path ends up being polling anyway. One mechanism, no fallback to maintain.

### 9. Rate limiting is a core component, not error handling bolted on

Gemini's free tier allows roughly **10 requests/minute** on Flash. An agent loop over a multi-page
paper will blow through that and start returning 429s mid-run. `src/lib/agent/limiter.ts` is a
serialized token-bucket queue with exponential backoff and jitter, and **every** Gemini call goes
through it. Without it the app fails on exactly the inputs it exists to handle. The pace is
`GEMINI_RPM`, defaulting to 10 — the figure a reviewer with a fresh key will have; guessing high
turns every run into a 429 storm, guessing low only costs time.

### 10. Marks are derived, never asserted

`correct`/`partial`/`incorrect` is computed from awarded-vs-total, so a verdict cannot disagree
with its own marks. Marks above the question's total are clamped and the adjustment is handed
back to the model in the tool result (a mark over the total usually means it has the wrong
question, which it can only notice if it's told). Every figure in the summary is computed from
the grades — the model supplies prose only and is forbidden to state a score in it.

---

## What the brief asked for, and where it lives

| requirement | how |
|---|---|
| Upload both files, show processing progress | `upload-screen.tsx` → per-page rasterize + upload bar, then real pipeline stage from the polled snapshot |
| Every question, in correct printed order | `questions.ts`; `order_index` preserves printed order independently of the label |
| Labelled sub-parts as separate questions | Rule 2 of the extraction prompt; `11 (a)` and `11 (b)` are two rows, grouped by `parent_number` |
| Preserve original numbering | Rule 3 — numbering is copied, never normalised, even when the paper numbers `1, 2, 2, 4` |
| Questions answered out of order | `mapping.ts` — the student's label decides, page position is never used |
| Unanswered questions | `mark_unanswered`, a first-class state; the row says "Not attempted" and the viewer stays put |
| Answers matching no question | `question_id NULL` → its own **Unplaceable** section, clickable and highlighting like any other |
| Highlight the exact region | `box_2d` stored verbatim, converted once in `geometry.ts`, drawn as a % -positioned overlay |
| Answers spanning multiple pages | `AnswerRegion[]` — one box per page, addressable individually ("region 1 of 2") |
| Grading, marks, AI feedback, summary | `grading.ts` → `gradings` rows + `exams.summary` |

---

## Structure

```
src/
  app/
    page.tsx                    → redirects to /exams
    exams/page.tsx              upload screen           (page 1)
    exams/[id]/page.tsx         review screen           (page 2)
    api/exams/route.ts          POST  create exam, mint signed upload URLs
    api/exams/[id]/route.ts     GET   full snapshot (React Query polls this)
    api/exams/[id]/run/route.ts POST  advance the pipeline; ?retry=1 to resume a failure
    api/health/route.ts         GET   env + DB reachability, without leaking values

  lib/
    agent/
      loop.ts                   the agent loop — the only file that calls Gemini
      tools.ts                  tool registry, Zod-validated args, error-back-to-model
      limiter.ts                token bucket + backoff; every call goes through it
      trace.ts                  per-turn traces → agent_traces, redacted
    extraction/
      questions.ts              agent 1 — the question register
      answers.ts                agent 2 — blocks, boxes, transcripts, page stitching
      mapping.ts                agent 3 — which question each block answers
      grading.ts                agent 4 — marks, feedback, summary
    exam/
      pipeline.ts               the step runner: phases, leases, deadlines, resume
      repository.ts             every DB read/write, one place
      geometry.ts               box_2d → rect, the single conversion point
      review-model.ts           snapshot → rows + targets + regions for the UI
      pages.ts / storage.ts     page images in and out of private Storage
      limits.ts                 MAX_PAGES_PER_DOCUMENT, MAX_BYTES
    pdf/rasterize.ts            client-side PDF → PNG (and why it must stay lossless)
    upload/                     selection validation + the upload orchestration
    supabase/                   browser client, server client, generated types

  components/
    upload/                     drop cards, the upload screen, sample loader
    exam/                       question panel, answer-sheet viewer, highlights, score pills
    shell/                      sidebar, topbar, responsive rail

public/samples/                 the ready-to-use question paper + answer sheet
supabase/migrations/            schema, applied in order
docs/                           ARCHITECTURE.md · DESIGN.md · PLAN.md (the build log)
```

### Data model

```sql
exams     id, status, stage, progress, error, summary jsonb,
          question_paper_pages jsonb, answer_sheet_pages jsonb   -- PageImage[]
questions id, exam_id, order_index, number, parent_number, text,
          max_marks, page_index, box2d jsonb
answers   id, exam_id, question_id NULL, label_written, transcript,
          regions jsonb, confidence, status                       -- mapped | unmatched
gradings  id, exam_id, question_id, marks_awarded, max_marks, verdict, feedback
agent_traces id, exam_id, agent, turn, payload jsonb
```

`question_id NULL` **is** the unmatched case — one nullable FK covers an edge case that would
otherwise need its own table. Postgres is used for **job durability**, not user data: a serverless
function cannot hold an in-flight job in memory between the client's polling requests.

---

## Running it locally

```bash
git clone https://github.com/Divyendra-S/veda-ai.git && cd veda-ai
npm install
cp .env.example .env.local     # then fill it in — see below
npm run dev                    # http://localhost:3000
```

You need two accounts, both free:

1. **Gemini** — a key from https://aistudio.google.com/apikey
2. **Supabase** — a project, then run `supabase/migrations/*.sql` in the SQL editor in order, and
   create a **private** Storage bucket named `exam-pages`

```ini
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # sb_publishable_… (replaces the legacy anon key)
SUPABASE_SECRET_KEY=                    # sb_secret_…      (server-only; bypasses RLS)

# GEMINI_MODEL=gemini-2.5-flash         # -lite is ~6× cheaper, -flash reads handwriting better
# GEMINI_RPM=10                         # free tier's limit. A billed key allows far more.
```

`GET /api/health` reports which variables are set and whether Supabase and Gemini actually
answer, without printing any value.

---

## Assumptions

- **One student, one sheet per run.** The brief says one answer sheet; batching would change the
  data model, not the pipeline.
- **The paper prints its own marks.** Where it doesn't, `max_marks` is `null` and the verdict
  falls back to the model's judgement instead of being derived from a score.
- **Printed papers, handwritten answers.** Question extraction assumes typeset text; answer
  extraction assumes handwriting. Both work either way, but the prompts are tuned for that split.
- **No auth, no multi-tenancy** — not required, and the whole surface is a single exam id.
- **The page images are the source of truth.** Once rasterized, nothing downstream ever reopens
  the PDF.

## Limitations, stated plainly

- **2 pages per document.** A spend cap, enforced in the browser *and* the route handler. Nothing
  breaks at thirty pages; it costs fifteen times as much. `src/lib/exam/limits.ts`.
- **One rectangle per answer per page** over-covers when an answer starts or ends mid-line — the
  box will include the tail of a neighbouring line. Accepted for far fewer output tokens and much
  simpler code; per-line boxes are more entries in the same array, with no schema or render change.
- **Handwriting is the accuracy ceiling.** Blocks come back with a `confidence` the UI surfaces;
  a genuinely illegible page will read as low-confidence rather than as an error.
- **A free-tier key makes runs slow**, not wrong — ~10 requests/minute means a run spends most of
  its wall clock waiting for slots.
- **The grading is a language model's opinion**, calibrated against the printed marks. It is
  positioned as a first pass for a teacher, not as a final mark.
- **Not tested against multi-column or rotated scans.** The sample sheet was scanned sideways and
  had to be straightened before upload; the app does not deskew.

## What a run costs, measured

From this project's own `agent_traces`, on the sample pair (2 + 2 pages, 14 question entries):

| | |
|---|---|
| wall clock, Start Mapping → rows on screen | **75s** |
| model calls | 9 |
| tokens | 23,348 in / 13,314 out |
| cost at `gemini-2.5-flash` list price | **$0.040** |

The shape of that bill is the useful part: output tokens cost 8× input tokens, and mapping and
grading produce ~65% of them while reading no images at all — they scale with the **number of
questions**, not the number of pages. So the page cap is a real guard against a 40-page scan and
a poor lever on cost. The lever that actually moves cost is `GEMINI_MODEL`.

---

## Further reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the long form of everything above, plus the
  full failure-mode table
- [`docs/DESIGN.md`](docs/DESIGN.md) — the Figma handoff, tokens and layout rules
- [`docs/PLAN.md`](docs/PLAN.md) — the phased build log, including what was measured and reversed
