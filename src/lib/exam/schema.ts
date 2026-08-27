import { z } from "zod";

/**
 * The shape of the `question_paper` / `answer_sheet` jsonb columns.
 *
 * jsonb comes back from Postgres as `Json`, which is `unknown` in practice, and
 * every downstream coordinate calculation depends on `width`/`height` being the
 * dimensions of the bitmap that was actually uploaded. Parsing on the way out
 * turns a corrupt column into one clear error here rather than a highlight
 * drawn in the wrong place three layers later.
 */
export const pageImageSchema = z.object({
  index: z.number().int().min(0),
  path: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const documentMetaSchema = z.object({
  name: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pages: z.array(pageImageSchema).min(1),
});
