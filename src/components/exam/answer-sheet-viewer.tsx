import Image from "next/image";
import { box2dToRect } from "@/lib/exam/geometry";
import type { AnswerRecord, SignedPage } from "@/lib/exam/types";

/**
 * The answer sheet with the extracted regions drawn over it.
 *
 * Positioning is in percentages, not pixels: a box is normalised to 0..1000, so
 * asking `box2dToRect` for a rect on a 100x100 page yields exactly the
 * percentages CSS wants, and the overlay then tracks the image at any width
 * without a resize observer or a layout measurement. Phase 7 builds the real
 * viewer — zoom, scroll-to-region, selection — on top of this geometry.
 */
export function AnswerSheetViewer({
  pages,
  answers,
}: {
  pages: SignedPage[];
  answers: AnswerRecord[];
}) {
  return (
    <div className="space-y-3">
      {pages.map((page) => (
        <div key={page.index} className="relative">
          <Image
            src={page.url}
            alt={`Answer sheet page ${page.index + 1}`}
            width={page.width}
            height={page.height}
            unoptimized
            className="w-full rounded-lg bg-white"
          />

          {answers.flatMap((answer, position) =>
            answer.regions
              .filter((region) => region.pageIndex === page.index)
              .map((region, part) => {
                const rect = box2dToRect(region.box2d, 100, 100);
                return (
                  <div
                    key={`${answer.id}-${part}`}
                    className="absolute rounded-[3px] border-2 border-brand/80 bg-brand/12"
                    style={{
                      left: `${rect.left}%`,
                      top: `${rect.top}%`,
                      width: `${rect.width}%`,
                      height: `${rect.height}%`,
                    }}
                  >
                    <span className="absolute -top-px left-0 -translate-y-full rounded-t-[3px] bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {answer.labelWritten ?? `#${position + 1}`}
                      {answer.regions.length > 1
                        ? ` · ${part + 1}/${answer.regions.length}`
                        : ""}
                    </span>
                  </div>
                );
              }),
          )}
        </div>
      ))}
    </div>
  );
}
