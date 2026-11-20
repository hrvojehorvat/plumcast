# Plumcast: build plan

A "bring your own playlist" IPTV player for Android phones, Android TV and Fire TV.
Goal: feature parity with IPTV Smarters Pro, with its own name and design. Distributed free as a signed APK on GitHub Releases.
The app ships no content and no provider links.

Each phase ends with something you can run and check (first in the browser, later on a device), then stop for review.

## Architecture

```
apps/plumcast/
  src/app/          expo-router screens only (home, live, guide, catchup, movies, series, search, settings, player)
  src/core/         pure TypeScript, no React: Xtream client, M3U parser, XMLTV parser, catch-up URL builders,
                    models, time/offset helpers. Unit-tested with vitest. This is where the bugs would hide.
  src/data/         expo-sqlite: schema, sync (download → store), queries, full-text search; secure-store for passwords
  src/player/       one Player component: react-native-video (Media3) on Android, hls.js / mpegts.js on web
  src/ui/           focusable building blocks (cards, rows, grid, sidebar, dialogs), theme tokens, i18n (EN/DE/HR)
  dev/proxy.mjs     local CORS proxy for browser testing only, never shipped
```

- **Data flow:** login → sync categories and streams into SQLite (with progress) → screens read from SQLite, never directly from the server. That keeps 50k-channel lists fast on a Fire Stick.
- **EPG:**
  - `get_short_epg` per channel, fetched lazily for now/next.
  - Full XMLTV (`xmltv.php` or the M3U `url-tvg`) in the background with a streaming parser, stored for N days.
- **Focus / TV remote:** react-tv-space-navigation. It works the same on Android TV, Fire TV and web, so browser testing also tests D-pad navigation (arrow keys).
- **TV build:** react-native-tvos + `@react-native-tvos/config-tv`. Phone and TV use one codebase and one APK.
- **Design:** dark-first, glass, rounded cards, Inter, plum accent. The tokens are shared with the website (`.theme-purple`).

## Version 1 phases
Version 1 = watch live TV, use the TV guide, watch catch-up, movies and series. Everything else waits for version 1.x.


### 0. Foundation
- Expo SDK 58 + TypeScript + expo-router + react-native-tvos config.
- Lint, typecheck and vitest.
- Theme tokens shared with the site, plus `.theme-purple` in the site CSS.
- i18n for EN/DE/HR.
- Focus navigation library.
- App shell: sidebar on TV/web, bottom tabs on phone, with placeholder screens.
- Dev proxy, with `.env.local` pre-filling the login.
- Root repo: oxlint ignores `apps/`; the web deploy skips changes under `apps/**`.
- **Check:** `npm run web` shows the purple shell and you can move around it with the arrow keys.

### 1. Playlists & account
- Add a playlist:
  - Xtream (name, server, username, password)
  - M3U URL
  - M3U file
- Multiple playlists ("profiles"), switch between them, edit, delete.
- Account info from `user_info`: status, expiry date, active / max connections.
- First sync with a progress screen; manual refresh; optional auto-refresh on start.
- **Check:** log in with your own list in the browser and see the category and channel counts.

### 2. Live TV
- Categories, then channels: logo, number, now/next title with a progress bar.
- Preview pane on TV/web (focus a channel and it plays small), then full screen.
- In the player:
  - channel up/down
  - type a number to switch channels
  - last-channel recall
  - info overlay showing the current programme
- Favorites; hide or reorder categories; recently watched channels.
- **Check:** watch live channels from your list in the browser.

### 3. EPG & TV guide
- Full TV guide grid (channels × time), scrolling across days.
- Programme detail dialog.
- EPG time offset (±hours); 12h/24h time format.
- External XMLTV URL as an override when the provider's EPG is bad.

