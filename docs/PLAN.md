# Build Plan — Phased

Nine phases. Each ends at a state you can look at and judge, so we can course-correct
before the next one starts. See `ARCHITECTURE.md` for the system design and
`DESIGN.md` for the tokens and geometry measured off the Figma exports.

Status: **Phases 0–8 complete**, except Phase 0's live URL, which is Phase 9's job.
Phase 2's end-to-end check ran with Phase 4 and passed, and Phase 8.5 tuned what it
measured. **Phase 9 next.**

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
- ✅ Bricolage Grotesque self-hosted via `next/font/google` (the typeface the Figma tokens name)
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

## Phase 6 — Mapping, grading & feedback ✅

- ✅ Mapping agent, **text only** — question register + answer blocks, no images
- ✅ Matching: written label first, semantic similarity as fallback
- ✅ Explicit `mark_unanswered` and `mark_unmatched` calls, so both are traceable decisions
- ✅ Grading: marks awarded vs max, verdict, per-question feedback in the voice the design
  shows ("Excellent work! You correctly identified the chloroplast…")
- ✅ Overall summary: total, percentage, strengths, gaps
- ✅ Wired into the resumable step runner from `ARCHITECTURE.md` §5

**Done when:** all three edge cases hold on a fixture built to contain them — answers
out of order, a skipped question, and an answer matching nothing. — **met**, and by
assertion rather than by eye. The check script re-derives every claim from the API
snapshot and fails loudly, so "it looked right" is not something this phase can rest on.

| edge case | fixture | result |
| --- | --- | --- |
| answered out of order | sheet reads 1, 2, 5, 3, 6, 7, 11a, 11b, 14, 9 | all ten placed on the right question |
| skipped questions | 4, 8, 10, 12, 13 never appear | exactly those five came back unanswered |
| answer matching nothing | `Q14.` on a paper ending at 13 | unmatched, and still on screen |
| sub-parts kept apart | `Q11 (a).` / `Q11 (b).` | two questions, two marks, 2/2 and 3/3 |
| page-break answer | `Q6` spans pages 2–3 | one block in, one grade out, both regions kept |

Marks: 24 of 50, five unanswered, one unplaceable. Every mark is inside its question's
total, lands on a half, and its verdict agrees with its ratio; the four summary counts and
the percentage all recompute from the grades.

### Decisions taken during the phase

- **Two steps, not one agent.** `ARCHITECTURE.md` §4.3 described mapping and grading as a
  single pass. They are separate steps, because the step runner's whole purpose is that a
  timeout costs one step: folding them together would mean an invocation that died while
  writing feedback also threw away the matching. Splitting them also keeps each context to
  one job — mapping never sees a mark, grading never has to work out which answer is which
  — and mapping can work from truncated transcripts, which grading cannot. The two stages
  were already in the schema and in `AgentName`, so this cost no migration.
- **The tools take lists.** The free tier paces requests at roughly one every six seconds,
  which makes a turn, not a token, the unit that costs. One decision per call would have
  put mapping at twenty-odd round trips. Batching does not weaken the traceable-decision
  rule the architecture asks for — every entry is still an explicit call recorded in the
  trace — and in practice the agent now maps, marks unmatched, marks unanswered and
  finishes **in a single turn**, 4,175 tokens for the whole pass.
- **Questions are addressed by their printed number, blocks by position.** The two indexes
  diverge as soon as a question has parts: on this paper the twelfth entry is printed
  "11 (b)" and the thirteenth is printed "12". A model handed positions will use the number
  it can see, and the mistake is silent. Blocks have no such natural name, so they keep
  `a1`…`aN` — and the two shapes being obviously different is what stops one being passed
  where the other belongs.
- **Blanks never reach the model.** A question nobody answered is zero out of its printed
  total with the verdict `unanswered`. That is arithmetic. Sending it to be graded would
  spend tokens to be told what we already know and invite marks for an empty page.
