/**
 * Minimal fixed-window rate limiter kept in memory. Good enough for a single API instance; with several
 * instances, move this to Redis / the database.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until the key may try again, or 0 if it is currently allowed. Does not count an attempt. */
  retryAfter(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) return 0;
    return h.count >= this.max ? Math.ceil((h.resetAt - now) / 1000) : 0;
  }

  /** Records one attempt (e.g. a failed login). */
  hit(key: string, now = Date.now()) {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
    else h.count++;
    if (this.hits.size > 10_000) this.sweep(now);
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
