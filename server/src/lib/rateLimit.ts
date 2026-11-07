import { ApiError } from './http.js';

type Bucket = { count: number; resetAt: number };

/**
 * Fixed-window limiter. In-memory on purpose: the platform is a single-process app, and a
 * distributed limiter would be infrastructure we do not need. See docs/adr/0002.
 */
export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly label: string
  ) {}

  check(key: string): void {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.ensureSweeper();
      return;
    }
    existing.count += 1;
    if (existing.count > this.limit) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      throw ApiError.tooMany(
        `${this.label}: too many requests. Try again in ${retryAfter}s.`,
        retryAfter
      );
    }
  }

  private ensureSweeper(): void {
    if (this.sweeper) return;
    this.sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(key);
      }
      if (this.buckets.size === 0 && this.sweeper) {
        clearInterval(this.sweeper);
        this.sweeper = null;
      }
    }, this.windowMs);
    this.sweeper.unref?.();
  }

  reset(): void {
    this.buckets.clear();
  }
}
