// Browser AppState does not have native focus/blur events. Fail closed when a
// protected screen is hidden or the window loses focus, including before mount.
export function isCommunityWindowFocused(platform, doc = globalThis.document) {
  return platform !== 'web' || (
    doc?.visibilityState === 'visible' && typeof doc.hasFocus === 'function' && doc.hasFocus()
  );
}

export function observeCommunityWindowFocus(
  platform, appState, onBlur, onFocus,
  win = globalThis.window, doc = globalThis.document,
) {
  if (platform !== 'web') {
    const blur = appState.addEventListener('blur', onBlur);
    const focus = appState.addEventListener('focus', onFocus);
    return () => { blur.remove(); focus.remove(); };
  }

  if (!win || !doc) { onBlur(); return () => {}; }

  let previous;
  const emit = focused => {
    if (focused === previous) return;
    previous = focused;
    if (focused) onFocus(); else onBlur();
  };
  const blur = () => emit(false);
  const reassess = () => emit(isCommunityWindowFocused('web', doc));
  win.addEventListener('blur', blur);
  win.addEventListener('focus', reassess);
  doc.addEventListener('visibilitychange', reassess);
  reassess();
  return () => {
    win.removeEventListener('blur', blur);
    win.removeEventListener('focus', reassess);
    doc.removeEventListener('visibilitychange', reassess);
  };
}
