import { PlaylistError } from './errors';

/** The subset of `fetch` we use, so tests can pass a fake. */
export type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface RequestOptions {
  signal?: AbortSignal;
  /** Milliseconds before giving up (big catalogs need longer). */
  timeoutMs?: number;
}

/** GET a URL as text, turning every failure into a PlaylistError. */
export async function getText(fetcher: FetchLike, url: string, { signal, timeoutMs = 30_000 }: RequestOptions = {}): Promise<string> {
  if (signal?.aborted) throw new PlaylistError('cancelled');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetcher(url, { signal: controller.signal });
    if (res.status === 401 || res.status === 403) throw new PlaylistError('auth', `HTTP ${res.status}`, res.status);
    if (!res.ok) throw new PlaylistError('http', `HTTP ${res.status}`, res.status);
    return await res.text();
  } catch (error) {
    if (error instanceof PlaylistError) throw error;
    if (signal?.aborted) throw new PlaylistError('cancelled');
    if (timedOut) throw new PlaylistError('timeout');
    throw new PlaylistError('network', error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function getJson(fetcher: FetchLike, url: string, options?: RequestOptions): Promise<unknown> {
  const text = await getText(fetcher, url, options);
  try {
    return JSON.parse(text);
  } catch {
    throw new PlaylistError('format', 'Response is not JSON');
  }
}
