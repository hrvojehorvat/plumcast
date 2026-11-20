// Android TV / Fire TV remote: the app draws its own focus (react-tv-space-navigation), so Android's own
// focus system must stay out of the way. Native changes:
//
// 1. MainApplication: react-native-tvos sends only key-up events by default; key-down events are switched on
//    so a press reacts at once (src/core/tvKeys.ts counts each press once).
//
// 2. MainActivity, on TVs only (phones keep Android's default handling):
//    - The React root view always holds Android's focus. Android routes keys only down the focused view's
//      path; with nothing focused React Native never sees a key.
//    - Remote keys (arrows, OK, media, channel, digits) go straight to the React root and are always
//      consumed. Otherwise Android would also run its own handling: move its focus to the nearest native
//      focusable view (buttons, scroll views, text fields: a second focus, and a focused text field locks
//      the app's navigation), scroll lists by itself, or click a button natively (a second action per OK).
//    - Typing: while a text field has focus, keys go to it and the keyboard as usual. Once the keyboard is
//      closed, an arrow or Back leaves the field (it would otherwise keep the navigation locked).
//    Back, Home, volume and power keep Android's handling (Back reaches JS through BackHandler).
const { withMainActivity, withMainApplication } = require('expo/config-plugins');

const KEY_DOWN = 'com.facebook.react.config.ReactFeatureFlags.enableKeyDownEvents = true';
const MARK = '// Plumcast TV remote';
const ACTIVITY_CODE = `
  ${MARK} (see plugins/withTvRemote.js).
  private val plumcastIsTv: Boolean by lazy {
    val ui = getSystemService(android.content.Context.UI_MODE_SERVICE) as? android.app.UiModeManager
    ui?.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION ||
      packageManager.hasSystemFeature("android.software.leanback") ||
      packageManager.hasSystemFeature("amazon.hardware.fire_tv")
  }
  private var plumcastRoot: java.lang.ref.WeakReference<android.view.View>? = null

  private fun plumcastFindRoot(view: android.view.View): android.view.View? {
    if (view is com.facebook.react.ReactRootView) return view
    if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) plumcastFindRoot(view.getChildAt(i))?.let { return it }
    }
    return null
  }

  /** The React root view, made able to hold focus (without the grey system highlight). */
  private fun plumcastReactRoot(): android.view.View? {
    plumcastRoot?.get()?.let { if (it.isAttachedToWindow) return it }
    val root = plumcastFindRoot(window.decorView) ?: return null
    root.isFocusable = true
    root.isFocusableInTouchMode = true
    if (android.os.Build.VERSION.SDK_INT >= 26) root.defaultFocusHighlightEnabled = false
    plumcastRoot = java.lang.ref.WeakReference(root)
    return root
  }

  private fun plumcastIsRemoteKey(code: Int): Boolean = when (code) {
    android.view.KeyEvent.KEYCODE_DPAD_UP, android.view.KeyEvent.KEYCODE_DPAD_DOWN,
    android.view.KeyEvent.KEYCODE_DPAD_LEFT, android.view.KeyEvent.KEYCODE_DPAD_RIGHT,
    android.view.KeyEvent.KEYCODE_DPAD_UP_LEFT, android.view.KeyEvent.KEYCODE_DPAD_UP_RIGHT,
    android.view.KeyEvent.KEYCODE_DPAD_DOWN_LEFT, android.view.KeyEvent.KEYCODE_DPAD_DOWN_RIGHT,
    android.view.KeyEvent.KEYCODE_DPAD_CENTER, android.view.KeyEvent.KEYCODE_ENTER,
    android.view.KeyEvent.KEYCODE_NUMPAD_ENTER, android.view.KeyEvent.KEYCODE_BUTTON_SELECT,
    android.view.KeyEvent.KEYCODE_BUTTON_A,
    android.view.KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, android.view.KeyEvent.KEYCODE_MEDIA_PLAY,
    android.view.KeyEvent.KEYCODE_MEDIA_PAUSE, android.view.KeyEvent.KEYCODE_MEDIA_STOP,
    android.view.KeyEvent.KEYCODE_MEDIA_REWIND, android.view.KeyEvent.KEYCODE_MEDIA_FAST_FORWARD,
    android.view.KeyEvent.KEYCODE_MEDIA_NEXT, android.view.KeyEvent.KEYCODE_MEDIA_PREVIOUS,
    android.view.KeyEvent.KEYCODE_CHANNEL_UP, android.view.KeyEvent.KEYCODE_CHANNEL_DOWN,
    android.view.KeyEvent.KEYCODE_PAGE_UP, android.view.KeyEvent.KEYCODE_PAGE_DOWN,
    android.view.KeyEvent.KEYCODE_INFO, android.view.KeyEvent.KEYCODE_MENU -> true
    else -> code >= android.view.KeyEvent.KEYCODE_0 && code <= android.view.KeyEvent.KEYCODE_9
  }

  private fun plumcastIsArrow(code: Int): Boolean =
    code == android.view.KeyEvent.KEYCODE_DPAD_UP || code == android.view.KeyEvent.KEYCODE_DPAD_DOWN ||
      code == android.view.KeyEvent.KEYCODE_DPAD_LEFT || code == android.view.KeyEvent.KEYCODE_DPAD_RIGHT

  /** Ends typing: closes the keyboard and gives focus back to the React root (the field blurs in JS). */
  private fun plumcastLeaveField(field: android.view.View, root: android.view.View) {
    val ime = getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as? android.view.inputmethod.InputMethodManager
    ime?.hideSoftInputFromWindow(field.windowToken, 0)
    root.requestFocus()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (!hasFocus || !plumcastIsTv) return
    val root = plumcastReactRoot() ?: return
    val focused = currentFocus
    if (focused !== root && focused !is android.widget.EditText) root.requestFocus()
  }

  override fun dispatchKeyEvent(event: android.view.KeyEvent): Boolean {
    if (!plumcastIsTv) return super.dispatchKeyEvent(event)
    val root = plumcastReactRoot() ?: return super.dispatchKeyEvent(event)
    val code = event.keyCode
    val focused = currentFocus

    if (focused is android.widget.EditText) {
      // Typing (keys the open keyboard doesn't use land here too). With the keyboard closed, an arrow or
      // Back leaves the field; OK / Enter reopen the keyboard or submit, as usual.
      if (plumcastIsArrow(code)) {
        if (event.action == android.view.KeyEvent.ACTION_DOWN) plumcastLeaveField(focused, root)
        return true
      }
      if (code == android.view.KeyEvent.KEYCODE_BACK) {
        if (event.action == android.view.KeyEvent.ACTION_UP) plumcastLeaveField(focused, root)
        return true
      }
      return super.dispatchKeyEvent(event)
    }

    if (!plumcastIsRemoteKey(code)) return super.dispatchKeyEvent(event)
    if (focused !== root) root.requestFocus()
    if (event.action == android.view.KeyEvent.ACTION_DOWN && event.repeatCount == 0) onUserInteraction()
    root.dispatchKeyEvent(event)
    return true
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
    if (/fun (dispatchKeyEvent|onWindowFocusChanged)\(/.test(src)) throw new Error('withTvRemote: MainActivity already overrides key or focus handling');
    const end = src.lastIndexOf('}');
    if (end < 0) throw new Error('withTvRemote: MainActivity class not found');
    mod.modResults.contents = src.slice(0, end) + ACTIVITY_CODE + src.slice(end);
    return mod;
  });
};
