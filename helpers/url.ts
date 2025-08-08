import { DEFAULT_ALLOWED_HOSTS } from '../constants/url';

/**
 * Normalize and validate a user-provided URL.
 * Ensures the string starts with https:// and belongs to an allowed host.
 * Removes trailing slashes to avoid duplicate links.
 *
 * @param input Raw user input
 * @returns Normalized URL string or null if invalid
 */
export function normalizeAndValidateUrl(
  input: string,
  allowedHosts: string[] = DEFAULT_ALLOWED_HOSTS,
): string | null {
  let urlStr = input.trim();
  if (!urlStr) return null;

  if (!/^https?:\/\//i.test(urlStr)) {
    urlStr = `https://${urlStr}`;
  }

  try {
    const url = new URL(urlStr);
    if (url.protocol !== 'https:') return null;

    const hostOk =
      allowedHosts.length === 0 ||
      allowedHosts.some(
        (h) => url.hostname === h || url.hostname.endsWith(`.${h}`),
      );
    if (!hostOk) return null;

    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    url.hash = url.hash || '';
    url.port = '';

    return url.toString();
  } catch {
    return null;
  }
}

// Backwards compatibility with older helpers
export function normalizeLink(
  link: string,
  allowedHosts: string[] = DEFAULT_ALLOWED_HOSTS,
): string {
  return normalizeAndValidateUrl(link, allowedHosts) ?? link.trim();
}

export function isValidHttpsUrl(
  link: string,
  restrictHosts = true,
  allowedHosts: string[] = DEFAULT_ALLOWED_HOSTS,
): boolean {
  const normalized = normalizeAndValidateUrl(
    link,
    restrictHosts ? allowedHosts : [],
  );
  if (!normalized) return false;
  return true;
}
