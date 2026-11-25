import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useColors } from "@/lib/theme";

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>{children}</View>;
}

export function Button({
  title,
  onPress,
  busy,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "secondary";
}) {
  const colors = useColors();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: colors.accent } : { borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth },
        { opacity: pressed || busy ? 0.7 : 1 },
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? colors.accentFg : colors.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.accentFg : colors.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

/** A row of options, one selected; like iOS's segmented control, in the app's colours. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.card, borderColor: colors.line }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: colors.bg, borderColor: colors.line, borderWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.segmentText, { color: selected ? colors.fg : colors.muted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmented: { flexDirection: "row", borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 2 },
  segment: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8 },
  segmentText: { fontSize: 14, fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  button: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 17, fontWeight: "600" },
});
