/**
 * One place that knows how to talk to the Odibrick API.
 *
 * On the server we call the API directly over the loopback address and forward
 * the caller's cookies. In the browser we use a relative path so the session
 * cookie travels normally and no token is ever put in JavaScript-readable storage.
 */
const INTERNAL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly traceId?: string,
  ) {
    super(message);
  }
}

type Options = RequestInit & { query?: Record<string, unknown>; noStore?: boolean };

function buildUrl(base: string, path: string, query?: Record<string, unknown>) {
  const url = new URL(`${base}/api${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
    throw new ApiError(message ?? 'Something went wrong. Try again.', res.status, data?.code, data?.traceId);
  }
  return data as T;
}

/** Server components and route handlers. */
export async function serverApi<T>(path: string, options: Options = {}): Promise<T> {
  const { headers } = await import('next/headers');
  const cookie = headers().get('cookie') ?? '';
  const res = await fetch(buildUrl(INTERNAL, path, options.query), {
    ...options,
    headers: { 'content-type': 'application/json', cookie, ...(options.headers ?? {}) },
    cache: options.noStore === false ? 'force-cache' : 'no-store',
  });
  return parse<T>(res);
}

/** Client components. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const res = await fetch(buildUrl(window.location.origin, path, options.query), {
    ...options,
    credentials: 'include',
    headers: options.body instanceof FormData
      ? (options.headers as HeadersInit)
      : { 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  return parse<T>(res);
}

/** Server fetch that returns null instead of throwing when the visitor is signed out. */
export async function serverApiOrNull<T>(path: string, options: Options = {}): Promise<T | null> {
  try {
    return await serverApi<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}
