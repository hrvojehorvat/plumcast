// Local CORS proxy for testing Plumcast in the browser. Development only: never shipped or deployed.
//
// Xtream servers are usually plain http:// and send no CORS headers, so a browser page on
// localhost can't call them. This forwards http://127.0.0.1:8787/<path>?<query> to
// <EXPO_PUBLIC_DEV_XTREAM_URL>/<path>?<query> and adds CORS headers.
// It only listens on 127.0.0.1 and only talks to the one server from .env.local.
// Run: npm run proxy
import { createServer } from 'node:http';
import { Readable } from 'node:stream';

const upstream = process.env.EXPO_PUBLIC_DEV_XTREAM_URL;
const port = Number(process.env.EXPO_PUBLIC_DEV_PROXY_PORT || 8787);

if (!upstream) {
  console.error('Set EXPO_PUBLIC_DEV_XTREAM_URL in apps/plumcast/.env.local (see .env.example).');
  process.exit(1);
}
const base = new URL(upstream);

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
// Request headers worth passing on (Range is needed for seeking in movies).
const PASS_REQUEST = ['range', 'accept', 'user-agent'];
const DROP_RESPONSE = new Set(['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'access-control-allow-origin']);

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && LOCAL_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  }
}

/** Never log credentials: Xtream puts them in query strings and paths. */
function redact(path) {
  return path.replace(/(username|password)=[^&]*/g, '$1=***').replace(/^\/(live|movie|series|timeshift)\/[^/]+\/[^/]+\//, '/$1/***/***/');
}

createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();

  // Only the path and query come from the request; the host is always the configured one.
  const target = new URL(req.url ?? '/', base);
  target.protocol = base.protocol;
  target.host = base.host;

  const headers = {};
  for (const name of PASS_REQUEST) if (req.headers[name]) headers[name] = req.headers[name];

  const controller = new AbortController();
  res.on('close', () => controller.abort());
  try {
    // Streams often redirect to a load-balancer host; fetch follows that server-side.
    const upstreamRes = await fetch(target, { method: req.method, headers, redirect: 'follow', signal: controller.signal });
    upstreamRes.headers.forEach((value, name) => {
      if (!DROP_RESPONSE.has(name)) res.setHeader(name, value);
    });
    res.writeHead(upstreamRes.status);
    console.log(`${upstreamRes.status} ${redact(target.pathname + target.search)}`);
    if (!upstreamRes.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(upstreamRes.body).on('error', () => res.destroy()).pipe(res);
  } catch (error) {
    if (controller.signal.aborted) return;
    console.error(`502 ${redact(target.pathname)}: ${error.message}`);
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Proxy could not reach the server.');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Plumcast dev proxy: http://127.0.0.1:${port} → ${base.origin}`);
});
