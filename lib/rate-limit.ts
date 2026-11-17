const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit = 30, windowMs = 5 * 60_000): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  buckets.set(key, [...recent, now]);
  return true;
}

export function clientKey(request: Request, action: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${action}:${forwarded || 'local'}`;
}
