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

  return pages.map((page) => {
    const url = urlByPath.get(page.path);
    if (!url) throw new Error(`Could not sign ${page.path}.`);
    return { index: page.index, url, width: page.width, height: page.height };
  });
}
