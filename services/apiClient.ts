import { auth } from '@/firebase';
import { functionUrl } from './functions';

type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type ApiRequestInit = Omit<RequestInit, 'headers' | 'method'> & {
  method?: ApiMethod;
  headers?: Record<string, string>;
  omitAuth?: boolean;
};

async function buildHeaders(
  base: Record<string, string>,
  omitAuth?: boolean,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...base };
  if (!omitAuth) {
    const token = await auth?.currentUser?.getIdToken?.();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export async function apiFetch(
  path: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  const baseUrl = functionUrl('api');
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const { omitAuth, headers = {}, method = 'GET', ...rest } = init;
  const resolvedHeaders = await buildHeaders(headers, omitAuth);
  return fetch(url, {
    method,
    headers: resolvedHeaders,
    ...rest,
  });
}

async function parseJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

export async function apiGet<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const response = await apiFetch(path, { ...init, method: 'GET' });
  const data = await parseJson<T>(response);
  if (!response.ok) {
    const error =
      (data as Record<string, unknown>)?.error ?? `Request failed: ${response.status}`;
    throw new Error(String(error));
  }
  return data;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init: ApiRequestInit = {},
): Promise<T> {
  const isJson =
    typeof body === 'object' && body !== null && !(body instanceof FormData);
  const response = await apiFetch(path, {
    ...init,
    method: 'POST',
    body: isJson ? JSON.stringify(body) : (body as BodyInit),
    headers: {
      ...(init.headers || {}),
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const data = await parseJson<T>(response);
  if (!response.ok) {
    const error =
      (data as Record<string, unknown>)?.error ?? `Request failed: ${response.status}`;
    throw new Error(String(error));
  }
  return data;
}