- **Nothing adds up but the code.** The model writes prose and picks a mark per question;
  the total, the percentage, and the answered/unanswered/unplaceable counts are computed
  from the grades. The prompt forbids stating a score in the overall feedback, and the
  check script greps for one — a headline that disagrees with the marks underneath it
  discredits the whole screen.
- **The verdict follows the marks.** `correct` / `partial` / `incorrect` is derived from
  awarded-vs-total, so "Correct" beside 2/5 is not representable. The model is still asked
  for a verdict, for the one case the ratio cannot answer: a paper that prints no marks at
  all, where every question would otherwise read 0 out of 0 and score as correct. This is
  the third instance of the same rule in the codebase, after an answer's `status` and the
  measured box pad — where two fields can contradict, derive one.
- **Marks land on a half.** 3.7 out of 5 is not a mark a teacher would write, and a model
  reaching for one is false precision about a judgement that was never that fine.

### The finding: marks drifted, and temperature was not why

Grading the same script twice gave 25 and 24. The obvious suspect was the `temperature:
0.3` used for feedback prose, so grading was rerun at 0 — twice, against an already-mapped
exam, which is also the first thing that exercised **resuming mid-pipeline** rather than
from the start.

Zero was *worse*: 24.5 and 23. Four passes, spread 2 marks, and no correlation with
temperature. But the per-question breakdown localised it completely — six of the nine
answered questions were identical in all four passes, and the drift lived entirely in
three:

| question | 0.3 | 0.3 | 0 | 0 |
| --- | --- | --- | --- | --- |
| `"6."` | 2.5 | 2 | 2 | 1 |
| `"7."` | 5 | 5 | 5 | **4** |
| `"9."` | 5 | 4 | 4.5 | 5 |

The 4 on question 7 came with the reason attached: *"the question asked for a drawn
diagram, which was not provided."* The transcript for that answer begins "Nephron diagram
— Bowman's capsule surrounds the glomerulus…". The diagram was right there.

The cause was a gap between two agents, not a bad prompt in either. Answer extraction is
told to record a drawing as `[Diagram: …]`; grading's rule about diagrams keys on that
bracketed marker. When a transcript describes a drawing in any other words, grading is
left to guess whether one exists — and it guessed differently each time. Both sides were
fixed: extraction is told the bracketed form is the only form, and grading is told to
credit a drawing however the transcript happens to word it.

Three passes after the fix: **24, 25, 24**. Every question identical except `"6."`, which
moves between 1 and 2 out of 5. The spread halved and, more to the point, moved from three
questions to one — and the remaining one is a genuine judgement call rather than an error.

### What the marking looks like now

Question 6 asked for a labelled diagram of the digestive system and got prose. It scores
1–2 out of 5, with the reason stated: *"you correctly identified the small intestine as
the site of most absorption, but the question required a labelled diagram … which was not
provided."* Questions 5 and 7 also asked for diagrams and now score 2/2 and 5/5 in every
pass, because the student drew those. Marking the three differently is the correct read of
what is on the page, and it is the kind of consistency that stays invisible without a
fixture built to test it.

### Limitations worth stating

- **One question's mark is not reproducible.** Question 6 varies by a mark between runs.
  Grading a borderline answer is a judgement, and this one is genuinely borderline; what
  can be promised is that the six clear-cut questions do not move and that the reasoning is
  shown next to every mark.
- **The `[Diagram: …]` path is not exercised end to end.** The answer-sheet fixture is
  rendered from HTML, so it cannot contain an actual drawing — "Nephron diagram —" is
  handwritten *words*. The tightened extraction rule is therefore untested against a real
  drawing; only the grading half of the fix is covered by these runs.
- **A header that disagrees with the paper is ignored.** The fixture prints "Maximum Marks:
  48" while its own questions add up to 50. The summary says 50, because it totals the
  marks printed against each question rather than trusting a header it cannot attribute to
  anything. That is the right behaviour — a total has to be the sum of the parts a teacher
  can see — but the discrepancy passes without comment.

---

## Phase 7 — Review UI & highlighting ✅

