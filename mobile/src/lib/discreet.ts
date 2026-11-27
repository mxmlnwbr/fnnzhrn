import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

/** Per-device setting like on the website, so it isn't synced with the account. */
const KEY = "fnnzhrn.discreet";
const listeners = new Set<() => void>();

// Read synchronously at start, so the first screen already hides the amounts.
let current = (() => {
  try {
    return SecureStore.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export function setDiscreet(on: boolean) {
  current = on;
  listeners.forEach((l) => l());
  (on ? SecureStore.setItemAsync(KEY, "1") : SecureStore.deleteItemAsync(KEY)).catch(() => {
    // Not saved; the setting lasts until the app is closed.
  });
}

/**
 * Discreet mode shows percentages instead of amounts, so the app can be shown around without
 * revealing how much money there is. Toggled with the eye on Depot and Finanzen.
 */
export function useDiscreet(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
