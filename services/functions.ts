import Constants from 'expo-constants';

const DEFAULT_REGION = 'us-central1';

function getProjectId(): string | undefined {
  // Prefer EAS runtime extra, then env
  return (
    (Constants?.expoConfig?.extra as any)?.eas?.projectId ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID
  );
}

export function functionUrl(name: string): string {
  const override = process.env.EXPO_PUBLIC_FUNCTIONS_ORIGIN;
  if (override) return `${override.replace(/\/$/, '')}/${name}`;
  const projectId = getProjectId();
  if (!projectId) throw new Error('Missing projectId for Cloud Functions');
  return `https://${DEFAULT_REGION}-${projectId}.cloudfunctions.net/${name}`;
}

export async function postJson<T = any>(
  name: string,
  body: unknown,
  options: { headers?: Record<string, string> } = {},
): Promise<T> {
  const url = functionUrl(name);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await resp.json().catch(() => ({} as T));
  if (!resp.ok) {
    throw new Error((data as any)?.error || `Request failed: ${resp.status}`);
  }
  return data as T;
}
