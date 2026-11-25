/** Postgres retryable error codes: serialization failure, deadlock detected, lock not available. */
const RETRYABLE = new Set(["40001", "40P01", "55P03"]);

function errorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

/**
 * A05: bounded exponential backoff for transaction retries. SKIP LOCKED makes contention
 * rare, but serialization failures can still happen and must not surface to the user.
 */
export async function withTxRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const code = errorCode(error);
      if (!code || !RETRYABLE.has(code) || attempt === attempts - 1) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt + Math.random() * 25));
    }
  }
  throw lastError;
}
