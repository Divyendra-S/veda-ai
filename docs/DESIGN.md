# Design reference

Everything here was measured off the four exports in `/images` with ImageMagick, not
estimated by eye. The tokens live in `src/app/globals.css` under `@theme`.

| Export | Screen |
| --- | --- |
| `Upload Screen - Empty State.png` | Page 1, nothing uploaded, sidebar expanded |
| `Upload Screen - filled state.png` | Page 1, both files chosen, CTA enabled |
| `Loading state.png` | `Extracting…`, sidebar collapsed to the rail |
| `Question - Answer mapping screen.png` | Page 2, question list + answer viewer |

Exports are 2x. All numbers below are **design pixels** at the 1440px frame.

---

## Typeface

General Sans (Fontshare, ITF Free Font License). Identified from the letterforms:
double-story `a`, single-story `g`, angled cut on the `t` terminal, and a `Q` whose
tail swings out to the lower left — none of which match the obvious Google-font
candidates. Self-hosted through `next/font/local` as a single 38KB variable file
covering 200–700.

---

## Colour

Sampled values, with the job each one does.

**Brand** — three oranges that are not interchangeable:

| Token | Value | Used for |
| --- | --- | --- |
| `brand` | `#ff5724` | Headline accent, `Question Paper` / `Answer Sheet` labels |
| `brand-ring` | `#e36d49` | Outline on the AI Teacher's Toolkit pill |
| `brand-soft` | `#ff8d36` | 2px border on the selected question card |
| `brand-wash` | `#f4e4da` | Marker highlight behind the headline |

**Ink and surfaces:**

| Token | Value | Used for |
| --- | --- | --- |
| `ink` | `#2b2b2b` | Headings, the toolkit pill background |
| `ink-soft` | `#3b3b3b` | Body copy |
| `muted` | `#7e7e7e` | Nav labels, secondary copy |
| `faint` | `#a6a6a6` | `Max 10MB`, disabled label |
| `surface` | `#ffffff` | Sidebar, cards |
| `raised` | `#fcfcfc` | Topbar |
| `subtle` | `#f0f0f0` | Active nav row, school card |
| `well` | `#f5f4f4` | The container the two drop zones sit in |
| `panel` | `#f3f3f3` | Question-list panel behind the cards |
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
| Hero ring | ~130 diameter |
| Review panels | roughly 50/50 of the space beside the rail |

Radii: `28` on the sidebar and outer shells, `24` on panels and the upload well, `16`
on cards, `12` on nav rows.

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

---

## Deliberate deviations

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
