function normalizeSiteUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  return withProtocol.endsWith("/")
    ? withProtocol.slice(0, -1)
    : withProtocol;
}

export function getSiteUrl() {
  const siteUrl =
    normalizeSiteUrl(process.env.SITE_URL ?? "") ??
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "") ??
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "") ??
    normalizeSiteUrl(process.env.VERCEL_URL ?? "");

  return siteUrl ?? "http://localhost:3000";
}
