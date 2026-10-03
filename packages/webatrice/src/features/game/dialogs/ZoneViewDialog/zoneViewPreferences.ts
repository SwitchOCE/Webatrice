/**
 * The library view's "shuffle when closing" choice, remembered across
 * sessions like desktop's SettingsCache (view_zone_widget.cpp:161-163). On by
 * default, as on desktop. Read when a view closes without an explicit answer
 * (Esc), so every close path honours the box the user last ticked.
 */
const SHUFFLE_ON_CLOSE_STORAGE_KEY = 'webatrice.searchLibraryShuffleOnClose';

export function readShuffleOnClose(): boolean {
  try {
    return window.localStorage.getItem(SHUFFLE_ON_CLOSE_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeShuffleOnClose(value: boolean): void {
  try {
    window.localStorage.setItem(SHUFFLE_ON_CLOSE_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Storage disabled or full: the choice holds for this view only.
  }
}
