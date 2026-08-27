"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { box2dToRect } from "@/lib/exam/geometry";
import type { Target } from "@/lib/exam/review-model";
import type { SignedPage } from "@/lib/exam/types";

/** The focused box, plus a token that changes on every click so selecting the
 *  same question twice scrolls to it again instead of doing nothing. */
export type Focus = { regionId: string; token: number };

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM = ZOOMS.indexOf(1);

/**
 * The answer sheet, with the selected answer's region drawn over it.
 *
 * Boxes are positioned in percentages — a box is normalised to 0..1000, so
 * `box2dToRect` against a 100x100 page yields exactly the percentages CSS
 * wants, and the overlay then tracks the image at any width with no resize
 * observer and no measurement of the bitmap. Zoom is then just the width of
 * the column the pages sit in: the images fill it, the boxes are a percentage
 * of the images, and the scroll container gains a horizontal scrollbar on its
 * own. `justify-center-safe` is what keeps a zoomed-in page reachable — plain
 * centring would push its left edge out of the scrollable area.
 *
 * Two traps, both found by measuring the rendered width rather than by
 * reading the code. The CSS `zoom` property looks like the obvious tool and is
 * the wrong one: percentage widths resolve against the containing block in the
 * zoomed coordinate space, so `w-full` cancels the zoom exactly and only fixed
 * lengths — the text in the tab — actually grow. And a flex item shrinks by
 * default, which quietly clamps a 150% column back to the width of its
 * container; `shrink-0` is what makes the width mean what it says.
 *
 * Only the selected answer is drawn. The export shows one highlight at a time
 * and it is right to: a sheet under a dozen boxes at once tells a teacher
 * nothing about which one they just clicked.
 */
export function AnswerSheetPanel({
  pages,
  target,
  focus,
}: {
  pages: SignedPage[];
  target: Target | null;
  focus: Focus | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const frame = useRef(0);
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM);
  const [page, setPage] = useState(0);
  const zoom = ZOOMS[zoomIndex];

  /** Which page holds the middle of the viewport. A readout, not a pager: the
   *  viewer scrolls continuously and this follows it. */
  const syncPage = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const middle =
      container.getBoundingClientRect().top + container.clientHeight / 2;
    let current = 0;
    pageRefs.current.forEach((element, index) => {
      if (element && element.getBoundingClientRect().top <= middle) {
        current = index;
      }
    });
    setPage(current);
  }, []);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(syncPage);
  }, [syncPage]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  useEffect(syncPage, [syncPage, zoom]);

  // Centring rather than scrolling the box to the top edge: an answer is read
  // in context, and the line above it is often the question number that proves
  // the highlight landed on the right one.
  useEffect(() => {
    const container = scrollRef.current;
    if (!focus || !container) return;
    const box = container.querySelector(`[data-region="${focus.regionId}"]`);
    if (!(box instanceof HTMLElement)) return;

    const view = container.getBoundingClientRect();
    const rect = box.getBoundingClientRect();
    container.scrollTo({
      top: Math.max(
        0,
        container.scrollTop + (rect.top - view.top) - (view.height - rect.height) / 2,
      ),
      left: Math.max(
        0,
        container.scrollLeft + (rect.left - view.left) - (view.width - rect.width) / 2,
      ),
      behavior: "smooth",
    });
  }, [focus]);

  const goToPage = (index: number) => {
    const container = scrollRef.current;
    const element = pageRefs.current[index];
    if (!container || !element) return;
    const offset =
      element.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({
      top: Math.max(0, container.scrollTop + offset - 12),
      behavior: "smooth",
    });
  };

  const missing = target && target.regions.length === 0;

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-panel bg-viewer shadow-card">
      <header className="shrink-0 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="mr-auto truncate text-[16px] font-semibold text-white">
            Answer Sheet
          </h2>

          <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-viewer-raised p-1">
            <ViewerButton
              label="Zoom out"
              disabled={zoomIndex === 0}
              onClick={() => setZoomIndex((index) => Math.max(0, index - 1))}
            >
              <Minus className="size-4" strokeWidth={2.5} />
            </ViewerButton>
            <span className="w-11 text-center text-[13px] font-semibold tabular-nums text-white">
              {Math.round(zoom * 100)}%
            </span>
            <ViewerButton
              label="Zoom in"
              disabled={zoomIndex === ZOOMS.length - 1}
              onClick={() =>
                setZoomIndex((index) => Math.min(ZOOMS.length - 1, index + 1))
              }
            >
              <Plus className="size-4" strokeWidth={2.5} />
            </ViewerButton>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-viewer-raised p-1">
            <ViewerButton
              label="Previous page"
              disabled={page === 0}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="size-4" strokeWidth={2.5} />
            </ViewerButton>
            <span
              className="px-1 text-[13px] font-semibold text-white"
              aria-live="polite"
            >
              Page {page + 1} of {pages.length}
            </span>
            <ViewerButton
              label="Next page"
              disabled={page >= pages.length - 1}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </ViewerButton>
          </div>
        </div>

        {missing ? (
          <p className="mt-2.5 rounded-[12px] bg-white/8 px-3.5 py-2.5 text-[13px] text-white/70">
            <span className="font-semibold text-white">{target.tag}</span> was
            not attempted — there is nothing on the sheet to highlight.
          </p>
        ) : null}
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-slim-dark flex-1 overflow-auto px-4 pb-4"
      >
        <div className="flex justify-center-safe">
          <div
            className="flex shrink-0 flex-col gap-3"
            style={{ width: `${zoom * 100}%` }}
          >
            {pages.map((sheet, index) => (
              <div
                key={sheet.index}
                ref={(element) => {
                  pageRefs.current[index] = element;
                }}
                data-page={sheet.index}
                className="relative"
              >
                <Image
                  src={sheet.url}
                  alt={`Answer sheet page ${sheet.index + 1}`}
                  width={sheet.width}
                  height={sheet.height}
                  unoptimized
                  className="w-full rounded-[10px] bg-white"
                />

                {(target?.regions ?? [])
                  .filter((region) => region.pageIndex === sheet.index)
                  .map((region) => {
                    const rect = box2dToRect(region.box2d, 100, 100);
                    const focused = focus?.regionId === region.id;
                    return (
                      <div
                        key={focused ? `${region.id}:${focus.token}` : region.id}
                        data-region={region.id}
                        className={cn(
                          "pointer-events-none absolute rounded-[6px] border-2 border-highlight bg-highlight/10",
                          focused && "animate-reveal",
                        )}
                        style={{
                          left: `${rect.left}%`,
                          top: `${rect.top}%`,
                          width: `${rect.width}%`,
                          height: `${rect.height}%`,
                        }}
                      >
                        <span className="absolute -top-0.5 left-0 -translate-y-full rounded-t-[5px] bg-highlight-tab px-1.5 py-[3px] text-[11px] font-semibold leading-none whitespace-nowrap text-white">
                          {target?.tag}
                          {region.total > 1
                            ? ` · ${region.ordinal}/${region.total}`
                            : ""}
                        </span>
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ViewerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-6 cursor-pointer place-items-center rounded-full text-white transition-colors hover:bg-white/15 disabled:cursor-default disabled:text-white/30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
