// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web runs SQLite as WebAssembly in a worker.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

// ...which needs SharedArrayBuffer, so the dev server sends cross-origin isolation headers.
// "credentialless" still lets channel logos and video load from other servers.
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhanced = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    return enhanced(req, res, next);
  };
};

// dev/screenshots.mjs builds against the demo server: its own cache, so neither build reuses the
// other's inlined EXPO_PUBLIC_* values (Metro would otherwise keep the .env.local login baked in).
if (process.env.PLUMCAST_METRO_CACHE) {
  const { FileStore } = require('metro-cache');
  config.cacheStores = [new FileStore({ root: process.env.PLUMCAST_METRO_CACHE })];
}

module.exports = config;
