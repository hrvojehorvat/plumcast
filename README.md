# Plumcast

A "bring your own playlist" IPTV player for Android phones, Android TV and Amazon Fire TV.
Live TV with a TV guide, catch-up (replays), movies and series, built for the TV remote first.
No account, no tracking.

**Download:** [plumcast.mrvoje.com](https://plumcast.mrvoje.com) or the [latest release](https://github.com/hrvojehorvat/plumcast/releases/latest) (`plumcast.apk`).

Plumcast is a player only: it ships no channels, playlists or content. Use it with a playlist you are entitled to (Xtream Codes login or an M3U link/file).

## Develop

Node 24.

```sh
npm install
npm run demo     # fake Xtream server on :8790 (user/password: demo)
npm run web      # Expo web in the browser
npm test && npm run lint && npm run typecheck
```

Releases: tag `vX.Y.Z` (equal to the version in `app.json`); GitHub Actions builds the signed APK.
