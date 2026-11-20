// Demo Xtream server with made-up channels, films and series. Development only: never shipped or deployed.
//
// Used for screenshots (the /plumcast project page) and for trying the app without a provider.
// Everything is invented: names, programmes, posters (generated SVGs). There are no streams; playback fails.
// Run: npm run demo  →  in the app add an Xtream playlist with server http://127.0.0.1:8790, user demo, password demo.
import { createServer } from 'node:http';

const port = Number(process.env.DEMO_PORT || 8790);
const origin = `http://127.0.0.1:${port}`;

// ---------------------------------------------------------------- Content (all invented)

const LIVE_CATS = ['News', 'Sport', 'Movies & Series', 'Documentary', 'Kids', 'Music'];
const CHANNELS = [
  ['Nordlicht 24', 0], ['Alpen Info', 0], ['City Report', 0], ['World Desk', 0], ['Morning Wire', 0],
  ['Arena One', 1], ['Arena Two', 1], ['Goal TV', 1], ['Court Side', 1], ['Peak Motor', 1],
  ['Velvet Cinema', 2], ['Plot Twist', 2], ['Rerun Classics', 2], ['Noir Night', 2], ['Saga Channel', 2],
  ['Planet Wild', 3], ['Deep Blue', 3], ['History Lane', 3], ['Makers', 3],
  ['Tiny Tales', 4], ['Cartoon Cove', 4], ['Little Lab', 4],
  ['Vinyl', 5], ['Bassline', 5], ['Acoustic Room', 5],
];
const SHOWS = [
  ['Evening News', 'The day in one hour: politics, business, weather.'],
  ['Weather Outlook', 'Rain in the north, sun in the south, wind everywhere.'],
  ['Live: Cup Final', 'Both teams unbeaten this season. Who blinks first?'],
  ['Match Highlights', 'Every goal of the weekend in thirty minutes.'],
  ['The Long Road', 'A truck driver crosses three countries in two days.'],
  ['Night Shift', 'Season 2. The hospital has a new head of surgery.'],
  ['Wild Coasts', 'Seals, storms and the birds that live between them.'],
  ['Under the Ice', 'Divers explore a lake that has been frozen for centuries.'],
  ['Kitchen Duel', 'Two chefs, one basket, forty minutes.'],
  ['Morning Show', 'News, guests and the best coffee in the building.'],
  ['Classic Film: Harbour Lights', 'A lighthouse keeper finds a message in a bottle.'],
  ['Studio Sessions', 'Live music from the small studio.'],
  ['Little Explorers', 'Mia and Bo build a raft.'],
  ['Talk at Ten', 'Three guests, one topic, no script.'],
  ['Motor Weekly', 'New cars, old roads.'],
  ['Cities at Night', 'What happens after the last tram.'],
];
const MOVIE_CATS = ['New releases', 'Action', 'Drama', 'Comedy', 'Documentary', 'Family'];
const MOVIES = [
  'Glass Harbour', 'The Quiet Signal', 'North of Nowhere', 'Paper Moons', 'Last Train to Lindau', 'Red Meridian',
  'The Orchard', 'Seven Bridges', 'Cold Open', 'Afterglow', 'The Cartographer', 'Small Hours',
  'Iron Coast', 'Velvet Rope', 'Lantern Season', 'Blue Hour', 'The Long Table', 'Falling Upward',
  'Static', 'High Water', 'The Understudy', 'Wild Plum', 'Midnight Ferry', 'Snowline',
];
const SERIES_CATS = ['Drama', 'Crime', 'Comedy', 'Documentary'];
const SERIES = [
  'Harbour Street', 'The Fifth Floor', 'Border Town', 'Kitchen Brigade', 'Night Shift', 'Grey Matter',
  'Valley Days', 'The Archive', 'Signal Lost', 'Little Big Town', 'Coastline', 'Cold Case Unit',
];

// ---------------------------------------------------------------- Helpers

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);

function poster(title, wide = false) {
  const h = hue(title);
  const [w, ht] = wide ? [1280, 720] : [400, 600];
  const words = title.split(' ');
  const lines = [];
  for (const word of words) {
    const lastLine = lines[lines.length - 1];
    if (lastLine && (lastLine + ' ' + word).length <= 12) lines[lines.length - 1] = lastLine + ' ' + word;
    else lines.push(word);
  }
  const size = wide ? 64 : 44;
  const y0 = ht * 0.72 - (lines.length - 1) * size * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,42%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},60%,14%)"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<circle cx="${w * 0.72}" cy="${ht * 0.3}" r="${Math.min(w, ht) * 0.22}" fill="hsl(${(h + 20) % 360},70%,70%)" opacity="0.35"/>
