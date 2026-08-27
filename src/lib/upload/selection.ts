import { MAX_BYTES, MAX_PAGES_PER_DOCUMENT } from "@/lib/exam/limits";

export { MAX_BYTES, MAX_PAGES_PER_DOCUMENT };

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type FileSelection = {
  files: File[];
  /** Filename for a single file, or "3 images" for a set. */
  label: string;
  sizeBytes: number;
  /** null while a PDF's page count is still being probed. */
  pageCount: number | null;
  kind: "pdf" | "images";
};

export function isPdf(file: File) {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isSupportedImage(file: File) {
  return IMAGE_TYPES.has(file.type);
}

/**
 * Returns an error message, or null when the set is usable. A slot holds either
 * one PDF or a set of images — never a mix, because the page order of a mixed
 * set is ambiguous and the brief gives no rule for resolving it.
 */
export function validate(files: File[]): string | null {
  if (files.length === 0) return "No files selected.";

  const unsupported = files.find(
    (file) => !isPdf(file) && !isSupportedImage(file),
  );
  if (unsupported) {
    return `${unsupported.name} is not a PDF or image.`;
  }

  const pdfs = files.filter(isPdf);
  if (pdfs.length > 0 && pdfs.length !== files.length) {
    return "Upload either one PDF or a set of images, not both.";
  }
  if (pdfs.length > 1) {
    return "Only one PDF per side.";
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_BYTES) {
    return `That is ${formatBytes(total)}. The limit is 10MB.`;
  }

  // Images are one page each and countable right here. A PDF has to be opened
  // first, so its page count is checked by `pageProblem` once it resolves.
  if (pdfs.length === 0 && files.length > MAX_PAGES_PER_DOCUMENT) {
    return tooManyPages(files.length);
  }

  return null;
}

/**
 * The page cap, checked once the count is actually known.
 *
 * Separate from `validate` because a PDF's page count is only available after
 * the file has been opened, and the message has to name the real number to be
 * worth showing at all.
 */
export function pageProblem(pageCount: number | null): string | null {
  if (pageCount === null) return null;
  return pageCount > MAX_PAGES_PER_DOCUMENT ? tooManyPages(pageCount) : null;
}

function tooManyPages(pageCount: number): string {
  const unit = MAX_PAGES_PER_DOCUMENT === 1 ? "page" : "pages";
  return `That is ${pageCount} pages. The limit is ${MAX_PAGES_PER_DOCUMENT} ${unit} — every page is read by the AI, and every read is billed.`;
}

export function toSelection(files: File[]): FileSelection {
  const kind = isPdf(files[0]) ? "pdf" : "images";
  return {
    files,
    kind,
    label:
      files.length === 1 ? files[0].name : `${files.length} images selected`,
    sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
    // Images are one page each and known immediately; a PDF has to be opened.
    pageCount: kind === "images" ? files.length : null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`;
}

export function describeSelection(selection: FileSelection): string {
  const size = formatBytes(selection.sizeBytes);
  if (selection.pageCount === null) return `${size} • reading…`;
  const unit = selection.pageCount === 1 ? "Page" : "Pages";
  return `${size} • ${selection.pageCount} ${unit}`;
}