### 4. Catch-up (replays)
Two ways in, both showing only programmes that really have a replay:
- **From a channel** (Live TV → channel → Catch-up, or a past programme in the TV guide): day picker (archive depth = that channel's `tv_archive_duration` days), then the programme list, then play.
- **Catch-up in the main navigation** (its own menu item / tab): all replayable programmes across all archive channels.
  - Grouped by country / category (the playlist's live categories), then channel, then day and programme.
  - Filter by day ("Today", "Yesterday", …) and a "Recently aired" view (newest first across all channels).
  - Only channels with archive appear (`tv_archive=1` in Xtream, `catchup` attributes in M3U); categories without any archive channel are hidden.
  - A programme is only listed if it already ended, lies within that channel's archive window, and has EPG data. Many channels in a list have no archive, so this is a subset of the guide.
- Archive badge (↺) on channels and on past programmes that can be replayed; past programmes without archive show no badge and can't be played.
- Builds the right URL:
  - Xtream `/timeshift/...`
  - M3U modes: `default`, `append`, `shift`, `flussonic`, `xc`
- Navigation order (TV sidebar): Home, Live TV, Movies, Series, **Catch-up**, TV guide, a thin divider, then Search, Settings (tools, not watching). Phone tab bar: Home, Live, Movies, Series, More (More = Catch-up, TV guide, Search, Settings). TV guide on TV: categories in a left column (moving through them switches the channels on the right after a short pause), ▶ goes to the channels, ▲ from the grid reaches the day chips.
- Data: needs EPG for the archive channels' past days (Xtream `get_simple_data_table` per channel, or the XMLTV feed), stored in SQLite and refreshed in the background.
- Seeking within the programme; "Go live" jumps back to the live channel.
- Verified against your provider.

### 5. Movies (VOD)
- Category rows plus a poster grid; sort by recently added, A–Z or rating.
- Detail page: poster/backdrop, plot, cast, director, year, rating, duration, trailer (opens YouTube).
- Resume from the last position; mark as watched.
- Built-in lists first: Continue watching (started, not finished), Favorites, All movies; then the provider's categories. Search covers the selected list only.
- Position is saved every 10 s and on close (SQLite `progress` table, shared later with series episodes). Counts as watched in the last 4 minutes (credits) or at 95 %. Resume is offered after the first minute.
- Player: ◀/▶ seek in growing steps (10 s → 30 s → 1 min → 5 min), −/+10 min, Start over; a dropped connection retries from the last position.
- Coming back from a movie's page returns to the same list, sort and search, with the focus on that movie.
- Provider quirks seen: years repeated in names ("Heartland (2026) (2026)") and names repeated in director/cast; both are cleaned up. Browsers may not play some MKV/AVI files or AC3 audio; the APK (Media3) does.

### 6. Series
- Series grid, then detail (seasons as tabs), then the episode list with progress.
- Auto-play the next episode with a countdown; resume per episode.
- Shares the movie screen (one catalog component): Continue watching (an episode started, series not finished), Favorites, All series, then the provider's categories; sort New (provider's last update) / A–Z / Rating. The poster shows the next episode ("S1 E2") while a series is in progress.
- Detail page: on TV the left column holds Back, poster, Play/Resume ("Play S1 E2"), Trailer, Favorite and the plot; the right column has season chips (moving the focus over a chip switches season) and the episode list. ▶ on an episode reaches its watched toggle.
- Play picks: the last episode if unfinished (resume after the first minute), else the next one, else the first unwatched, else the first.
- Episode progress lives in the shared `progress` table (kind `episode`); `series_progress` keeps the last episode per series for Continue watching. DB schema v5.
- Episode end: "Next episode in 10 s" card (Play now / Close); the player also has a "Next episode" action. The last episode marks the series finished.
- Seasons come from the `episodes` keys of `get_series_info` (providers' `seasons` list is often empty). Titles like "Show - S01E01 -" are cleaned to nothing, then shown as "Episode 1". M3U: episodes are grouped from `SxxEyy` in the titles and stored at sync (re-sync an M3U playlist once to get them).

### 7. Home, search, favorites, continue watching
- Home screen rows:
  - Continue watching
  - Favorite channels
  - Recently added movies
  - Recently added series
- **Search, two levels:**
  - **Full search** (Search in the menu): across live channels, movies, series and EPG programme titles (including replayable ones), results grouped by type. SQLite full-text search.
  - **Search inside a category:** in Live TV, Movies, Series and Catch-up, the search field searches only the category that's selected (e.g. Movies → "Action", or Catch-up → "Germany"). Smaller set, so results are instant. With "All" selected, it searches that whole section.
  - Search-as-you-type with a short debounce; an on-screen keyboard that works with the TV remote; recent searches.
- Favorites for each type.
- Done as:
  - Home shows the rows above (only those that have items; "Recently updated series", since providers report the last update, not when it was added), then the active playlist card and the other playlists. The remote focus starts on the first row's first card.
  - Full search uses LIKE on folded text (no accents, lower case), not FTS5: the sets are small enough and it matches inside words ("sport" finds "Eurosport"). Up to 40 results per type. The TV guide part covers ±7 days; past programmes appear only if they can be replayed. Order: on now, upcoming (soonest first), past (newest first).
  - DB schema v6: `epg.search` (folded title) and an index on `live (playlist_id, lower(epg_id))`. The programme search uses a CROSS JOIN so SQLite scans the guide once, not once per channel (that took minutes).
  - The keyboard is the system one (Android TV / Fire TV IME), opened with OK on the field; no custom on-screen keyboard.
  - Recent searches (8, newest first) are saved when you press Enter or open a result; they show under the empty field.
  - Home starts with four tiles (Live TV, Movies, Series, Catch-up, with counts); the remote focus starts on Live TV.
  - TV guide download: tries the user's own link first, then the provider's; a refused or failed download is retried twice (after 3 s and 10 s), then again 3 minutes later. A refusal is shown as the provider's hiccup, never "wrong password" (the login works, the channels load). With an older guide stored, it stays visible with a small "update failed" note.

### 8. Basic settings
- Playlists (add, edit, delete, switch), language (EN/DE/HR), EPG time offset, 12h/24h time format, stream format TS or HLS, clear cache, about.
- Done as:
  - Settings order: Playlists, Language, Playback, TV guide (offset, 12h/24h, refresh), Storage, About.
  - Language: "Same as device" (default) or English / Deutsch / Hrvatski; saved in prefs, the whole app switches at once.
  - Stream format: MPEG-TS (default) or HLS for live TV and catch-up URLs. Movies and episodes keep their own file type.
  - Clear cache: deletes the stored TV guide and now/next cache; playlists, favourites and progress stay. There is no image cache of our own to clear (images use the system cache). The guide downloads again next time it is needed.
  - About: app name, version from app.json, and a line that Plumcast contains no channels or content.
  - Remote (all screens): the left menu and every category column (Live TV, Movies, Series, Catch-up, TV guide) open what the focus rests on after 0.3 s, no OK needed; ▶ then goes into it. Moving on before that cancels it, so the page you enter is never swapped out. OK stays for buttons, channels, posters.

### 9. Android, Android TV and Fire TV polish
- Android TV: launcher banner (320×180), Leanback launcher, no touchscreen required.
- App icon and splash.
- Allow plain-http streams.
- Back-button behaviour; focus memory when returning to a screen.
- Performance on 32-bit Fire Sticks (`armeabi-v7a`): virtualized lists, image cache.
- Test on an emulator plus your real devices; local APK build.
- Done as:
  - Icons: real Plumcast icon (chosen from 6 options: a purple plum with a green leaf and a white play mark, on a dark tile; the in-app logo matches) replaces the Expo template: `icon.png`, adaptive icon (gradient background, play mark inside the safe zone, monochrome for themed icons), `favicon.png`. Android TV banner `assets/tv-banner.png` (320×180, mark + wordmark on the dark background) via config-tv `androidTVBanner`. Fire TV takes its banner from the store listing, not the APK.
  - Splash: `expo-splash-screen`, small logo on `#0c0a12`; `expo-system-ui` keeps the root dark (no white flash).
  - Manifest (checked with `expo prebuild`): leanback + touchscreen + faketouch `required=false`, LEANBACK_LAUNCHER, banner, `usesCleartextTraffic=true` (via `expo-build-properties`). Storage permissions blocked (the file picker uses the system picker). Native code only for `armeabi-v7a` + `arm64-v8a`.
  - Back key: player and dialogs first, then detail pages (back to their list); on a main section Back goes Home (phone: the "More" sections go back to More); on Home it leaves the app. Switching sections uses `replace`, so the menu opening pages on focus doesn't fill the history.
  - Media keys: ⏯ / ▶ / ⏸ play-pause, ⏪ / ⏩ seek like ◀/▶, ⏹ closes the player, ⏭ / ⏮ zap like CH+ / CH−. Also on keyboards in the browser.
  - Memory: images decode at their view size (`resizeMethod="resize"`), so huge provider logos and posters don't fill the RAM of a 1 GB Fire Stick. TV lists were already virtualized.
  - `npm run android` is now `expo run:android` (a dev build; Expo Go can't run the TV and video native modules). No local APK yet: not enough free disk for Gradle (~10 GB). The APK comes from Phase 10 (GitHub Actions).

### 10. Release pipeline
- Started early: `.github/workflows/plumcast.yml` builds the APK on every push to the `plumcast` branch (Plumcast changes only) and on `plumcast-v*` tags (+ GitHub Release). Signed with the debug key until the `PLUMCAST_KEYSTORE_*` secrets exist. Still to do: real keystore, versionCode per release.
- GitHub Actions: tag `plumcast-v1.2.3` → prebuild → Gradle release build.
- APK for `arm64-v8a` + `armeabi-v7a`, signed with your keystore (kept in GitHub secrets) → GitHub Release with notes.
- Free: public repo, no EAS needed.

### 11. Project page on mrvoje.com
- `/plumcast` in purple, and a second card on the portfolio.
- Page content:
  - what it is and the features
  - screenshots (phone and TV)
  - a "Download for Android" button pointing to `releases/latest`
  - a Fire TV install guide (the Downloader app)
  - a disclaimer that no content is included

## Version 1.x (after the first release)
- Player extras: audio and subtitle tracks, aspect ratio and zoom, buffer size, User-Agent, hardware/software decoding, sleep timer, external player (VLC, MX), libVLC fallback.
- Multi-screen: 2 or 4 streams at once.
- Parental control: PIN, locked categories, hidden adult categories.
- Full settings and an in-app update check (GitHub Releases API).

## Later
- Chromecast.
- Recording to device storage.
- Stalker / MAC portal login.
- iPhone and Apple TV (needs the $99/year Apple account).
- Amazon Appstore listing (free account).

## Notes
- Test credentials only go in `apps/plumcast/.env.local` (gitignored).
- The signing keystore only goes in GitHub secrets.
- Browser testing quirks:
  - Some codecs (AC3 audio, HEVC) play in the APK but not in the browser. That's expected.
  - SQLite on the web needs special headers, which the dev server sets.

## Phase 0 notes
- `react-tv-space-navigation` is pinned to `6.0.0-beta1`: 5.2.0 bundles React 18's JSX runtime and crashes on React 19 ("ReactCurrentOwner"). Move to 6.0.0 stable when it ships.
- `.npmrc` has `legacy-peer-deps=true` because react-native-tvos versions (`0.88.1-0`) look like pre-releases to npm peer ranges.