<circle cx="${w * 0.3}" cy="${ht * 0.42}" r="${Math.min(w, ht) * 0.12}" fill="#fff" opacity="0.12"/>
${wide ? '' : lines.map((l, i) => `<text x="${w / 2}" y="${y0 + i * size * 1.15}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#fff" text-anchor="middle">${esc(l)}</text>`).join('\n')}
</svg>`;
}

function logo(name) {
  const h = hue(name);
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
<rect width="160" height="160" rx="36" fill="hsl(${h},55%,45%)"/>
<text x="80" y="100" font-family="Helvetica, Arial, sans-serif" font-size="62" font-weight="800" fill="#fff" text-anchor="middle">${esc(initials)}</text>
</svg>`;
}

/** Programmes of a channel: 30–90 min slots from 7 days ago to 2 days ahead, fixed per channel. */
function schedule(channelIndex) {
  const start = Math.floor(now() / HOUR) * HOUR - 7 * 24 * HOUR;
  const end = start + 9 * 24 * HOUR;
  const out = [];
  let t = start;
  let i = channelIndex * 5;
  while (t < end) {
    const len = [30, 45, 60, 60, 90][(i * 7 + channelIndex) % 5] * 60;
    const [title, description] = SHOWS[(i + channelIndex) % SHOWS.length];
    out.push({ start: t, stop: t + len, title, description });
    t += len;
    i += 1;
  }
  return out;
}

const live = CHANNELS.map(([name, cat], i) => ({
  num: i + 1, name, stream_type: 'live', stream_id: 1000 + i, stream_icon: `${origin}/img/logo/${i}.svg`,
  epg_channel_id: `demo.${i}`, added: '1700000000', category_id: String(cat + 1),
  tv_archive: i % 3 === 2 ? 0 : 1, tv_archive_duration: 7,
}));
const movies = MOVIES.map((name, i) => ({
  num: i + 1, name, stream_type: 'movie', stream_id: 2000 + i, stream_icon: `${origin}/img/poster/m${i}.svg`,
  rating: (6 + ((i * 7) % 30) / 10).toFixed(1), added: String(now() - i * 86400 * 3), category_id: String((i % MOVIE_CATS.length) + 1),
  container_extension: 'mp4',
}));
const series = SERIES.map((name, i) => ({
  num: i + 1, name, series_id: 3000 + i, cover: `${origin}/img/poster/s${i}.svg`, plot: `${name}: an invented series for the Plumcast demo.`,
  rating: (7 + ((i * 3) % 25) / 10).toFixed(1), releaseDate: `${2018 + (i % 7)}-03-01`, last_modified: String(now() - i * 86400),
  category_id: String((i % SERIES_CATS.length) + 1),
}));

function vodInfo(id) {
  const i = id - 2000;
  const name = MOVIES[i] ?? 'Unknown';
  return {
    info: {
      plot: `${name} is an invented film made up for the Plumcast demo. No such film exists; the poster is generated.`,
      cast: 'Ada Brenner, Luka Novak, Mira Hollis', director: 'Jonas Feld', genre: ['Drama', 'Thriller', 'Comedy'][i % 3],
      country: 'Austria', releasedate: `${2016 + (i % 9)}-05-12`, rating: movies[i]?.rating, duration_secs: 5400 + i * 240,
      movie_image: `${origin}/img/poster/m${i}.svg`, backdrop_path: [`${origin}/img/backdrop/m${i}.svg`],
    },
    movie_data: { stream_id: id, name, container_extension: 'mp4' },
  };
}

