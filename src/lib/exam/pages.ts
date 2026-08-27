import "server-only";
import type { Part } from "@google/genai";
import { PAGE_BUCKET, READ_URL_TTL_SECONDS } from "@/lib/exam/storage";
import type { Supa } from "@/lib/exam/repository";
import type { PageImage, SignedPage } from "@/lib/exam/types";

const MIME_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

function mimeTypeFor(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "image/webp";
}

/**
 * Pulls one page out of the private bucket and turns it into the inline part
 * Gemini takes. The image goes to the model as bytes rather than as a signed
 * URL on purpose: a URL would make the model's view of the page depend on a
 * token that expires, and on Google being able to reach our Storage host.
 */
export async function loadPagePart(
  supabase: Supa,
  page: PageImage,
): Promise<Part> {
  const { data, error } = await supabase.storage
    .from(PAGE_BUCKET)
    .download(page.path);

  if (error || !data) {
    throw new Error(
      `Could not read page ${page.index + 1} (${page.path}): ${error?.message ?? "no data"}`,
    );
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  return {
    inlineData: {
      mimeType: data.type || mimeTypeFor(page.path),
      data: bytes.toString("base64"),
    },
  };
}

/**
 * How many pages ride along with the opening instructions.
 *
 * Every page attached up front is a model round trip not spent asking for it,
 * and a round trip on a paced key is seconds — so with the upload capped at
 * two pages this fetches the whole document in one go and the agent never
 * calls `read_page` at all. The ceiling exists for the day the cap is raised:
 * past a handful of pages the opening request stops being a saving and starts
 * being a wall of images re-sent on every turn.
 */
export const PRELOAD_PAGES = 4;

/**
 * The opening image parts for a document: a header line and the page itself,
 * per page, in order — the same shape `read_page` produces, so the model sees
 * one consistent format however a page arrived.
 *
 * `limit` overrides the ceiling for a caller that wants fewer. Answer
 * extraction passes 1 on purpose; see the note in `answers.ts`.
 */
export async function attachPages(
  supabase: Supa,
  pages: PageImage[],
  label: string,
  limit: number = PRELOAD_PAGES,
): Promise<{ parts: Part[]; count: number }> {
  const count = Math.min(pages.length, limit);
  const images = await Promise.all(
    pages.slice(0, count).map((page) => loadPagePart(supabase, page)),
  );

  return {
    count,
    parts: images.flatMap((image, index) => [
      { text: `=== ${label} — page ${index + 1} of ${pages.length} ===` },
      image,
    ]),
  };
}

/**
 * Mints read URLs for the viewer. The bucket is private, so these are the only
 * way the browser sees a page — and they carry the same `width`/`height` the
 * model was given, which is what keeps an overlay aligned with the bitmap.
 */
export async function signPages(
  supabase: Supa,
  pages: PageImage[],
): Promise<SignedPage[]> {
  if (pages.length === 0) return [];

  const { data, error } = await supabase.storage
    .from(PAGE_BUCKET)
    .createSignedUrls(
      pages.map((page) => page.path),
      READ_URL_TTL_SECONDS,
    );

  if (error || !data) {
    throw new Error(`Could not sign page URLs: ${error?.message ?? "no data"}`);
  }

  const urlByPath = new Map(
    data.map((entry) => [entry.path ?? "", entry.signedUrl]),
  );

  // A page that cannot be signed keeps its slot with a null URL rather than
  // taking the whole exam down. An upload that failed on page 3 of 4 still
  // leaves a full question register, three readable pages and every highlight
  // on them — and the viewer can say which page is missing, which is more
  // than a 500 on the way in can.
  return pages.map((page) => ({
    index: page.index,
    url: urlByPath.get(page.path) ?? null,
    width: page.width,
    height: page.height,
  }));
}
