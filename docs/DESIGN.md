# Design reference

Everything here was measured off the exports in `/images`, not estimated by eye —
with ImageMagick for the four desktop frames, and by scanning pixel rows through a
canvas for the phone frame that arrived later. The tokens live in
`src/app/globals.css` under `@theme`.

Some of it now comes from the Figma file itself. Read access arrived late and is
rationed — twenty calls a month — so the nodes were spent on the things pixels are
worst at: the typeface, and the two controls whose every value turned out to be a
guess (the toolkit pill, the phone pane switch). Six calls used, and where a node and
an export disagree the reason is written down beside the value.

| Export | Screen |
| --- | --- |
| `Upload Screen - Empty State.png` | Page 1, nothing uploaded, sidebar expanded |
| `Upload Screen - filled state.png` | Page 1, both files chosen, CTA enabled |
| `Loading state.png` | `Extracting…`, sidebar collapsed to the rail |
| `Question - Answer mapping screen.png` | Page 2, question list + answer viewer |
| `Question - Answer mapping screen - Question toggle (phone).png` | Page 2 at 393px, one question open |

The desktop exports are 2x; the phone export is 1x at 393px. All numbers below are
**design pixels** at the 1440px frame unless a phone frame is named.

---

## Typeface

**Bricolage Grotesque**, self-hosted through `next/font/google` (which downloads at
build time and serves from our own origin — no runtime request to Google).

This was identified from the file rather than from the pixels. An earlier pass read
the letterforms off the exports and concluded General Sans; the Figma file's own
typography tokens say otherwise, naming `Bricolage Grotesque` in every Paragraph
style. Reading the tokens settled in one call what staring at antialiased type had
got wrong.

The design pins the variable axes at `opsz 14, wdth 100`, which are the font's own
defaults, so the weight-only subset renders exactly what Figma draws without paying
for the extra axes.

**Tracking is part of the typeface here, not a per-element flourish.** Every
Paragraph token carries -4%, so it sits on `body` as `letter-spacing: -0.04em` and
headings tighten from there — the wordmark is -6% at 28px, matching the node.

---

## Colour

Sampled values, with the job each one does.

**Brand** — three oranges that are not interchangeable:

| Token | Value | Used for |
| --- | --- | --- |
| `brand` | `#ff5724` | Headline accent, `Question Paper` / `Answer Sheet` labels |
| `brand-ring` | `#e36d49` | 4px outline on the AI Teacher's Toolkit pill |
| `brand-soft` | `#ff8d36` | 2px border on the selected question card |
| `brand-wash` | `#f4e4da` | Marker highlight behind the headline |

**Ink and surfaces:**

| Token | Value | Used for |
| --- | --- | --- |
| `ink` | `#303030` | Headings, the selected pane tab, the answer-sheet viewer |
| `ink-soft` | `#3b3b3b` | Body copy |
| `muted` | `#7e7e7e` | Nav labels, secondary copy |
| `faint` | `#a6a6a6` | `Max 10MB`, disabled label |
| `surface` | `#ffffff` | Sidebar, cards |
| `raised` | `#fcfcfc` | Topbar |
| `subtle` | `#f0f0f0` | Active nav row, school card |
| `well` | `#f5f4f4` | The container the two drop zones sit in |
| `panel` | `#f3f3f3` | Question-list panel behind the cards |
| `toolkit` | `#272727` | The AI Teacher's Toolkit pill, a shade below `ink` |
| `inset` | `#f6f6f6` | Feedback well, chevron button, page chips |
| `badge` | `#555555` | The round question-number badge |
| `line` | `#cecece` | Dashed drop-zone border, disabled CTA fill |
| `viewer` | `#303030` | Answer-sheet viewer |
| `viewer-raised` | `#454545` | Zoom and page controls inside the viewer |
| `highlight` | `#3dd218` | Border of the region drawn on the answer sheet |
| `highlight-tab` | `#34ac15` | The `Q2` tab above that border |

Four of these were re-measured during Phase 7 against the review-screen export and
disagree with what the earlier screens suggested: `panel` was recorded as `#e8e8e8`,
the feedback well was assumed to be `subtle`, the number badge was assumed to be `ink`,
and the pill backgrounds were a shade too light. The values above are the corrected
ones; `docs/PLAN.md` Phase 7 keeps the before-and-after.

