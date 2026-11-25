import { cashCurrencies, loadMarketData, type MarketData } from "@core/market";
import { summarize } from "@core/portfolio";
import { ALL_DEPOTS_ID, combineDepots, EMPTY_STORE, normalizeStore } from "@core/sync";
import type { Depot, DepotStore, Holding } from "@core/types";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui";
import { ApiError, getJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatMoney, formatPercent, formatQuantity, formatSignedMoney } from "@/lib/format";
import { signColor, useColors, type Palette } from "@/lib/theme";

/**
 * The Depot, read-only: the same depots as on fnnzhrn.ch, with today's prices. Totals and holdings
 * come from the web app's own calculation (src/lib/portfolio.ts).
 */
export default function DepotScreen() {
  const colors = useColors();
  const [store, setStore] = useState<DepotStore | null>(null);
  const [active, setActive] = useState(ALL_DEPOTS_ID);
  const [market, setMarket] = useState<{ key: string; data: MarketData } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);

  const fail = useCallback((e: unknown) => {
    setError((e as Error).message);
    // The session ended on the server (e.g. password reset elsewhere): back to sign-in.
    if (e instanceof ApiError && e.status === 401) authClient.signOut();
  }, []);

  const loadStore = useCallback(async () => {
    try {
      const { data } = await getJson<{ data: Partial<DepotStore> | null }>("/api/portfolio");
      setStore(data ? normalizeStore(data) : EMPTY_STORE);
      setError(null);
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  const depot = store ? pickDepot(store, active) : null;
  const key = depot ? JSON.stringify([depot.id, depot.data.transactions.length, depot.data.settings.baseCurrency, reload]) : "";

  useEffect(() => {
    if (!depot) return;
    let cancelled = false;
    const { transactions, cash, settings } = depot.data;
    loadMarketData(getJson, transactions, cashCurrencies(transactions, cash), settings.baseCurrency, { history: false })
      .then((data) => !cancelled && setMarket({ key, data }))
      .catch((e) => !cancelled && fail(e));
    return () => {
      cancelled = true;
    };
    // `key` captures everything about the depot that affects the prices to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  async function refresh() {
    setRefreshing(true);
    await loadStore();
    setReload((n) => n + 1);
    setRefreshing(false);
  }

  const base = depot?.data.settings.baseCurrency ?? "CHF";
  const current = market?.key === key ? market.data : null;
  const summary = depot && current ? summarize(depot.data.transactions, current.quotes, current.fx, depot.data.cash) : null;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}>
      <Text style={[styles.title, { color: colors.fg }]}>Depot</Text>

      {store && store.depots.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[{ id: ALL_DEPOTS_ID, name: "Alle Depots" }, ...store.depots].map((d) => {
            const selected = d.id === (depot?.id ?? active);
            return (
              <Pressable
                key={d.id}
                onPress={() => setActive(d.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  selected ? { backgroundColor: colors.accentSoft, borderColor: colors.accent } : { borderColor: colors.line },
                ]}>
                <Text style={[styles.chipText, { color: selected ? colors.accent : colors.fg }]}>{d.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {error && (
        <Card style={{ borderColor: colors.down }}>
          <Text style={{ color: colors.down, fontSize: 15 }}>{error}</Text>
        </Card>
      )}

      {!summary ? (
        !error && <ActivityIndicator style={styles.loading} color={colors.muted} />
      ) : (
        <>
          <Card>
            <Text style={[styles.label, { color: colors.muted }]}>Vermögen</Text>
            <Text style={[styles.big, { color: colors.fg }]}>{formatMoney(summary.netWorth, base)}</Text>
            <View style={styles.row}>
              <Stat label="Heute" colors={colors} value={summary.dayChange} text={`${formatSignedMoney(summary.dayChange, base)} · ${formatPercent(summary.dayChangePercent)}`} />
              <Stat label="Gesamtrendite" colors={colors} value={summary.totalReturn} text={formatPercent(summary.totalReturnPercent)} />
            </View>
            <View style={styles.row}>
              <Stat label="Aktien" colors={colors} text={formatMoney(summary.marketValue, base)} />
              <Stat label="Bargeld" colors={colors} text={formatMoney(summary.cash, base)} />
            </View>
          </Card>

          <Text style={[styles.section, { color: colors.fg }]}>Positionen</Text>
          {summary.holdings.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 15 }}>Noch keine Positionen. Erfasse Käufe auf fnnzhrn.ch.</Text>
          ) : (
            <Card style={styles.list}>
              {summary.holdings.map((h, i) => (
                <HoldingRow key={h.symbol} holding={h} base={base} colors={colors} first={i === 0} />
              ))}
            </Card>
          )}
          {current?.updatedAt && (
            <Text style={[styles.footnote, { color: colors.muted }]}>
              Kurse von Yahoo Finance, evtl. verzögert · {current.updatedAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** The chosen depot; "all" adds them up, and with a single depot there's nothing to add. */
function pickDepot(store: DepotStore, active: string): Depot {
  if (store.depots.length === 1) return store.depots[0];
  if (active === ALL_DEPOTS_ID) return combineDepots(store);
  return store.depots.find((d) => d.id === active) ?? combineDepots(store);
}

function Stat({ label, text, value, colors }: { label: string; text: string; value?: number; colors: Palette }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: value === undefined ? colors.fg : signColor(colors, value) }]}>{text}</Text>
    </View>
  );
}

function HoldingRow({ holding: h, base, colors, first }: { holding: Holding; base: string; colors: Palette; first: boolean }) {
  return (
    <View style={[styles.holding, !first && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.holdingMain}>
        <Text style={[styles.holdingName, { color: colors.fg }]} numberOfLines={1}>
          {h.name}
        </Text>
        <Text style={[styles.holdingValue, { color: colors.fg }]}>{formatMoney(h.marketValue, base)}</Text>
      </View>
      <View style={styles.holdingMain}>
        <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
          {formatQuantity(h.quantity)} × {h.symbol} · Einstand {formatMoney(h.costBasis, base)}
        </Text>
        <Text style={[styles.meta, { color: signColor(colors, h.unrealizedPL) }]}>{formatPercent(h.unrealizedPLPercent)}</Text>
      </View>
      <View style={[styles.bar, { backgroundColor: colors.line }]}>
        <View style={[styles.barFill, { backgroundColor: colors.accent, width: `${Math.max(h.weight * 100, 1)}%` }]} />
      </View>
      <Text style={[styles.meta, { color: colors.muted }]}>Anteil {formatPercent(h.weight).replace("+", "")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  chips: { gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 15, fontWeight: "500" },
  loading: { marginTop: 40 },
  label: { fontSize: 13 },
  big: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5, fontVariant: ["tabular-nums"], marginTop: 2 },
  row: { flexDirection: "row", marginTop: 14, gap: 12 },
  stat: { flex: 1 },
  statValue: { fontSize: 16, fontWeight: "600", marginTop: 2, fontVariant: ["tabular-nums"] },
  section: { fontSize: 22, fontWeight: "700", marginTop: 8 },
  list: { paddingVertical: 0 },
  holding: { paddingVertical: 12, gap: 4 },
  holdingMain: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  holdingName: { flex: 1, fontSize: 16, fontWeight: "600" },
  holdingValue: { fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] },
  meta: { fontSize: 13, fontVariant: ["tabular-nums"], flexShrink: 1 },
  bar: { height: 4, borderRadius: 2, marginTop: 4, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  footnote: { fontSize: 12, textAlign: "center" },
});
