import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Top padding for a screen's scroll content on Android, where the app draws behind the status bar
 * (edge to edge). iOS needs none: its scroll views move content below the bars themselves
 * (`contentInsetAdjustmentBehavior`) and the modal is a sheet.
 */
export function useAndroidTop(padding = 20) {
  const { top } = useSafeAreaInsets();
  return Platform.OS === "android" ? { paddingTop: padding + top } : null;
}