`panel` is also the one value where the two frames genuinely disagree rather than one
of them being misread. Clean spots inside the desktop panel — away from cards, whose
shadows reach a good 30px — sample `#f3f3f3`, `#f5f5f5`, `#f1f1f1`. The phone frame
settles at `#e7e7e7` everywhere, including mid-panel between the header and the first
card where nothing is casting on it. The desktop reading stays, because it is the
frame the token was measured from and the frame it is mostly seen in; the phone is a
shade darker than the design there and knowingly so.

**Score-pill scale** — pill background / text, sampled off the pills themselves:

| Pill | Background | Text |
| --- | --- | --- |
| Full marks | `#ecf8ea` | `#34ac15` |
| Partial | `#fff5e6` | `#e3600f` |
| Zero | `#ffe9e2` | `#c0350a` |
| Not attempted | `inset` `#f6f6f6` | `muted` `#7e7e7e` |

Observed thresholds: `4/5` and `5/5` render green, `3/5` and `1/3` amber, `0/2` red.
So green at 80% or above, red at zero, amber in between — which is the design's scale
and not grading's, where 4/5 is a `partial` verdict. The fourth row is ours: the export
has no example of a question nobody attempted, and painting a blank page red reads as
marks thrown away rather than marks never attempted.

The pill spaces its slash — `2 / 2`, not `2/2` — in both frames.

**Page background** is a fixed vertical gradient, not flat:

```css
linear-gradient(180deg, #f5f5f5 0%, #f1f0f0 32%, #e4e2e2 70%, #c8c5c5 100%)
```

**Answer highlight.** The border is `#3dd218`, 2px. The fill is the same green at
roughly 10% — solved by comparing paper a few rows above the border with paper a few
rows below it, which is the only pair close enough for the ruled lines underneath not
to dominate the difference. The `Q2` tab above the top-left corner is solid `#34ac15`.

---

## Geometry

Measured by scanning pixel rows and columns for panel edges.

| Element | Value |
| --- | --- |
| Page inset (all four sides) | 12 |
| Sidebar, expanded | 304 wide |
| Sidebar, collapsed rail | 68 wide |
| Gap between sidebar and main | 16 |
| Topbar height | 56 |
| Upload well | 785 wide, 200 tall, centred |
| Drop card | 374 wide, 168 tall, 16 gap between the two |
| Headline highlight pill | 58 tall |
| Hero ring | 109 of visible peach, inside a 139 box |
| Review panels | roughly 50/50 of the space beside the rail |

Radii: `16` on the sidebar, topbar and outer shells, `24` on panels and the upload
well, `16` on cards, `8` on nav rows.

The shell radius is a correction. It was `28` on the strength of an eyeballed guess;
the Side Bar node states `rounded-[16px]`, and fitting a circle to the export's own
corner — solving `r` from how far in the first white pixel sits on each of the first
few rows — returns 15–16 on both the sidebar and the topbar. Both are now `16`.

**The AI Teacher's Toolkit pill**, from the same node, since it is the sidebar's most
prominent control and every value in it was slightly off:

| Property | Was | Design |
| --- | --- | --- |
| Stroke width | 2 | **4** |
| Stroke colour | `#e36d49` | `#ff7950` at ~88% over the fill — *renders* `#e36d49` |
| Height | 48 | **42** |
| Fill | `ink` | `#272727` |
| Label | 15 | **16**, and a `’` rather than `'` |

The stroke colour is the one place where the file and the export disagree and the
export wins: `#ff7950` is the unblended value, and 0.88 of it over `#272727` is
`#e36d49` to the digit — which is what a pixel scan of the pill returns. So the
colour had been right all along and the **width** was the actual bug.

Its inner glow is fitted rather than copied. Figma states a 34.5px blur; a sweep of
blur × alpha against the export scored 24px at 0.22 as the closest match, because a
Figma Gaussian and a CSS one are not the same curve. From a pixel or so inside the
stroke inward it now tracks the export to within a level or two of grey.

The sparkle is the design's exported path, not Lucide's `Sparkles`: the design puts a
small companion star above and right of the main one, Lucide puts a dot below and
left, and at 18px on that pill the difference reads.

---

## Behaviour the stills imply

- The upload CTA is grey `#cfcece` with `#9d9b9b` text until both files are present,
  then ink with white text. The two states are the empty and filled exports.
- Each file chip carries a dark circular `×` overlapping its top-right corner, so a
  teacher can replace one side without clearing the other.
- The collapsed rail keeps the sparkle button, the five nav icons, the school crest,
  and gains a `»` expand affordance at the bottom.
- In the review screen more than one question can be expanded at once — rows 2 and 6
  both show a chevron-up — so expansion is a set, not a single selection. Selection
  (the orange border) is separate from expansion.