The screen the assignment is actually judged on.

- ✅ Left panel: `Extracted Questions (from question paper)` + `Expand All`
- ✅ Each row: `#555555` round number badge, part letter column, question text, score
  pill, chevron
- ✅ Score-pill colour derived from the ratio, not stored: green from 80%, amber below,
  red at zero, grey for a question nobody attempted
- ✅ Expanding a row reveals the student's transcript and an **AI Feedback** well
- ✅ The selected row takes a 2px `#ff8d36` border and its badge turns brand orange
- ✅ Right panel: dark `#303030` viewer — `Answer Sheet`, `− 100% +` zoom,
  `‹ Page n of N ›`, continuous scroll
- ✅ Highlight per region: `#3dd218` border over a wash of the same green, `#34ac15` tab
  above the top-left corner
- ✅ Click a question → its regions are drawn, the first is scrolled to and ringed
- ✅ Multi-page answers → one overlay per region, tabs numbered `1/2`, page chips in the
  expanded row
- ✅ Unanswered questions → an explicit empty state on both sides, and the viewer stays put
- ✅ Unmatched answers → their own section, clickable, highlighting the same way
- ✅ Grading summary in the header

**Done when:** clicking through every question highlights the right region, including the
multi-page and unanswered cases. — **met, in a browser.** Headless Chrome is driven over
the DevTools protocol (with the `ws` already in the tree, so nothing new is installed),
every row is clicked, and the DOM is read back and checked against the API snapshot.

| checked, per click | how |
| --- | --- |
| the right boxes appear | drawn `data-region` ids equal the mapped answer's regions, as a set |
| each box is on the right page | the box's `data-page` ancestor equals the region's `pageIndex` |
| each box is in the right place | `left/top/width/height` equal `box2dToRect` of the stored box to 0.01% |
| the region is actually reached | after the smooth scroll, the box's rect intersects the scroller's |
| exactly one row is selected | `[aria-pressed="true"]` has one entry, and it is the row clicked |
| unanswered stays empty | zero boxes drawn, and the viewer says so |

All fourteen questions, the two-region answer spanning pages 2–3, the unplaceable `Q14`
block, both zoom directions, the page readout and Expand All in both directions:
**every check passes.**

### Decisions taken during the phase

- **Selection and expansion are two things.** The export shows row 2 with the orange
  border *and* an open feedback block, while row 6 is open without being selected. So the
  row body selects and highlights, the chevron alone expands, and they are separate
  buttons rather than one button reading a modifier — which also keeps the markup valid,
  since a button cannot sit inside a button. Selecting does expand, so one click still
  shows the mark, the transcript and the highlight together.
- **The pill's colour is not the stored verdict.** Grading calls 4/5 `partial` because a
  mark was lost; the design shows 4/5 green, and 80% is the threshold measured off the
  export. Two scales answering different questions, deliberately not merged — and the pill
  carries the number and the colour and nothing else, so there is no verdict word beside
  it to fall out of step with the marks.
- **A question nobody attempted gets a grey pill, not a red one.** Red at zero is the
  design's rule for an answer that earned nothing. A blank page earned nothing either, but
  saying so in the same colour reads as five marks thrown away rather than five marks never
  attempted. The accessible name spells out the difference: *"Not attempted, worth 2 marks."*
- **One derivation, one place.** `buildReview` turns the snapshot into rows, targets and
  regions; the panels hold no lookup logic at all. A question and an unplaceable block are
  different rows on screen but the same `Target` to the viewer — a tag and a set of regions
  — so highlighting has no second code path to get wrong.
- **Selection is held as a key, not as the selected object.** The object is looked up again
  from the current model on every render, so a poll that replaces the snapshot cannot leave
  the viewer drawing boxes from a payload the list has already moved on from.
- **The number badge drops the printed full stop.** The register stores `"6."` and
  `"11 (a)"` verbatim, because preserving the paper's own numbering is a requirement, and
  that verbatim string stays the row's accessible name. The trailing stop is typography
  rather than number, so it comes off in the two places the number is set inside a circle
  or a tab and the punctuation would read as a smudge.
