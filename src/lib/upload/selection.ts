/** 10MB, matching the "Max 10MB" the design prints on each drop card. */
export const MAX_BYTES = 10 * 1024 * 1024;

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

  return null;
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