- The viewer scrolls continuously through pages; `Page 1 of 4` is a position readout,
  not a pager. Page 2 is visible immediately below page 1 in the export.
- `Extracted Questions (from question paper)` is one weight and one colour in both
  frames. It had been set with the parenthetical dropped to a muted regular, which is
  a reasonable-looking guess and simply is not what either export draws.

---

## Deliberate deviations

- **The drop card reads `Max 2 pages · 10MB`.** The export prints `Max 10MB` only. The
  page cap is a spend control — every page is an image the model is billed to read — and
  it is the limit a teacher hits first and cannot infer, so it is named before the upload
  rather than in a rejection after it.
- **Sidebar nav items other than Exams do nothing.** The brief allows this. They are
  styled as present but inert rather than removed, because the design shows them.
- **The user identity in the topbar is fixed** (`Madhur Rastogi`, Delhi Public School).
  There is no authentication in this app, so it is presentation only.
- **Layout flexes rather than pinning to 1440.** The exports are a fixed frame; a
  reviewer opens a live URL at an arbitrary width.
- **The expanded row shows the transcript as well as the feedback.** The export's one
  open row is a two-mark multiple choice, where what the student wrote is not worth
  repeating. On a five-mark answer it is the thing a teacher wants beside the mark, and
  the brief asks for the extracted answers to be displayed, so `What the student wrote`
  sits above `AI Feedback` in the same well.
- **The whole-paper feedback opens closed.** It is several paragraphs and the questions
  are what the screen is for, so it collapses to a single truncated line under the score
  strip. The numbers a teacher scans for are in the strip itself.
- **A question nobody attempted still gets a row**, with a grey pill and, when expanded,
  a sentence saying nothing on the sheet was matched to it. The viewer says the same and
  stays where it is. The export has no such case; a silently missing question is the
  failure a teacher would never catch.
- **Blocks that match no question get a section of their own** below the register, and
  highlight exactly as a question does. Also absent from the export, and the case most
  likely to be wrong — so it is the one thing that must not be quietly dropped.
- **The upload screen says its limits in one line.** An earlier draft explained the
  page cap and the tier-1 pacing in two paragraphs under the drop cards. Together they
  were 125px tall, and the frame is 1440x787: they pushed `Start Mapping` off the
  bottom of the design's own screen and off any 768px laptop. Both facts still get
  said — the cap on the cards themselves, the pacing on the processing screen after 45
  seconds, which is the moment it starts to matter. A primary action you have to
  scroll to find is the worse trade.
- **The sidebar is at its rail from `Start Mapping` onward.** Both frames for the
  second half of the app — extracting, and the mapping screen — draw the rail, and the
  upload frame draws it expanded. So it is the screen that asks rather than the teacher
  who chose: `setSidebar(true, { persist: false })` on submit and on the review screen's
  mount moves the attribute without writing storage, the toggle still overrides it, and
  the upload screen opens expanded next time.
- **A collapsed question row clamps to three lines.** Every row in both exports is one
  to three lines, because the paper they were drawn from asks short questions. A real
  CBSE paper does not: an assertion-and-reason item prints all four options and turns a
  card into a ten-line wall. The chevron — which already opens the answer and the
  feedback — opens the rest of the question with them.
- **The processing screen gains a determinate bar.** The export shows the sparkle, the
  title and `This may take a while` and nothing else. The brief asks for processing
  progress and the exam row already carries a real `progress` figure, so the bar reads it
  rather than animating. After 45 seconds a line appears explaining that the free tier
  paces model calls — the wait is real, and an unexplained one reads as a hang.
- **A failed run keeps its screen.** What survived renders under a banner naming the step
  that failed. The exports have no error state at all; the alternative — one message where
  a complete register used to be — throws away work the pipeline had already persisted.

---

## Narrow screens

The desktop exports are one 1440px frame and there is one phone frame at 393px. Two
breakpoints carry everything between and below them.

| Width | What changes |
| --- | --- |
| `< 64rem` (1024) | The two review panes become one, with a tab switch above them. The sidebar is forced to its rail and stops offering a toggle. |
| `< 40rem` (640) | The sidebar goes entirely; the brand moves into the topbar and a hamburger opens it as a drawer. The question row rearranges. The two drop cards stack. Headline drops 38 → 26px, the hero 139 → 101px. The topbar loses the teacher's name, the breadcrumb, Help and the assistant button; the question panel loses `Expand All`, centres its heading and halves its side padding. |

