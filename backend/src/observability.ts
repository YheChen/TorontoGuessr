import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request timing accumulator, populated by the Supabase client. */
export interface RequestTimings {
  dbReadMs: number;
  dbWriteMs: number;
  dbCalls: number;
}

const store = new AsyncLocalStorage<RequestTimings>();

export function createTimings(): RequestTimings {
  return { dbReadMs: 0, dbWriteMs: 0, dbCalls: 0 };
}

/**
 * Bind a timings object to the current request's async context. Uses
 * enterWith so the many early-return routes in the router don't need to be
 * wrapped in a callback. Safe here because each serverless invocation (and
 * each local http request callback) runs in its own async context.
 */
export function enterRequestTimings(timings: RequestTimings): void {
  store.enterWith(timings);
}

/** Add one database round trip's duration to the active request, if any. */
export function recordDb(durationMs: number, kind: "read" | "write"): void {
  const timings = store.getStore();
  if (!timings) {
    return;
  }
  timings.dbCalls += 1;
  if (kind === "read") {
    timings.dbReadMs += durationMs;
  } else {
    timings.dbWriteMs += durationMs;
  }
}

/** Emit one structured timing line per request (total / db / app breakdown). */
export function logRequestTiming(
  method: string,
  path: string,
  status: number,
  totalMs: number,
  timings: RequestTimings
): void {
  const dbMs = timings.dbReadMs + timings.dbWriteMs;
  const appMs = Math.max(0, totalMs - dbMs);
  console.log(
    `[timing] ${method} ${path} ${status} ` +
      `total=${totalMs.toFixed(1)}ms ` +
      `db=${dbMs.toFixed(1)}ms(r=${timings.dbReadMs.toFixed(1)} ` +
      `w=${timings.dbWriteMs.toFixed(1)} n=${timings.dbCalls}) ` +
      `app=${appMs.toFixed(1)}ms`
  );
}
