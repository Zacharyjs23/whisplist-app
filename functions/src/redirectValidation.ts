const DEFAULT_HTTPS_HOST_PATTERNS = [
  'whisplist.app',
  '*.whisplist.app',
  'whisplist.page.link',
];
const DEFAULT_INSECURE_HOST_PATTERNS = ['localhost', '127.0.0.1', '0.0.0.0'];
const DEFAULT_CUSTOM_SCHEMES = ['whisplist'];

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildHostPatterns(
  provided: string[] | undefined,
  fallback: string[],
): string[] {
  if (provided && provided.length > 0) return provided;
  return fallback;
}

const allowedHttpsHostPatterns = buildHostPatterns(
  parseList(process.env.ALLOWED_REDIRECT_HOSTS).map((pattern) =>
    pattern.toLowerCase(),
  ),
  DEFAULT_HTTPS_HOST_PATTERNS,
).map((pattern) => pattern.toLowerCase());

const allowedInsecureHostPatterns = buildHostPatterns(
  parseList(process.env.ALLOWED_INSECURE_REDIRECT_HOSTS).map((pattern) =>
    pattern.toLowerCase(),
  ),
  DEFAULT_INSECURE_HOST_PATTERNS,
).map((pattern) => pattern.toLowerCase());

const additionalSchemes = parseList(process.env.ALLOWED_REDIRECT_SCHEMES).map(
  (s) => s.toLowerCase(),
);
const allowedCustomSchemes = new Set([
  ...DEFAULT_CUSTOM_SCHEMES.map((s) => s.toLowerCase()),
  ...additionalSchemes,
]);

function matchesHostPattern(host: string, pattern: string): boolean {
  if (pattern === host) return true;
  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // keep the leading dot for endsWith check
    return host === pattern.slice(2) || host.endsWith(suffix);
  }
  return false;
}

function hostAllowed(host: string, patterns: string[]): boolean {
  if (!host) return false;
  const normalizedHost = host.toLowerCase();
  return patterns.some((pattern) =>
    matchesHostPattern(normalizedHost, pattern),
  );
}

class RedirectUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedirectUrlError';
  }
}

export function assertValidRedirectUrl(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== 'string') {
    throw new RedirectUrlError(`${fieldName} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new RedirectUrlError(`${fieldName} must not be empty`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new RedirectUrlError(`${fieldName} is not a valid URL`);
  }

  const scheme = parsed.protocol.slice(0, -1).toLowerCase();
  if (!scheme) {
    throw new RedirectUrlError(`${fieldName} is missing a scheme`);
  }

  if (scheme === 'http') {
    if (!hostAllowed(parsed.hostname, allowedInsecureHostPatterns)) {
      throw new RedirectUrlError(`${fieldName} host is not allowed for http`);
    }
    return trimmed;
  }

  if (scheme === 'https') {
    if (!hostAllowed(parsed.hostname, allowedHttpsHostPatterns)) {
      throw new RedirectUrlError(`${fieldName} host is not allowed`);
    }
    return trimmed;
  }

  if (scheme.startsWith('exp')) {
    // Expo development schemes (exp://, exp+devclient://, etc.)
    return trimmed;
  }

  if (!allowedCustomSchemes.has(scheme)) {
    throw new RedirectUrlError(`${fieldName} scheme is not allowed`);
  }
  return trimmed;
}

export { RedirectUrlError };