### The pane switch

Node `3:1477` on the phone frame, and the first phone control read from the file
rather than inferred. Every number in it had been guessed low:

| Property | Was | Design |
| --- | --- | --- |
| Track | white, `shadow-card`, 4px pad, 4px gap | `#f6f6f6` (`inset`), 4px pad, **no gap** — see below |
| Track height | 45 | **54** |
| Tab | 37 tall, 14px label | **46** tall, **16px** at 1.4 |
| Selected tab | `ink`, no stroke | `ink` with a **1px `#7b7b7b`** stroke and two shadows |
| Unselected label | `muted` | **`ink`** |
| Contents | icon + label + count chip | **label only** |

Three of those are decisions rather than transcription. The icons went because the
design has none and two glyphs on a 393px screen cost the labels the room they need;
the count chip went with them, since selecting a question already brings this pane
forward, and a chip that only ever says what just happened is noise on the one
control the whole phone layout leans on.

And the track stayed **white** rather than taking the node's `#f6f6f6`. The export
sets that track against a background reading `#cecece`, because it is a 2227px scroll
capture and the page gradient is compressed into it. On a real 852px phone the same
gradient is only about a tenth of the way down by the time it reaches here — roughly
`#f4f4f4` — so `#f6f6f6` left the control with no edge at all, which is the opposite
of what the frame shows. White reproduces the separation the design is drawing; the
literal hex would not.

The stroke rides as `inset 0 0 0 1px` rather than a `border`, because a border is
inside the box and would push the tab past the 46px the frame measures — Figma's
strokes do not take part in its auto-layout. And the track carries `z-10`: the
selected tab's `0 32px 48px` shadow really does fall about 40px onto the question
panel below, which a later sibling with a background of its own would paint over.
Both profiles were checked against the export afterwards — across the 34px of track
to the right of the selected tab, the rendered falloff differs from the design's by a
mean of **0.6 levels of grey**.

### The phone topbar

Node `3:1462`, same frame. 56px tall and `pl-12 pr-16`, with a bare `arrow_back` at
24px — no disc. The white disc the desktop bar puts around it is right up there,
where it is how the design chromes Help and the assistant, so it stays behind `sm:`.
The mark is 28px, the wordmark 20px at -6%, the avatar 32, and every icon 24 — all
of them a size up from the desktop bar, which is what a thumb wants anyway.

Seven decisions inside that:

- **The rail below 64rem is not the teacher's stored preference.** The `rail:` variant
  matches on the viewport there instead of on `data-sidebar`, so the attribute keeps
  meaning exactly what they chose and the width decides for as long as it is narrow.
- **Selecting a question on one pane takes you to the sheet**, because otherwise the
  highlight is drawn on a panel nobody can see. The switch goes back and the viewer has
  kept its place: the hidden pane is only `display: none`.
- **The phone frame arrived after the desktop ones and overruled two guesses.** It
  keeps `(from question paper)`, which had been dropped as the first thing a narrow
  header could lose — on a phone it is the sentence that says this list is the paper's
  questions and not the student's headings, which is exactly the context a small screen
  gives you least of. And it drops `Expand All`, which had been kept: the full title
  takes the width on its own there, and a button beside it wraps the heading onto two
  lines.
- **The phone question row rearranges rather than shrinks.** Number and mark share a
  line with the chevron; the question runs the full width underneath. Squeezed into one
  row instead, the text gets about 120px, which is three words a line. One set of
  children says both layouts — `flex-wrap` with `order-last basis-full` on the text,
  `ml-auto` on the pill, `items-start` on the row so the chevron stays level with the
  number — and `sm:flex-nowrap` collapses it back to the row the desktop frame draws.
- **There is no rail on a phone.** 68px is a sixth of a 390px screen and every item in
  it but Exams is inert, so the design spends it on the panes instead. The drawer the
  hamburger opens is the same set of items, with the same ones disabled, because the
  point of it is to be the sidebar rather than a second, smaller idea of one.
- **The drawer is the sidebar's metrics, not a size down from them.** Width, padding,
  section rhythm, row height, type and school card are all the sidebar's, and it
  scrolls — at 320x568 that content is about 90px taller than the drawer, and clipping
  is the one way this fails silently, with Settings and the school card simply absent.
- **The drop cards are `min-h` with the grow deferred to `sm:`.** `flex-1` in a column
  resolves against the height, where `basis: 0` beats a fixed `h-[184px]` and collapses
  both cards to nothing — see `PLAN.md` Phase 8.
