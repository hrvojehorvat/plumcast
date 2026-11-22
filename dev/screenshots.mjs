// Screenshots for the project page (mrvoje.com/plumcast). Development only: never shipped or deployed.
//
// Starts the demo server (invented channels, films, series), the dev CORS proxy and the app in the
// browser, all pointed at the demo, then drives headless Chrome over its DevTools protocol: adds
// the demo playlist and saves TV shots (960×540 layout = 1600×900 pixels) and phone shots
// (390×844 at 2×). Plum gets typed sentences through the dev-only window.__plumcastSay.
// Never uses .env.local or a real provider: the app is built from a temporary copy of the project
// without any .env* file (Expo's web bundler reads .env.local from disk whatever the environment
// says), and the demo login is set here. Nothing is saved unless the form shows the demo server.
//
// Run: node dev/screenshots.mjs [output folder]   (default: dev/screenshots-out, gitignored)
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'dev/screenshots-out';
const APP_PORT = 8099;
const DEMO_PORT = 8790;
const PROXY_PORT = 8797;
const CDP_PORT = 9333;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = `http://localhost:${APP_PORT}`;

const env = {
  ...process.env,
  EXPO_PUBLIC_DEV_XTREAM_URL: `http://127.0.0.1:${DEMO_PORT}`,
  EXPO_PUBLIC_DEV_XTREAM_USER: 'demo',
  EXPO_PUBLIC_DEV_XTREAM_PASS: 'demo',
  EXPO_PUBLIC_DEV_PROXY_PORT: String(PROXY_PORT),
  DEMO_PORT: String(DEMO_PORT),
  BROWSER: 'none',
  CI: '1',
  // Never .env.local (a real login), and a build cache of its own (see metro.config.js).
  EXPO_NO_DOTENV: '1',
  PLUMCAST_METRO_CACHE: join(tmpdir(), 'plumcast-screenshots-metro'),
};

const children = [];
function run(cmd, args, name, cwd = process.cwd()) {
  const child = spawn(cmd, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', () => {});
  child.stderr.on('data', (d) => {
    // Chrome logs harmless noise on stderr; only the app's own errors matter.
    if (name !== 'chrome' && /error/i.test(String(d))) console.error(`[${name}] ${String(d).trim().slice(0, 300)}`);
  });
  children.push(child);
  return child;
}
function stopAll() {
  for (const c of children) c.kill('SIGTERM');
}
process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(1));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not come up`);
}

// ---------------------------------------------------------------- a small DevTools client

let ws;
let nextId = 1;
const pending = new Map();
let session;
/** One DevTools command; fails after 30 s instead of waiting forever. */
function send(method, params = {}, sessionId = session) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method}: no answer from the browser`));
    }, 30_000);
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
      method,
    });
  });
}
async function connect() {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json();
  ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(String(e.data));
    const p = msg.id && pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
    else p.resolve(msg.result);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, undefined);
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }, undefined));
  await send('Page.enable');
  await send('Runtime.enable');
}

