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