- **Only the selected answer is drawn.** The export highlights one region at a time and is
  right to: a sheet under a dozen boxes at once tells a teacher nothing about which one
  they just clicked.
- **Pages are lazy.** Only page 1 is fetched up front; the rest load as the viewer scrolls
  to them. Scrolling to a box on page 3 still works before that page's bitmap arrives,
  because the `width`/`height` on the image reserve its aspect ratio and the layout is
  therefore correct while the pixels are still in flight.

### The finding: zoom was a no-op, and the readout said 150%

The first implementation scaled the pages with the CSS `zoom` property, which reads like
exactly the right tool. The readout changed, the tab above the highlight got bigger, and
the handwriting did not move — visible only because the check took a screenshot.

`zoom` resolves percentage widths against the containing block *in the zoomed coordinate
space*, so a `w-full` column cancels the zoom exactly and only fixed lengths — the text in
the tab — actually grow. Setting an explicit `width: ${zoom * 100}%` instead fixed nothing
at first, for a second reason: a flex item shrinks by default, which quietly clamped the
150% column back to the width of its container. `shrink-0` is what makes the width mean
what it says.

Both were invisible to every assertion that looked at the boxes, because the boxes are
percentages of the page and stayed correct throughout. The check now measures the rendered
width of page 1 before and after: **590px → 885px**, and a wrong mechanism fails loudly.

### Corrections to the measured design tokens

Four values in `DESIGN.md` came from the earlier exports and are wrong for this screen.
Re-measured against `Question - Answer mapping screen.png` and corrected in `globals.css`:

| token | was | measured |
| --- | --- | --- |
| `panel` (behind the question cards) | `#e8e8e8` | `#f3f3f3` |
| feedback well, chevron button | `subtle` `#f0f0f0` | new `inset` `#f6f6f6` |
| number badge | `ink` `#2b2b2b` | new `badge` `#555555` |
| pill backgrounds | `#f2faf1` / `#fff8ee` / `#fff0ec` | `#ecf8ea` / `#fff5e6` / `#ffe9e2` |

### Limitations worth stating

- **A highlight is only as good as the box behind it.** `Q14`'s answer runs to two lines
  and its stored box covers the first, so the overlay lands short. The UI draws exactly
  what extraction recorded — the check asserts that to within 0.01% — which makes this an
  extraction accuracy limit, of the same family as the top-edge miss noted in Phase 5, and
  not something to paper over in the viewer.
- **Clicking a region does not select its question.** The reverse mapping would be a nice
  affordance, and only the selected answer is drawn, so there is nothing on the sheet to
  click yet.
- **One viewport.** Every check ran at 1600x1000. Narrow widths are Phase 8's job.

---

## Phase 8 — Edge cases, resilience & polish ✅

Everything that is not the happy path.

- ✅ `Extracting… / This may take a while` wired to real stage reporting, with a
  determinate bar reading the exam row's own `progress`
- ✅ Error states: upload failure, extraction failure, **partial results**, rate-limit stall
- ✅ Retry a failed stage without re-uploading — `POST /run?retry=1`
- ✅ Empty and zero states: nothing selected, nothing matched, a page that never uploaded
- ✅ Keyboard nav through the register (↑ ↓ Home End), and the highlight jump announced
- ✅ Responsive down to laptop; below 64rem the viewer becomes a tab beside the questions
- ✅ Mobile-safe at 390px rather than a broken two-pane layout

**Done when:** the failure and edge states behave, in a browser. — **met.** The Phase 7
harness is extended with three things it did not have: viewport emulation, key events, and
a CDP `Fetch` interceptor that rewrites the snapshot on its way to the browser. That last
one is what makes the bad-day states reachable at all — a run that died at grading, a
sheet nothing was read from, a page image that never uploaded — without corrupting real
data or spending a single model call.

Forty-seven checks, all passing:

