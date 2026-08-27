/**
 * What one upload is allowed to be.
 *
 * Shared by the browser, which enforces these early so a teacher is told
 * before anything is rasterized, and by the route handler, which enforces
 * them for real — the browser's copy is a courtesy and the server's is the
 * one that counts.
 *
 * The page cap is a **spend** control, not a technical one. Every page is an
 * image the extraction agents read, and every read is billed: the fixture run
 * measured 9.2k prompt tokens for two question-paper pages and 22.2k for four
 * answer-sheet pages. Nothing in the pipeline breaks at thirty pages — it
 * simply costs fifteen times as much and, on the free tier's ~10 calls a
 * minute, takes long enough to hit the client's own deadline. Raise this when
 * a real paper needs it and you are willing to pay for it.
 */
// Annotated `number` rather than left to widen to the literal `2`: this is a
// knob, and code that reads it must stay correct when it is turned.
export const MAX_PAGES_PER_DOCUMENT: number = 2;

/** 10MB, matching the "Max 10MB" the design prints on each drop card. */
export const MAX_BYTES = 10 * 1024 * 1024;