async function js(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) throw new Error(`page error: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`);
  return result.value;
}
async function waitFor(expression, ms = 20_000, what = expression) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(expression).catch(() => false)) return;
    await sleep(300);
  }
  // What the page shows instead (this build has only demo values, so the text is safe to print).
  try {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
    await writeFile(join(OUT, 'timeout.jpg'), Buffer.from(data, 'base64'));
    console.error('page text:', JSON.stringify(await js('location.pathname + " | " + document.body.innerText.slice(0, 500)')));
  } catch (error) {
    console.error('no page snapshot:', error instanceof Error ? error.message : error);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const hasText = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;

async function viewport(width, height, scale, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
}
async function goto(path) {
  await send('Page.navigate', { url: APP + path });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#root, [data-testid], body > div')`, 60_000, `page ${path}`);
}
/** Clicks the element with this accessibility label (or exact text), like a mouse would. */
async function click(label) {
  const box = await js(`(() => {
    const want = ${JSON.stringify(label)};
    const all = [...document.querySelectorAll('[aria-label], [role="button"], button')];
    const el = all.find((e) => e.getAttribute('aria-label') === want) ?? all.find((e) => e.innerText?.trim() === want);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) throw new Error(`nothing labelled "${label}"`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
  }
}
async function typeInto(inputIndex, text) {
  await js(`document.querySelectorAll('input')[${inputIndex}].focus()`);
  await send('Input.insertText', { text });
}
async function shot(name) {
  // Images (posters) a moment to load, the focus ring a moment to settle.
  await sleep(1200);
  const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86, captureBeyondViewport: false });
  await writeFile(join(OUT, `${name}.jpg`), Buffer.from(data, 'base64'));
  console.log(`  ${name}.jpg`);
}
/** Opens Plum as if `sentence` had been said, and waits for its answer. */
async function plumSays(sentence, expectText) {
  await js(`window.__plumcastScreenshots = true; window.__plumcastSay(${JSON.stringify(sentence)})`);
  await waitFor(hasText(expectText), 30_000, `Plum answering "${sentence}"`);
  // The later results (archives, sound-alikes) too.
  await waitFor(`!document.body.innerText.includes('Still looking') && !document.body.innerText.includes('Looking…')`, 30_000, 'Plum to finish');
}
async function closePlum() {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
}

// ---------------------------------------------------------------- the shots

async function main() {
  // The whole run gives up after 10 minutes rather than hanging.
  setTimeout(() => {
    console.error('Gave up after 10 minutes');
    process.exit(1);
  }, 10 * 60_000).unref();
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const profile = await mkdtemp(join(tmpdir(), 'plumcast-shots-'));

  // A copy of the project without any .env* file (and without native folders), sharing node_modules.
  const work = await mkdtemp(join(tmpdir(), 'plumcast-shots-app-'));
  const copy = spawnSync('rsync', ['-a', '--exclude', '.env*', '--exclude', 'node_modules', '--exclude', '.git', '--exclude', 'android', '--exclude', 'ios', '--exclude', '.expo', '--exclude', 'dev/screenshots-out', './', `${work}/`]);
  if (copy.status !== 0) throw new Error(`copying the project failed: ${String(copy.stderr)}`);
  // node_modules as hard links (no extra disk space): a symlink would make Expo Router look for
  // the screens in the original project and find none.
  const modules = spawnSync('rsync', ['-a', `--link-dest=${join(process.cwd(), 'node_modules')}`, 'node_modules/', `${join(work, 'node_modules')}/`]);
  if (modules.status !== 0) throw new Error(`linking node_modules failed: ${String(modules.stderr)}`);
  process.on('exit', () => spawnSync('rm', ['-rf', work]));

  console.log('Starting demo server, proxy and app…');
  run('node', ['dev/demo-server.mjs'], 'demo');
  run('node', ['dev/proxy.mjs'], 'proxy');
  run('npx', ['expo', 'start', '--web', '--port', String(APP_PORT)], 'app', work);
  await waitForHttp(`http://127.0.0.1:${DEMO_PORT}/player_api.php?username=demo&password=demo`, 20_000);
  console.log('Waiting for the app build (first time can take a few minutes)…');
  await waitForHttp(APP, 300_000);
  run(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--lang=en-US', '--hide-scrollbars', 'about:blank'], 'chrome');
  await waitForHttp(`http://127.0.0.1:${CDP_PORT}/json/version`, 20_000);
  await connect();

  // TV: the layout is 960 points wide; 5/3 scale gives 1600×900 pixels.
  await viewport(960, 540, 5 / 3, false);

  console.log('Adding the demo playlist…');
  await goto('/playlists/add');
  await waitFor(`[...document.querySelectorAll('input')].some((i) => i.value.includes('${DEMO_PORT}'))`, 120_000, 'the demo login in the form');
  await typeInto(0, 'Demo');
  await click('Save and load');
  await waitFor(hasText('Nordlicht 24') + ' || ' + hasText('Glass Harbour'), 60_000, 'the demo catalog');

  console.log('TV:');
  await goto('/');
  await waitFor(hasText('Glass Harbour'), 30_000, 'home rows');
  await shot('tv-home');
  await goto('/live');
  await waitFor(hasText('Nordlicht 24'), 30_000, 'channels');
  await shot('tv-live');
  await goto('/guide');
  await waitFor(hasText('Evening News') + ' || ' + hasText('Morning Show'), 60_000, 'the guide');
  await shot('tv-guide');
  await goto('/catchup');
  await waitFor(hasText('News'), 30_000, 'catch-up categories');
  await click('News');
  await waitFor(hasText('Nordlicht 24'), 30_000, 'catch-up channels');
  await click('Nordlicht 24');
  await waitFor(hasText('Yesterday'), 30_000, 'replays');
  await shot('tv-catchup');
  await goto('/movies/2000');
  await waitFor(hasText('Glass Harbour'), 30_000, 'the film page');
  await shot('tv-movie');

  await goto('/');
  await waitFor(hasText('Glass Harbour'), 30_000, 'home rows');
  await plumSays('evening news from yesterday', 'Evening News');
  await shot('tv-plum-catchup');
  await closePlum();
  await plumSays('action movies', 'Action');
  await shot('tv-plum-movies');
  await closePlum();

  console.log('Phone:');
  await viewport(390, 844, 2, true);
  await goto('/');
  await waitFor(hasText('Glass Harbour'), 30_000, 'home rows');
  await shot('phone-home');
  await goto('/live');
  await waitFor(hasText('Nordlicht 24'), 30_000, 'channels');
  await shot('phone-live');
  await goto('/');
  await waitFor(hasText('Glass Harbour'), 30_000, 'home rows');
  await plumSays('action movies', 'Action');
  await shot('phone-plum');

  await rm(profile, { recursive: true, force: true });
  console.log(`Done: ${OUT}`);
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    // What the page showed (no field values: they could hold a login).
    try {
      const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
      await writeFile(join(OUT, 'error.jpg'), Buffer.from(data, 'base64'));
      const state = await js(`({ path: location.pathname, inputs: document.querySelectorAll('input').length, demo: [...document.querySelectorAll('input')].some((i) => i.value.includes('${DEMO_PORT}')), text: document.body.innerText.slice(0, 300) })`);
      console.error('page:', JSON.stringify(state));
    } catch {
      // the browser isn't there
    }
    process.exit(1);
  });
