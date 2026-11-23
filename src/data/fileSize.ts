import { sizeFromHeaders } from '../core/netSpeed';
import { getSetting, setSetting } from './db';
import { routeUrl } from './net';

/**
 * A video file's size, for Auto buffer when the provider lists no bitrate (size ÷ length). Asked once per
 * video with a request for its first byte; only the headers are read, then the request is cancelled (a
 * server that ignores the range would otherwise send the whole file). Remembered, since sizes don't change.
 */
const KEY = 'fileSizes';
const KEEP = 300;
const TIMEOUT_MS = 5_000;

let sizes: Record<string, number> | null = null;

async function load(): Promise<Record<string, number>> {
  if (sizes) return sizes;
  try {
    const raw = await getSetting(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    sizes = parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    sizes = {};
  }
  return sizes;
}

function remember(key: string, size: number) {
  if (!sizes) return;
  delete sizes[key];
  sizes[key] = size;
  const keys = Object.keys(sizes);
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP))) delete sizes[old];
  void setSetting(KEY, JSON.stringify(sizes)).catch(() => undefined);
}

function askSize(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let done = false;
    const finish = (size: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      xhr.abort();
      resolve(size);
    };
    const timer = setTimeout(() => finish(null), TIMEOUT_MS);
    xhr.onreadystatechange = () => {
      if (xhr.readyState >= 2) finish(sizeFromHeaders(xhr.status, xhr.getResponseHeader('Content-Range'), xhr.getResponseHeader('Content-Length')));
    };
    xhr.onerror = () => finish(null);
    try {
      xhr.open('GET', routeUrl(url));
      xhr.setRequestHeader('Range', 'bytes=0-0');
      xhr.send();
    } catch {
      finish(null);
    }
  });
}

/** The size in bytes of the video at `url` (`key` names it for the memory), or null when the server doesn't say. */
export async function fileSize(key: string, url: string): Promise<number | null> {
  const known = (await load())[key];
  if (known) return known;
  const size = await askSize(url);
  if (size) remember(key, size);
  return size;
}
