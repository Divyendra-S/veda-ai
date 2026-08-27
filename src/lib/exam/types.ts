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
};
