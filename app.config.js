// Adds android.versionCode, derived from the version in app.json.
// Android only installs an update with a higher versionCode, so every release must raise it:
// 1.0.0 -> 10000, 1.0.1 -> 10001, 1.2.3 -> 10203. Only change "version" in app.json.

/** major * 10000 + minor * 100 + patch, for plain X.Y.Z versions with minor and patch below 100. */
function versionCode(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!match) throw new Error(`app.json version must look like 1.2.3, got "${version}"`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must be below 100, got "${version}"`);
  return major * 10000 + minor * 100 + patch;
}

module.exports = ({ config }) => ({ ...config, android: { ...config.android, versionCode: versionCode(config.version) } });
module.exports.versionCode = versionCode;
