// Android TV / Fire TV: react-native-tvos sends only key-up events for the remote by default, so every press
// would react only on release. This switches key-down events on (ReactFeatureFlags.enableKeyDownEvents) in
// MainApplication.onCreate; src/core/tvKeys.ts then counts each press once.
const { withMainApplication } = require('expo/config-plugins');

const LINE = 'com.facebook.react.config.ReactFeatureFlags.enableKeyDownEvents = true';

module.exports = function withTvKeyDown(config) {
  return withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kt') throw new Error('withTvKeyDown: expected MainApplication.kt');
    let src = mod.modResults.contents;
    if (!src.includes(LINE)) {
      const next = src.replace(/(override fun onCreate\(\)\s*\{\s*\n\s*super\.onCreate\(\)\s*\n)/, `$1    ${LINE}\n`);
      if (next === src) throw new Error('withTvKeyDown: onCreate() not found in MainApplication.kt');
      src = next;
    }
    mod.modResults.contents = src;
    return mod;
  });
};
