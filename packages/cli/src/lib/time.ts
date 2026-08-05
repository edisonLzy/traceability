const RELATIVE_RE = /^(\d+)(s|m|h|d)$/;

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Resolve `--from`/`--to` flags into Dates. Each flag is independent:
 * a relative duration (`1h`, `30m`, `7d`, anchored to now) or anything
 * `new Date(...)` accepts (ISO 8601, epoch ms). Absent flags stay
 * undefined so the server applies its default 24h window.
 */
export function parseTimeRange(from?: string, to?: string): { from?: Date; to?: Date } {
  return { from: parseTimeFlag(from, "from"), to: parseTimeFlag(to, "to") };
}

function parseTimeFlag(value: string | undefined, flag: string): Date | undefined {
  if (value === undefined) return undefined;
  const match = RELATIVE_RE.exec(value);
  if (match) {
    const n = Number(match[1]);
    const unit = match[2]!;
    const multiplier = UNIT_MS[unit];
    if (multiplier === undefined) {
      throw new Error(`Invalid --${flag} value: ${value} (use e.g. 1h, 30m, or an ISO timestamp)`);
    }
    return new Date(Date.now() - n * multiplier);
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid --${flag} value: ${value} (use e.g. 1h, 30m, or an ISO timestamp)`);
  }
  return date;
}
