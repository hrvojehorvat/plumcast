import { routeUrl } from './net';

export type StreamCheck = 'ok' | 'missing' | 'unknown';

/**
 * Asks for a stream and looks only at the answer's headers, then hangs up. Replay links whose
 * recording is gone still answer "200", but with a web page (XUI: "ARCHIVE_DOESNT_EXIST")
 * instead of video. 'unknown' when there's no answer in time (then just try to play it).
 */
export function probeStream(url: string, timeoutMs = 6000): Promise<StreamCheck> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let done = false;
    const finish = (result: StreamCheck) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        xhr.abort();
      } catch {
        // already closed
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish('unknown'), timeoutMs);
    xhr.onreadystatechange = () => {
      if (xhr.readyState < 2 || xhr.status === 0) return;
      const type = (xhr.getResponseHeader('content-type') ?? '').toLowerCase();
      finish(xhr.status === 404 || xhr.status === 410 || type.includes('text/html') ? 'missing' : 'ok');
    };
    xhr.onerror = () => finish('unknown');
    try {
      xhr.open('GET', routeUrl(url));
      xhr.send();
    } catch {
      finish('unknown');
    }
  });
}
