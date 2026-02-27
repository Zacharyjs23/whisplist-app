const DEFAULT_PUBLIC_ORIGIN = 'https://whisplist.app';

function trimTrailingSlash(value: string): string {
  if (!value) return value;
  return value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
}

export function getPublicOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_ORIGIN?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }
  return DEFAULT_PUBLIC_ORIGIN;
}

export function buildPublicWishUrl(
  wishId: string,
  queryParams?: Record<string, string | number | boolean | undefined>,
): string {
  const base = getPublicOrigin();
  const url = new URL(`/wish/${encodeURIComponent(wishId)}`, `${base}/`);
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}