| checked | how |
| --- | --- |
| the viewer's zero state | before any click: no boxes, and the panel says what to do |
| arrow keys walk the register | ↓↓ from row 1 lands on row 3; End reaches the unplaceable block; Home returns; Enter selects |
| the jump is announced | the live region reads `Q6 highlighted on page 2, region 1 of 2.` |
| an unanswered question is announced as such | `Q4 was not attempted. There is nothing on the answer sheet to highlight.` |
| one pane at 900px | a tab switch appears, the sidebar is 64px, selecting a question switches to the sheet and scrolls the box into view |
| nothing scrolls sideways | `scrollWidth - clientWidth <= 0` at 900px and at 390px, on both screens |
| the drop cards survive a phone | stacked, 184px tall, contents inside their own bounds, CTA reachable |
| the progress bar tells the truth | `aria-valuenow` 55 and a fill drawn at 55% of the track |
| a long wait explains itself | after 45s the rate-limit note appears; before it, nothing |
| a run that died at grading | the register still renders, the banner names the step and what survived, the pills read `—` not `0` |
| a sheet nothing was read from | the panel says so, clicking a row draws nothing, the viewer says why |
| a page that never uploaded | that page says so in its own slot, the page count is unchanged, the rest still highlights |
| retry actually resumes | `updated_at` unchanged after a plain call, moved after `?retry=1`, stage back at `questions` — read from Postgres, not from the API |
| and the button does the same | clicking **Try again** moves `updated_at` too |

### The finding: retry did not retry

`advanceExam` opened with a guard that returned `{ done: true, status: "error" }` for any
exam already in error — correct for the polling loop, which must not resurrect a hopeless
run on its own and burn quota doing it. But the **Try again** button went through the same
endpoint. It posted, the server said "still failed", the mutation resolved, and the screen
did not move. The button had never worked, and nothing in the code looked wrong.

The fix separates the two callers rather than relaxing the guard: `?retry=1` is the one way
a failed exam starts moving again, the flag rides only on the *first* call of an attempt,
and the lease check is deliberately skipped for it — an errored exam has no live invocation
to collide with, so a lease left behind by the run that failed must not be able to refuse
the retry that follows it.

Proving it needed a genuinely broken exam, so the check makes one: an exam row whose page
images were never uploaded. The question step dies on the first page download, before any
model call, so it costs nothing. `updated_at` is then the witness — the API does not expose
it, so the check reads the row straight from Postgres.

### The second finding: `flex-1` on the wrong axis

The two drop cards stack on a phone, which took `flex-col sm:flex-row` on the well. The
stacking check passed. The screenshot showed both cards collapsed to a sliver with their
upload icons and `Max 10MB` labels spilling over the page beneath them.

`flex-1` is `flex: 1 1 0%`, and in a column it resolves against the **height**: `basis: 0`
beat the card's own `h-[184px]`, and the card's contents are `absolute inset-0`, so there
was no content left to hold it open either. The card is now `min-h-[184px] w-full` with the
grow deferred to `sm:flex-1`, where it is the width that grows — which is what was wanted
in the first place.

The check now measures the card's height and asserts its label's rect sits inside the
card's. The same lesson as Phase 7's zoom: a layout assertion that only looks at position
passes happily through a collapse.

### Decisions taken during the phase

- **A failed run does not mean an empty screen.** Each step persists before the next
  starts, so a run that died at grading still has a full register, real answers and working
  highlights. Throwing that away for one error message would be both a worse screen and a
  dishonest one: what failed goes in a banner over what survived, and the banner names
  which. Only a failure with nothing behind it gets the whole panel.
- **A page that cannot be signed keeps its slot.** `signPages` used to throw, which turned
  one missing object into a 500 on the way in and an exam nobody could open. It now returns
  `url: null` for that page and the viewer draws a placeholder at the page's own
  proportions — so numbering, paging and every other page's highlights survive one failed
  upload, and the missing page says what happened to it.
