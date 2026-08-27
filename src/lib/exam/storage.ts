export const PAGE_BUCKET = "exam-pages";

/** Signed read URLs last long enough that a review tab left open over lunch
 *  still renders. */
export const READ_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

export function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    default:
      return "png";
  }
}
