const SENSITIVE_KEY = /(?:authorization|cookie|password|passwd|token|secret|api[_-]?key)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g;
const MAX_DEPTH = 32;
const MAX_STRING_LENGTH = 16 * 1024;

export function scrubValue(value: unknown, depth = 0, key?: string): unknown {
  if (depth > MAX_DEPTH) return "[Truncated: maximum depth]";
  if (key && SENSITIVE_KEY.test(key)) return "[Filtered]";

  if (typeof value === "string") {
    return value
      .slice(0, MAX_STRING_LENGTH)
      .replace(EMAIL, "[Filtered Email]")
      .replace(JWT, "[Filtered JWT]");
  }
  if (Array.isArray(value)) return value.slice(0, 1000).map((item) => scrubValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 1000)
        .map(([childKey, childValue]) => [childKey, scrubValue(childValue, depth + 1, childKey)]),
    );
  }
  return value;
}

export function parseAndScrubEvent(payload: Buffer): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(payload.toString("utf8"));
  } catch {
    throw new Error("event payload is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("event payload must be an object");
  }
  return scrubValue(value) as Record<string, unknown>;
}
