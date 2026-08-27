/**
 * Request pacing for the Gemini free tier.
 *
 * Two separate problems, solved in one place because they interact:
 *
 *  1. **Pacing.** The free tier allows roughly 10 requests/minute. A four-agent
 *     pipeline over a multi-page paper will happily fire faster than that, so
 *     requests pass through a token bucket that spaces them out *before* the
 *     API has to reject anything.
 *  2. **Absorbing rejections.** Quotas are enforced per-minute *and* per-day,
 *     and other traffic on the same key eats the same budget. So a 429 still
 *     happens, and when it does we back off with full jitter rather than
 *     retrying in lockstep.
 *
 * The bucket is shared per limiter instance, and acquisition is serialised
 * through a promise chain so two concurrent callers can never both be handed
 * the last token.
 */

export type RetryInfo = {
  attempt: number;
  status: number | undefined;
  delayMs: number;
  message: string;
};

export type RateLimiterOptions = {
  /** Requests per minute to pace at. Defaults to `GEMINI_RPM`. */
  rpm?: number;
  /** How many requests may burst before pacing kicks in. Default 2. */
  burst?: number;
  /** Retries after the first attempt. Default 4. */
  maxRetries?: number;
  /** First backoff step; doubles each attempt. Default 1000ms. */
  baseDelayMs?: number;
  /** Ceiling on a single backoff. Default 32s. */
  maxDelayMs?: number;
  onRetry?: (info: RetryInfo) => void;
  signal?: AbortSignal;
};

/**
 * Default pacing, from `GEMINI_RPM`.
 *
 * This is the single largest lever on how long a run takes, and it cannot be
 * inferred: the free tier allows about 10 requests a minute, a paid key allows
 * a thousand, and the API will not say which one it is looking at. At 10 the
 * pipeline spends a minute of an eleven-call run doing nothing but waiting for
 * a token; at 1000 it never waits at all.
 *
 * The default stays at the free-tier figure because that is the key a reviewer
 * opening this project will have, and guessing high there would turn every run
 * into a 429 storm. Guessing low only costs time — which is why raising it is
 * a one-line change in `.env.local` rather than a code change.
 */
export function defaultRpm(): number {
  const raw = Number(process.env.GEMINI_RPM);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

/** Statuses worth retrying: quota, transient server faults, upstream timeouts. */
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Pulls an HTTP status off whatever shape the SDK or fetch threw. */
export function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; code?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  return undefined;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Gemini's 429 body carries a RetryInfo hint (`"retryDelay": "23s"`). Honouring
 * it beats guessing — it is the server telling us exactly when the per-minute
 * window rolls over.
 */
function serverRetryHintMs(error: unknown): number | undefined {
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(messageOf(error));
  if (!match) return undefined;
  return Math.ceil(Number(match[1]) * 1000);
}

function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined) return RETRYABLE.has(status);
  // No status at all means the request never reached the API — a socket reset
  // or a DNS blip. Those are worth one more go; a programming error is not.
  const message = messageOf(error).toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly onRetry?: (info: RetryInfo) => void;
  private readonly signal?: AbortSignal;

  private tokens: number;
  private lastRefill = Date.now();
  /** Serialises acquisition so the bucket is never double-spent. */
  private gate: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions = {}) {
    const rpm = options.rpm ?? defaultRpm();
    this.capacity = Math.max(1, options.burst ?? 2);
    this.refillPerMs = rpm / 60_000;
    this.maxRetries = options.maxRetries ?? 4;
    this.baseDelayMs = options.baseDelayMs ?? 1_000;
    this.maxDelayMs = options.maxDelayMs ?? 32_000;
    this.onRetry = options.onRetry;
    this.signal = options.signal;
    this.tokens = this.capacity;
  }

  /** Runs `fn` once a token is free, retrying it on quota and transient faults. */
  async run<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
    let attempt = 0;
    for (;;) {
      await this.acquire();
      try {
        return await fn(attempt);
      } catch (error) {
        if (this.signal?.aborted) throw error;
        if (attempt >= this.maxRetries || !isRetryable(error)) throw error;

        const delayMs = this.backoffMs(attempt, error);
        this.onRetry?.({
          attempt,
          status: statusOf(error),
          delayMs,
          message: messageOf(error),
        });
        // A 429 means the bucket was optimistic: drain it so the retry does not
        // immediately spend a token that the server has already refused.
        this.tokens = 0;
        this.lastRefill = Date.now();
        await sleep(delayMs, this.signal);
        attempt += 1;
      }
    }
  }

  /**
   * Full jitter: a uniform draw over [0, window). Equal jitter and no jitter
   * both keep concurrent callers synchronised, which is the thing that turns
   * one 429 into a storm of them.
   */
  private backoffMs(attempt: number, error: unknown): number {
    const hint = serverRetryHintMs(error);
    const window = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
    const jittered = Math.round(Math.random() * window);
    // Never undercut the server's own hint, and never sleep for zero.
    return Math.max(hint ?? 0, jittered, 250);
  }

  private acquire(): Promise<void> {
    const next = this.gate.then(() => this.take());
    // Keep the chain alive when an acquisition rejects (abort), otherwise every
    // later caller inherits the rejection.
    this.gate = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async take(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil((1 - this.tokens) / this.refillPerMs);
      await sleep(waitMs, this.signal);
    }
  }

  private refill(): void {
    const now = Date.now();
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (now - this.lastRefill) * this.refillPerMs,
    );
    this.lastRefill = now;
  }
}
