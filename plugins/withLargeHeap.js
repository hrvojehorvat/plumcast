// Movies and replays buffer up to a few minutes ahead (src/player/Video.tsx), and Media3 keeps that buffer
// in the app's Java heap. TVs give an app a small heap by default; largeHeap asks Android for the bigger one.
// The player's memory guard still stops buffering before the heap runs low.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withLargeHeap(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:largeHeap'] = 'true';
    return config;
  });
};
