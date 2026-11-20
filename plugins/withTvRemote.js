// Android TV / Fire TV remote. Two native fixes, both needed for the D-pad to reach JS:
// 1. Android routes key events only down the path of the focused view. The app draws its own focus
//    (react-tv-space-navigation) and has no natively focusable views, so nothing is focused and React
//    Native never sees a key. MainActivity now gives the React root view focus whenever nothing has it.
// 2. react-native-tvos sends only key-up events by default; key-down events are switched on in
//    MainApplication.onCreate so a press reacts at once. src/core/tvKeys.ts counts each press once.
const { withMainActivity, withMainApplication } = require('expo/config-plugins');

const KEY_DOWN = 'com.facebook.react.config.ReactFeatureFlags.enableKeyDownEvents = true';
const MARK = '// Plumcast: keep the React root focused';
const ACTIVITY_CODE = `
  ${MARK} so remote keys reach React Native (see plugins/withTvRemote.js).
  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (currentFocus == null) {
      findReactRoot(window.decorView)?.let {
        it.isFocusable = true
        it.isFocusableInTouchMode = true
        // No grey system highlight over the whole screen; the app draws its own focus.
        if (android.os.Build.VERSION.SDK_INT >= 26) it.defaultFocusHighlightEnabled = false
        it.requestFocus()
      }
    }
    return super.dispatchKeyEvent(event)
  }

  private fun findReactRoot(view: android.view.View): android.view.View? {
    if (view is com.facebook.react.ReactRootView) return view
    if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) findReactRoot(view.getChildAt(i))?.let { return it }
    }
    return null
  }
`;

function requireKotlin(mod, name) {
  if (mod.modResults.language !== 'kt') throw new Error(`withTvRemote: expected ${name}.kt`);
}

module.exports = function withTvRemote(config) {
  config = withMainApplication(config, (mod) => {
    requireKotlin(mod, 'MainApplication');
    const src = mod.modResults.contents;
    if (src.includes(KEY_DOWN)) return mod;
    const next = src.replace(/(override fun onCreate\(\)\s*\{\s*\n\s*super\.onCreate\(\)\s*\n)/, `$1    ${KEY_DOWN}\n`);
    if (next === src) throw new Error('withTvRemote: onCreate() not found in MainApplication.kt');
    mod.modResults.contents = next;
    return mod;
  });
  return withMainActivity(config, (mod) => {
    requireKotlin(mod, 'MainActivity');
    const src = mod.modResults.contents;
    if (src.includes(MARK)) return mod;
    const end = src.lastIndexOf('}');
    if (end < 0) throw new Error('withTvRemote: MainActivity class not found');
    mod.modResults.contents = src.slice(0, end) + ACTIVITY_CODE + src.slice(end);
    return mod;
  });
};