function seriesInfo(id) {
  const i = id - 3000;
  const name = SERIES[i] ?? 'Unknown';
  const episodes = {};
  for (let s = 1; s <= 2 + (i % 2); s++) {
    episodes[s] = Array.from({ length: 6 }, (_, e) => ({
      id: String(40000 + i * 100 + s * 10 + e), episode_num: e + 1, season: s, container_extension: 'mp4',
      title: `${name} - S0${s}E0${e + 1} - ${['Arrival', 'Old Friends', 'The Key', 'Low Tide', 'Crossing', 'Home'][e]}`,
      info: { plot: 'An invented episode for the Plumcast demo.', duration_secs: 2700, movie_image: `${origin}/img/backdrop/s${i}e${e}.svg` },
    }));
  }
  return {
    info: {
      name, plot: series[i]?.plot, cast: 'Nora Lind, Tomas Ried, Eva Kral', director: 'Sanja Petrov', genre: SERIES_CATS[i % 4],
      releaseDate: series[i]?.releaseDate, rating: series[i]?.rating, cover: `${origin}/img/poster/s${i}.svg`,
      backdrop_path: [`${origin}/img/backdrop/s${i}.svg`],
    },
    seasons: [],
    episodes,
  };
}

function epgJson(streamId, all) {
  const i = streamId - 1000;
  const t = now();
  const list = schedule(i).filter((p) => (all ? true : p.stop > t)).slice(0, all ? undefined : 8);
  return {
    epg_listings: list.map((p, n) => ({
      id: String(n), epg_id: `demo.${i}`, title: b64(p.title), description: b64(p.description), lang: 'en',
      start_timestamp: String(p.start), stop_timestamp: String(p.stop), now_playing: p.start <= t && t < p.stop ? 1 : 0,
      has_archive: live[i]?.tv_archive && p.stop <= t ? 1 : 0,
    })),
  };
}

function xmltv() {
  const fmt = (s) => new Date(s * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>', '<tv generator-info-name="plumcast-demo">'];
  CHANNELS.forEach(([name], i) => parts.push(`<channel id="demo.${i}"><display-name>${esc(name)}</display-name></channel>`));
  const from = now() - 26 * HOUR;
  const to = now() + 26 * HOUR;
  CHANNELS.forEach((_, i) => {
    for (const p of schedule(i)) {
      if (p.stop < from || p.start > to) continue;
      parts.push(`<programme start="${fmt(p.start)}" stop="${fmt(p.stop)}" channel="demo.${i}"><title>${esc(p.title)}</title><desc>${esc(p.description)}</desc></programme>`);
    }
  });
  parts.push('</tv>');
  return parts.join('\n');
}

const cats = (names) => names.map((category_name, i) => ({ category_id: String(i + 1), category_name, parent_id: 0 }));

function api(q) {
  switch (q.get('action')) {
    case null:
      return {
        user_info: { auth: 1, status: 'Active', exp_date: String(now() + 365 * 86400), is_trial: '0', active_cons: '0', max_connections: '2', allowed_output_formats: ['m3u8', 'ts'] },
        server_info: { timezone: 'Europe/Vienna', url: '127.0.0.1', port: String(port) },
      };
    case 'get_live_categories': return cats(LIVE_CATS);
    case 'get_live_streams': return live;
    case 'get_vod_categories': return cats(MOVIE_CATS);
    case 'get_vod_streams': return movies;
    case 'get_series_categories': return cats(SERIES_CATS);
    case 'get_series': return series;
    case 'get_vod_info': return vodInfo(Number(q.get('vod_id')));
    case 'get_series_info': return seriesInfo(Number(q.get('series_id')));
    case 'get_short_epg': return epgJson(Number(q.get('stream_id')), false);
    case 'get_simple_data_table': return epgJson(Number(q.get('stream_id')), true);
    default: return [];
  }
}

// ---------------------------------------------------------------- Server

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url ?? '/', origin);
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  const img = /^\/img\/(logo|poster|backdrop)\/([a-z]?)(\d+)(?:e\d+)?\.svg$/.exec(url.pathname);
  if (img) {
    const [, kind, prefix, n] = img;
    const i = Number(n);
    if (kind === 'logo') return send(200, 'image/svg+xml', logo(CHANNELS[i]?.[0] ?? '?'));
    const title = (prefix === 's' ? SERIES[i] : MOVIES[i]) ?? '?';
    return send(200, 'image/svg+xml', poster(title, kind === 'backdrop'));
  }
  if (url.pathname === '/player_api.php') return send(200, 'application/json', JSON.stringify(api(url.searchParams)));
  if (url.pathname === '/xmltv.php') return send(200, 'application/xml', xmltv());
  send(404, 'text/plain', 'Plumcast demo server: no streams here.');
}).listen(port, '127.0.0.1', () => console.log(`Plumcast demo server on ${origin} (user demo, password demo)`));
