// Plum (voice) needs RECORD_AUDIO, and Android then assumes the app needs a microphone in the device.
// TV boxes and sticks have none (the mic is in the remote), and app stores would hide the app there.
// This marks the microphone as optional; without one, Plum simply stays hidden (src/voice/useSpeech.ts).
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.microphone';

module.exports = function withMicrophoneOptional(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const features = (manifest['uses-feature'] = manifest['uses-feature'] ?? []);
    const existing = features.find((f) => f.$?.['android:name'] === FEATURE);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    return config;
  });
};
