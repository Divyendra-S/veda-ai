/**
 * Rasterization happens here, in the browser, and nowhere else.
 *
 * This is the load-bearing decision of the whole app. The exact bitmaps
 * produced by this module are both (a) sent to Gemini for extraction and
 * (b) rendered in the answer-sheet viewer. Because they are the same pixels,
 * a normalised box the model returns lands on the right handwriting with no
 * coordinate conversion, no DPI reconciliation and no server-side canvas
 * dependency. See docs/ARCHITECTURE.md §3.
 */

/** PDF pages render at this width. Enough detail for handwriting, small enough
 *  to stay well inside Gemini's per-image budget. */
export const TARGET_WIDTH = 1600;

export type RasterPage = {
  index: number;
  blob: Blob;
  width: number;
  height: number;
};

export class PdfPasswordError extends Error {
  constructor() {
    super("That PDF is password-protected. Remove the password and try again.");
    this.name = "PdfPasswordError";
  }
}

type PdfjsModule = typeof import("pdfjs-dist");
let pdfjs: Promise<PdfjsModule> | null = null;

/**
 * Loaded on demand rather than at module scope: pdf.js is ~400KB and touches
 * DOM globals, so importing it eagerly would both bloat the entry bundle and
 * run during server rendering of the client component that uses it.
 */
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjs ??= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return module;
  });
  return pdfjs;
}

/**
 * Returns the loading task alongside the document. `destroy()` lives on the
 * task, not the proxy, and it is what terminates the worker — skipping it leaks
 * a worker per PDF the teacher opens.
 */
async function openPdf(file: File) {
  const { getDocument, PasswordException } = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = getDocument({ data });
  try {
    return { task, doc: await task.promise };
  } catch (error) {
    await task.destroy();
    if (error instanceof PasswordException) throw new PdfPasswordError();
    throw error;
  }
}

/** Opens the document just far enough to read its page count for the file chip. */
export async function countPdfPages(file: File): Promise<number> {
  const { task, doc } = await openPdf(file);
  try {
    return doc.numPages;
  } finally {
    await task.destroy();
  }
}

/**
 * WebP is roughly a fifth of the size of PNG for scanned paper at visually
 * identical quality, which matters when a six-page answer sheet has to reach
 * Storage before the teacher loses patience. Falls back to JPEG on browsers
 * whose canvas cannot encode WebP.
 */
async function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await toBlob(canvas, "image/webp", 0.92);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.92);
  if (jpeg) return jpeg;
  throw new Error("This browser could not encode the page image.");
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get a 2D canvas context.");
  // Paper is white. Without this, transparent PDF backgrounds encode as black
  // in JPEG and as transparency the model has to guess at in WebP.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, context };
}

async function rasterizePdf(
  file: File,
  onPage: (page: RasterPage) => void,
  startIndex: number,
): Promise<number> {
  const { task, doc } = await openPdf(file);
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      // PDFs are vector, so scaling up to the target adds real detail.
      const viewport = page.getViewport({ scale: TARGET_WIDTH / base.width });
      const { canvas, context } = makeCanvas(viewport.width, viewport.height);

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();

      onPage({
        index: startIndex + pageNumber - 1,
        blob: await encode(canvas),
        width: canvas.width,
        height: canvas.height,
      });
      canvas.width = 0;
      canvas.height = 0;
    }
    return doc.numPages;
  } finally {
    await task.destroy();
  }
}

async function rasterizeImage(
  file: File,
  index: number,
): Promise<RasterPage> {
  const bitmap = await createImageBitmap(file);
  try {
    // Never upscale a photo: enlarging it invents no detail and multiplies the
    // upload for nothing. Boxes are normalised, so pages may differ in size.
    const scale = Math.min(1, TARGET_WIDTH / bitmap.width);
    const { canvas, context } = makeCanvas(
      bitmap.width * scale,
      bitmap.height * scale,
    );
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return {
      index,
      blob: await encode(canvas),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Turns one PDF or a set of images into an ordered page list. Reports progress
 * per page, since a six-page scan takes long enough that silence reads as a
 * hang.
 */
export async function rasterize(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<RasterPage[]> {
  const pages: RasterPage[] = [];
  const isPdf = files.length === 1 && files[0].type === "application/pdf";

  if (isPdf) {
    const total = await countPdfPages(files[0]);
    await rasterizePdf(
      files[0],
      (page) => {
        pages.push(page);
        onProgress?.(pages.length, total);
      },
      0,
    );
    return pages;
  }

  for (const [index, file] of files.entries()) {
    pages.push(await rasterizeImage(file, index));
    onProgress?.(pages.length, files.length);
  }
  return pages;
}
