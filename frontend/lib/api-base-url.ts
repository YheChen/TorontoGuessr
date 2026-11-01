/**
 * The backend's base URL without a trailing slash, or null when none is set.
 *
 * Development falls back to the local backend. Anywhere else a missing value is
 * a configuration error, and the caller decides what that means: the browser
 * client throws, while the landing page renders without its live numbers.
 */
export function resolveApiBaseUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? "http://localhost:3001/api"
      : undefined);

  if (!raw) {
    return null;
  }

  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}
