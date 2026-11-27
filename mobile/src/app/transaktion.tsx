import { parseAmount } from "@core/budget";
import { BASE_CURRENCIES } from "@core/currency";
import { ALL_DEPOTS_ID } from "@core/sync";
import type { DepotStore, TransactionType } from "@core/types";
import { router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
  type ViewStyle,
} from "react-native";

import { DateField } from "@/components/DateField";
import { Button, Card, Segmented } from "@/components/ui";
import { ApiError, getJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { addTransaction, isoDate, loadStore, newId } from "@/lib/depot";
import { useColors, type Palette } from "@/lib/theme";
import { useAndroidTop } from "@/lib/insets";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "buy", label: "Kauf" },
  { value: "sell", label: "Verkauf" },
  { value: "dividend", label: "Dividende" },
  { value: "fee", label: "Gebühr" },
];

const SUBMIT: Record<TransactionType, string> = {
  buy: "Kauf erfassen",
  sell: "Verkauf erfassen",
  dividend: "Dividende erfassen",
  fee: "Depotgebühr erfassen",
};

/**
 * Adds a transaction to a depot, like the form on fnnzhrn.ch: a buy, sell, dividend or custody fee.
 * Opened from the Depot tab with the depot shown there (`?depot=`); with several depots and "Alle
 * Depots" shown, it asks which one.
 */
