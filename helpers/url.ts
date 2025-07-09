export function normalizeLink(link: string): string {
  return link.trim();
}

const allowedHosts = ['amazon.com', 'gofundme.com', 'venmo.com'];

export function isValidHttpsUrl(link: string, restrictHosts = true): boolean {
  try {
    const url = new URL(link.trim());
    if (url.protocol !== 'https:') return false;
    if (restrictHosts && !allowedHosts.some(h => url.hostname.includes(h))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
