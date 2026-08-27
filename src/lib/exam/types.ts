/** A page as it exists in Storage. `path`, not a URL: the bucket is private and
 *  URLs are signed at read time, so nothing persisted here can go stale. */
export type PageImage = {
  index: number;
  path: string;
  width: number;
  height: number;
};

export type DocumentMeta = {
  name: string;
  sizeBytes: number;
  pages: PageImage[];
};

/**
 * Gemini's spatial format: [ymin, xmin, ymax, xmax], normalised to 0..1000,
 * **y first**. Transposing this is the single easiest way to put every
 * highlight in the wrong place, which is why it has its own named type and one
 * conversion function rather than being inlined at each call site.
 */
export type Box2d = [number, number, number, number];

export type AnswerRegion = {
  pageIndex: number;
  box2d: Box2d;
};

export type ExamStatus = "pending" | "running" | "done" | "error";
export type ExamStage =
  | "queued"
  | "questions"
  | "answers"
  | "mapping"
  | "grading"
  | "done";

export type Verdict = "correct" | "partial" | "incorrect" | "unanswered";

/** A question as stored, shared by the server that writes it and the UI that
 *  renders it. `number`, `parentNumber` and `partLabel` are three fields rather
 *  than one because the design needs all three separately: "11 (a)" in full,
 *  "11" in the round badge, "a" in the small column beside it. */
export type QuestionRecord = {
  id: string;
  orderIndex: number;
  number: string;
  parentNumber: string;
  partLabel: string | null;
  text: string;
  maxMarks: number | null;
  pageIndex: number | null;
  box2d: Box2d | null;
};

/** What extraction produces, before a row has an id or a position. */
export type QuestionDraft = Omit<QuestionRecord, "id" | "orderIndex">;

export type AnswerStatus = "mapped" | "unmatched";

/** One student answer, as stored. `regions` is a list because an answer that
 *  runs across a page break has to highlight on both pages; `labelWritten` is
 *  what the student actually wrote and never what we deduced, so mapping can
 *  tell an explicit label from a guess. */
export type AnswerRecord = {
  id: string;
  /** Set by mapping. Null is the "answer matches no question" case. */
  questionId: string | null;
  labelWritten: string | null;
  transcript: string;
  regions: AnswerRegion[];
  /** How legible the handwriting was, 0..1 — not how correct the answer is. */
  confidence: number | null;
  status: AnswerStatus;
};

/** What extraction produces. `status` is left out on purpose: it is derived
 *  from `questionId` when the row is written, so the two cannot disagree. */
export type AnswerDraft = Omit<AnswerRecord, "id" | "status">;

/**
 * One question's mark, as stored. `questionId` is the key — the table is unique
 * on (exam, question), so there is exactly one of these per question and no
 * separate draft type is needed.
 *
 * `verdict` is derived from the two mark figures rather than stored
 * independently of them, so a pill reading "Correct" beside a score of 2/5 is
 * not representable. See `verdictFor` in the grading agent.
 */
export type GradingRecord = {
  questionId: string;
  marksAwarded: number;
  maxMarks: number;
  verdict: Verdict;
  feedback: string | null;
};

/**
 * The whole-paper summary. Every number here is arithmetic over the gradings
 * and is computed in code; only the three prose fields come from the model. A
 * total that disagrees with the marks beside it is the fastest way to lose a
 * teacher's trust in the rest of the screen.
 */
export type ExamSummary = {
  totalMarks: number;
  awardedMarks: number;
  /** Rounded to a whole number. 0 when the paper carries no printed marks. */
  percentage: number;
  answered: number;
  unanswered: number;
  unmatched: number;
  overallFeedback: string;
  strengths: string[];
  gaps: string[];
};

/** A page with a read URL minted for it. `width`/`height` travel with the URL
 *  because an overlay is positioned against the bitmap, not the viewport. */
export type SignedPage = {
  index: number;
  url: string;
  width: number;
  height: number;
};

export type SignedDocument = {
  name: string;
  sizeBytes: number;
  pages: SignedPage[];
};

/** The single payload `GET /api/exams/[id]` returns and the review screen
 *  renders — status, register and pages together, so one poll reflects the
 *  whole screen's state. */
export type ExamSnapshot = {
  id: string;
  status: ExamStatus;
  stage: ExamStage;
  progress: number;
  error: string | null;
  questionPaper: SignedDocument;
  answerSheet: SignedDocument;
  questions: QuestionRecord[];
  answers: AnswerRecord[];
  gradings: GradingRecord[];
  summary: ExamSummary | null;
};
