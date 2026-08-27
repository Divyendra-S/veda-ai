import "server-only";
import { GoogleGenAI } from "@google/genai";
import { serverEnv } from "@/lib/env";

/**
 * Gemini is the AI provider for this project: it has a genuinely usable free
 * tier, native vision over page images, function calling for the agent loop,
 * and — the reason it wins here — it returns `box_2d` bounding boxes, which is
 * what makes "highlight the exact region of the answer sheet" possible without
 * a separate OCR stack.
 */

let cached: GoogleGenAI | undefined;

export function geminiClient(): GoogleGenAI {
  cached ??= new GoogleGenAI({ apiKey: serverEnv.geminiApiKey });
  return cached;
}

/**
 * Flash rather than Pro: the free tier's per-minute and per-day limits are far
 * more generous on Flash, and every task here (transcribe, locate, match) is a
 * grounded extraction from an image rather than open-ended reasoning.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