export default function TransactionScreen() {
  const colors = useColors();
  const top = useAndroidTop();
  const params = useLocalSearchParams<{ depot?: string }>();
  const [store, setStore] = useState<DepotStore | null>(null);
  const [depotId, setDepotId] = useState(params.depot && params.depot !== ALL_DEPOTS_ID ? params.depot : "");
  const [type, setType] = useState<TransactionType>("buy");
  const [symbol, setSymbol] = useState("");
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [date, setDate] = useState(() => new Date());
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [feeCurrency, setFeeCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceRef = useRef<TextInputInstance>(null);

  useEffect(() => {
    loadStore()
      .then((s) => {
        setStore(s);
        setDepotId((id) => (s.depots.some((d) => d.id === id) ? id : s.depots.length === 1 ? s.depots[0].id : ""));
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  // Search Yahoo as on the website, once typing pauses; not after a result was picked.
  useEffect(() => {
    const q = symbol.trim();
    if (q.length < 2 || picked?.symbol === q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      getJson<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => !cancelled && Array.isArray(r) && setResults(r))
        .catch(() => {});
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [symbol, picked]);

  const depot = store?.depots.find((d) => d.id === depotId);
  const base = depot?.data.settings.baseCurrency ?? "CHF";
  const currency = feeCurrency || base;
  const isDividend = type === "dividend";
  const isFee = type === "fee";
  const amount = parseAmount(price);
  const count = parseAmount(quantity);
  const amountOk = isDividend || isFee ? amount > 0 : price.trim() !== "" && amount >= 0;
  const valid = !!depot && amountOk && (isFee || (symbol.trim() !== "" && (isDividend || count > 0)));

  async function save() {
    if (!valid || !depot) return;
    setBusy(true);
    setError(null);
    const day = isoDate(date);
    try {
      await addTransaction(
        depot.id,
        isFee
          ? { id: newId(), symbol: "", type, date: day, quantity: 0, price: amount, fees: 0, currency }
          : {
              id: newId(),
              symbol: symbol.trim().toUpperCase(),
              type,
              date: day,
              quantity: isDividend ? 0 : count,
              price: amount,
              fees: parseAmount(fees) || 0,
            },
      );
      router.back();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      if (e instanceof ApiError && e.status === 401) authClient.signOut();
    }
  }

  const input = [styles.input, { color: colors.fg, backgroundColor: colors.bg, borderColor: colors.line }];
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={[styles.body, top]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.fg }]}>Transaktion erfassen</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
          <Text style={[styles.cancel, { color: colors.accent }]}>Abbrechen</Text>
        </Pressable>
      </View>

      {error && (
        <Card style={{ borderColor: colors.down }}>
          <Text style={{ color: colors.down, fontSize: 15 }}>{error}</Text>
        </Card>
      )}

      {!store ? (
        !error && <ActivityIndicator style={styles.loading} color={colors.muted} />
      ) : (
        <>
          {store.depots.length > 1 && (
            <Field label="Depot" colors={colors}>
              <Chips
                options={store.depots.map((d) => ({ value: d.id, label: d.name }))}
                value={depotId}
                onChange={setDepotId}
                colors={colors}
              />
            </Field>
          )}

          <Segmented options={TYPES} value={type} onChange={setType} />

          {!isFee && (
            <Field label="Aktie, ETF oder Fonds" colors={colors}>
              <TextInput
                style={input}
                placeholder="Name oder Ticker, z. B. Nestlé oder AAPL"
                placeholderTextColor={colors.muted}
                value={symbol}
                onChangeText={(t) => {
                  setSymbol(t);
                  setPicked(null);
                }}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
              />
              {picked && <Text style={[styles.hint, { color: colors.muted }]}>{picked.name}</Text>}
              {results.length > 0 && (
                <Card style={styles.results}>
                  {results.map((r, i) => (
                    <Pressable
                      key={r.symbol}
                      onPress={() => {
                        setPicked(r);
                        setSymbol(r.symbol);
                        setResults([]);
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.result,
                        i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
                        pressed && { opacity: 0.6 },
                      ]}>
                      <View style={styles.resultText}>
                        <Text style={[styles.resultSymbol, { color: colors.fg }]}>{r.symbol}</Text>
                        <Text style={[styles.hint, { color: colors.muted }]} numberOfLines={1}>
                          {r.name}
                        </Text>
                      </View>
                      <Text style={[styles.hint, { color: colors.muted }]}>{r.exchange}</Text>
                    </Pressable>
                  ))}
                </Card>
              )}
            </Field>
          )}

          <View style={styles.dateRow}>
            <Text style={[styles.label, { color: colors.muted }]}>Datum</Text>
            <DateField value={date} onChange={setDate} maximumDate={new Date()} />
          </View>

          <View style={styles.row}>
            {!isDividend && !isFee && (
              <Field label="Anzahl" colors={colors} style={styles.flex}>
                <TextInput
                  style={[input, styles.number]}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={quantity}
                  onChangeText={setQuantity}
                  onSubmitEditing={() => priceRef.current?.focus()}
                />
              </Field>
            )}
            <Field label={isDividend || isFee ? "Gesamtbetrag" : "Kurs pro Stück"} colors={colors} style={styles.flex}>
              <TextInput
                ref={priceRef}
                style={[input, styles.number]}
                placeholder="0.00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                value={price}
                onChangeText={setPrice}
              />
            </Field>
            {!isFee && (
              <Field label={isDividend ? "Verrechnungssteuer" : "Gebühren"} colors={colors} style={styles.flex}>
                <TextInput
                  style={[input, styles.number]}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={fees}
                  onChangeText={setFees}
                />
              </Field>
            )}
          </View>

          {isFee && (
            <Field label="Währung" colors={colors}>
              <Chips
                options={BASE_CURRENCIES.map((c) => ({ value: c, label: c }))}
                value={currency}
                onChange={setFeeCurrency}
                colors={colors}
              />
            </Field>
          )}

          <Text style={[styles.hint, { color: colors.muted }]}>
            {isFee
              ? "Was die Bank für das Depot verrechnet hat, z. B. die jährliche Depotgebühr."
              : "Beträge in der Handelswährung der Aktie."}
          </Text>

          {!depot && store.depots.length > 1 && (
            <Text style={[styles.hint, { color: colors.warn }]}>Wähle oben das Depot.</Text>
          )}
          <View style={{ opacity: valid ? 1 : 0.5 }} pointerEvents={valid ? "auto" : "none"}>
            <Button title={SUBMIT[type]} onPress={save} busy={busy} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  colors,
  style,
  children,
}: {
  label: string;
  colors: Palette;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Chips({
  options,
  value,
  onChange,
  colors,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  colors: Palette;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : { borderColor: colors.line }]}>
            <Text style={[styles.chipText, { color: selected ? colors.accent : colors.fg }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 60 },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  title: { fontSize: 24, fontWeight: "700", flexShrink: 1 },
  cancel: { fontSize: 17 },
  loading: { marginTop: 40 },
  field: { gap: 6 },
  label: { fontSize: 13 },
  hint: { fontSize: 13 },
  input: { height: 46, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 17 },
  number: { textAlign: "right", fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  dateRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  results: { paddingVertical: 0, paddingHorizontal: 12 },
  result: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  resultText: { flex: 1 },
  resultSymbol: { fontSize: 16, fontWeight: "600" },
  chips: { gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 14, fontWeight: "500" },
});
