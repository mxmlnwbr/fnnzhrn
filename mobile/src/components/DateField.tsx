import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { isoDate, swissDate } from "@/lib/depot";
import { useColors } from "@/lib/theme";

/**
 * A day, picked natively: iOS shows its compact picker in place; Android shows the date as a button
 * that opens Material's calendar dialog.
 */
export function DateField({ value, onChange, maximumDate }: { value: Date; onChange: (date: Date) => void; maximumDate?: Date }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="compact"
        maximumDate={maximumDate}
        accentColor={colors.accent}
        onValueChange={(_, date) => onChange(date)}
      />
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Datum wählen"
        style={({ pressed }) => [styles.button, { backgroundColor: colors.card, borderColor: colors.line, opacity: pressed ? 0.6 : 1 }]}>
        <Text style={[styles.text, { color: colors.fg }]}>{swissDate(isoDate(value))}</Text>
      </Pressable>
      {/* The dialog opens when mounted and is unmounted again once a day is picked or it's dismissed. */}
      {open && (
        <DateTimePicker
          value={value}
          mode="date"
          maximumDate={maximumDate}
          accentColor={colors.accent}
          positiveButton={{ label: "OK" }}
          negativeButton={{ label: "Abbrechen" }}
          onValueChange={(_, date) => {
            setOpen(false);
            onChange(date);
          }}
          onDismiss={() => setOpen(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7 },
  text: { fontSize: 17, fontVariant: ["tabular-nums"] },
});