- **A snapshot that will not load says so.** The previous code fell through to `Opening…`
  whenever `exam` was undefined, which meant a 404 or a 500 rendered as a spinner that
  never resolved. That path now offers a re-read rather than a retry, because there is no
  run to resume.
- **Transient faults are absorbed, definite ones are not.** The client tolerates three
  consecutive transient failures with a widening backoff — a cold function, a dropped
  connection, a 502 in front of the region all come right on the next call. A 404 stops
  immediately. A fetch that never reached the server has no status at all, and that counts
  as transient, which is exactly the case worth retrying.
- **Arrow keys are an accelerator, not a listbox.** Every row stays in the tab order rather
  than becoming a roving-tabindex listbox, because each row carries a second button beside
  it and a listbox option cannot contain one. Tab still reaches everything; ↑ ↓ Home End
  are added on top.
- **The highlight is announced, because it is not visible to everyone.** The box appears in
  a panel a screen-reader user is not looking at and has no announcement of its own, so
  selection writes a line into a live region: which tag, which page, which region of how
  many — or that the question was never attempted.
- **The rail below 64rem is not a preference.** The variant matches on the viewport there
  instead of on the stored attribute, so the attribute keeps meaning exactly what the
  teacher chose and the width decides for as long as it is narrow. The expand toggle is
  scoped `lg:rail:` so it is not offered where it would do nothing — stacked variants
  rather than a `max-lg:hidden` racing a same-specificity rule for source order.
- **Both panes stay mounted on one screen.** The hidden one is `display: none`, so the
  viewer keeps its scroll position and zoom across a switch, and the box a highlight
  scrolls to already exists in the DOM by the time the pane becomes visible.

### Limitations worth stating

- **The bad-day states were verified against a rewritten payload, not a real bad day.** The
  components, the derivation and the layout are the real ones and the payload shapes are
  ones the pipeline can genuinely produce — but a real 429 storm at grading was not induced.
- **The retry check proves resumption, not recovery.** Its throwaway exam fails again on
  every attempt, by design. What is asserted is that the pipeline re-enters at the failed
  step; that a retry can *succeed* is shown by Phase 6's mid-pipeline rewind, not here.
- **Three viewports.** 1600x1000, 900x900 and 390x844. Everything between them is
  interpolation, and the only hard breakpoints are 40rem and 64rem.
- **`confidence` is stored but not shown.** §8 of `ARCHITECTURE.md` lists low-confidence
  handwriting as flagged in the UI; it is recorded on every answer block and nothing on
  screen reads it yet.

---

## Phase 8.5 — Speed, and the highlight it nearly cost ✅

Not in the original nine. It came out of watching a real run: 118 seconds is long enough
that a teacher assumes the app has hung.

- **Run time 118s → 75s** on the sample pair, measured end to end in Chrome. Three
  changes: the two extractions now run concurrently (they never shared data), pages no
  longer cost a `read_page` round trip each, and `GEMINI_RPM` replaced a hardcoded
  free-tier pace of 10. The bill did not move — $0.041 → $0.040. See "How long a run
  takes" in `ARCHITECTURE.md`.
- **A sample pair to test with**, in `public/samples/`: the real CBSE 2024 Class X Science paper
  and a real topper's handwritten booklet for it, two PDFs, upload as-is. Expected
  result 8/14, 57%.
- **The upload screen now says why two pages.** It is a spend cap, not a technical one,
  and a teacher would never guess it.
- **Regression found and fixed in the same phase.** Attaching every answer-sheet page to
  the opening request let the model record two pages in one response, and when it did,
  the second page's boxes slid down by a block — answer 23 highlighted over answer 24.
  Fixed by handing the answer agent one page at a time, each arriving on the previous
  page's record result. Same turn count, fewer prompt tokens.
- **Sub-point labels no longer stitch answers together.** A student numbering the points
  of answer 23 (1), (2) writes the same markers as in answer 24, and the page-break
  stitch in `collect` was merging on them — putting answer 24's second paragraph inside
  answer 23's highlight. Stitching now needs a real question label *and* a page boundary.

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
