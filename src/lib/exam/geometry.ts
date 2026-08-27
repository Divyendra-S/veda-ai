import type { Box2d } from "@/lib/exam/types";

export type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * The only place a box_2d is converted to pixels. Gemini returns
 * [ymin, xmin, ymax, xmax] on a 0..1000 scale with **y first**; the natural
 * assumption is x first, and getting it wrong looks like "the model is bad at
 * grounding" rather than like a bug.
 *
 * `width` and `height` are the rendered size of the page, which may be CSS
 * pixels at any zoom level — the normalised box is resolution independent, so
 * the same call works for a thumbnail and for a 200% zoom.
 */
export function box2dToRect(box: Box2d, width: number, height: number): Rect {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    left: (xmin / 1000) * width,
    top: (ymin / 1000) * height,
    width: ((xmax - xmin) / 1000) * width,
    height: ((ymax - ymin) / 1000) * height,
  };
}

/** Clamps a model-supplied box into range and fixes inverted edges. */
export function normalizeBox(box: Box2d): Box2d {
  const clamp = (value: number) => Math.min(1000, Math.max(0, Math.round(value)));
  const [a, b, c, d] = box.map(clamp) as Box2d;
  return [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
}
