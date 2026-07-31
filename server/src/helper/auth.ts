import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a Bearer Authorization header value against the
 * expected management token. Returns false for missing or malformed headers.
 */
export function verifyManagementBearerToken(
  authorization: string | undefined,
  expected: string,
): boolean {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) return false;
  const lb = Buffer.from(token);
  const rb = Buffer.from(expected);
  return lb.length === rb.length && timingSafeEqual(lb, rb);
}
