// Failure kinds every call site has to tell apart.
import { APICallError } from 'ai'

/** True only for 429 — the one failure that a wait can actually clear. */
export function isRateLimitError(error: unknown): boolean {
  return APICallError.isInstance(error) && error.statusCode === 429
}
