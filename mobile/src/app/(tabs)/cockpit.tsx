import type { DepotStore, Quote } from "@core/types";
import * as WebBrowser from "expo-web-browser";
import { type ReactNode, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Polygon, Polyline } from "react-native-svg";

import { Button, Card, Segmented } from "@/components/ui";
import { ApiError, getJson } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import {
  ago,
  cap,
  cockpitQuotes,
  type CockpitQuote,
  dayLabel,
  type Earning,
  INDICES,
  MACRO,
  type MarketId,
  MARKETS,
  type Mover,
  nameKey,
  NEWS_TAGS,
  type NewsItem,
  num,
  pct,
  type Period,
  PERIODS,
  priceTime,
  RATING,
  ratingOf,
  type Sentiment,
} from "@/lib/cockpit";
import { API_URL } from "@/lib/config";
import { useColors, type Palette } from "@/lib/theme";
import { useAndroidTop } from "@/lib/insets";

/** The symbols and names held in any depot, for the news and for marking own titles. */
interface Mine {
  symbols: Set<string>;
  names: Set<string>;
  list: { symbol: string; name: string }[];
}

/**
 * The Cockpit's main tiles, native: markets, mood, gainers and losers, macro, news on own titles and
 * upcoming earnings. Data comes from the same /api/cockpit/* routes as the web Cockpit; the other tiles
 * are a link away on the website.
 */
export default function Cockpit() {
  const colors = useColors();
  const top = useAndroidTop();
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const mine = useLoad(loadMine, "mine", reload);
  // Markets and macro share one request, as on the web.
  const quotes = useLoad(marketQuotes, "quotes", reload);

  function refresh() {
    setRefreshing(true);
    setReload((n) => n + 1);
    // The tiles show their own spinners; the pull indicator only acknowledges the pull.
    setTimeout(() => setRefreshing(false), 600);
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.body, top]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}>
      <Text style={[styles.title, { color: colors.fg }]}>Cockpit</Text>

      <Heading colors={colors}>Marktlage</Heading>
      <Markets quotes={quotes} colors={colors} />
      <Mood reload={reload} colors={colors} />
      <Movers reload={reload} mine={mine.data} colors={colors} />
      <Macro quotes={quotes} colors={colors} />

      <Heading colors={colors}>Nachrichten</Heading>
      <News reload={reload} mine={mine.data} mineError={mine.error} colors={colors} />
      <Earnings reload={reload} mine={mine.data} colors={colors} />

      <Card style={styles.more}>
        <Text style={[styles.note, { color: colors.muted }]}>
          Schnäppchen-Radar, Value-Chancen, Buffett-Radar, Übernahmen und die Beobachtungsliste gibt es im Cockpit auf der Website.
        </Text>
        <Button title="Cockpit auf fnnzhrn.ch" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(`${API_URL}/cockpit`)} />
      </Card>
    </ScrollView>
  );
}

/* ---------- Data ---------- */

async function loadMine(): Promise<Mine> {
  const { data } = await getJson<{ data: DepotStore | null }>("/api/portfolio");
  const symbols = [
    ...new Set((data?.depots ?? []).flatMap((d) => d.data.transactions.filter((t) => t.type !== "fee").map((t) => t.symbol))),
  ];
  const quotes = symbols.length
    ? await getJson<Record<string, Quote>>(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`)
    : {};
  const list = symbols.map((s) => ({ symbol: s, name: quotes[s]?.name || s }));
  return {
    symbols: new Set(symbols.map((s) => s.toUpperCase())),
    names: new Set(list.map((x) => nameKey(x.name)).filter(Boolean)),
    list,
  };
}

const isMine = (mine: Mine | null, symbol: string, name: string) =>
  !!mine && (mine.symbols.has(symbol.toUpperCase()) || mine.names.has(nameKey(name)));

/** Loads once per `key` and `reload`; a 401 signs out, like everywhere in the app. */
function useLoad<T>(load: () => Promise<T>, key: string, reload: number) {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null } | null>(null);
  const k = `${key}#${reload}`;
  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => !cancelled && setState({ key: k, data, error: null }))
      .catch((e: Error) => {
        if (cancelled) return;
        setState({ key: k, data: null, error: e.message });
        if (e instanceof ApiError && e.status === 401) authClient.signOut();
      });
    return () => {
      cancelled = true;
    };
    // `k` captures everything that changes what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  // Keep showing the last data while a refresh loads.
  return { data: state?.data ?? null, error: state?.key === k ? state.error : null, loading: state?.key !== k };
}

const marketQuotes = () => cockpitQuotes(getJson, [...new Set([...INDICES.map((x) => x.s), ...MACRO.flatMap((g) => g.items.map((x) => x.s))])]);

/* ---------- Tiles ---------- */

type Loaded<T> = { data: T | null; error: string | null; loading: boolean };

function Markets({ quotes, colors }: { quotes: Loaded<Record<string, CockpitQuote>>; colors: Palette }) {
  const [period, setPeriod] = useState<Period>("d");
  const { data, error, loading } = quotes;
  return (
    <Tile title="Märkte" colors={colors} loading={loading && !data} error={error} source="Yahoo Finance · teils verzögert">
      <Chips options={PERIODS} value={period} onChange={setPeriod} colors={colors} />
      {data &&
        INDICES.map((x, i) => {
          const q = data[x.s];
          const v = q?.chg[period] ?? null;
          const spark = !q ? [] : period === "d" || period === "w" ? q.spark.slice(-6) : period === "m" ? q.spark.slice(-22) : q.spark;
          return (
            <Row key={x.s} first={i === 0} colors={colors}>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: colors.fg }]}>{x.n}</Text>
                <Text style={[styles.sub, { color: colors.muted }]}>{q && !q.error ? priceTime(q.time) : "keine Daten"}</Text>
              </View>
              {q && !q.error && (
                <>
                  <Spark values={spark} color={(v ?? 0) >= 0 ? colors.up : colors.down} />
                  <View style={styles.right}>
                    <Text style={[styles.value, { color: colors.fg }]}>{num(q.price, q.price >= 1000 ? 0 : 2)}</Text>
                    <Text style={[styles.sub, { color: signColor(colors, v) }]}>{pct(v)}</Text>
                  </View>
                </>
              )}
            </Row>
          );
        })}
    </Tile>
  );
}

function Mood({ reload, colors }: { reload: number; colors: Palette }) {
  const { data, error, loading } = useLoad(() => getJson<Sentiment>("/api/cockpit/sentiment"), "mood", reload);
  const fg = data?.fearGreed;
  const vix = data?.vix.value;
  const pc = data?.putCall.value;
  return (
    <Tile title="Marktstimmung" colors={colors} loading={loading && !data} error={error} source="CNN Fear & Greed Index (US-Aktienmarkt)">
      {fg && (
        <>
          <View style={styles.moodTop}>
            <View style={styles.gaugeCol}>
              <Gauge score={fg.score} colors={colors} />
              <Text style={[styles.rating, { color: moodColor(colors, fg.score) }]}>{RATING[fg.rating] ?? fg.rating}</Text>
            </View>
            <View style={styles.flex}>
              {(
                [
                  ["Vortag", fg.previousClose],
                  ["Vor 1 Woche", fg.week],
                  ["Vor 1 Monat", fg.month],
                  ["Vor 1 Jahr", fg.year],
                ] as const
              ).map(([label, v]) => (
                <View key={label} style={styles.moodRow}>
                  <Text style={[styles.sub, styles.flex, { color: colors.muted }]}>{label}</Text>
                  <Text style={[styles.sub, { color: colors.fg }]}>{Math.round(v)}</Text>
                  <Text style={[styles.pill, { color: moodColor(colors, v) }]}>{RATING[ratingOf(v)]}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.kpis}>
            <Kpi
              label="VIX Volatilität"
              value={num(vix, 2)}
              sub={vix == null ? "" : vix < 15 ? "ruhig" : vix < 20 ? "normal" : vix < 30 ? "nervös" : "Panik"}
              colors={colors}
            />
            <Kpi
              label="Put/Call Ratio"
              value={num(pc, 2)}
              sub={pc == null ? "" : pc > 1 ? "mehr Absicherung" : pc < 0.7 ? "viele Calls" : "ausgeglichen"}
              colors={colors}
            />
          </View>
        </>
      )}
    </Tile>
  );
}

function Movers({ reload, mine, colors }: { reload: number; mine: Mine | null; colors: Palette }) {
  const [side, setSide] = useState<"gainers" | "losers">("gainers");
  const [market, setMarket] = useState<MarketId>("us");
  const { data, error, loading } = useLoad(
    () => getJson<{ gainers: Mover[]; losers: Mover[] }>(`/api/cockpit/movers?market=${market}`),
    `movers-${market}`,
    reload,
  );
  const rows = data?.[side] ?? [];
  return (
    <Tile title="Tagesgewinner & -verlierer" colors={colors} loading={loading} error={error} source="Yahoo-Screener · grosse, liquide Titel">
      <Segmented
        options={[
          { value: "gainers", label: "Gewinner" },
          { value: "losers", label: "Verlierer" },
        ]}
        value={side}
        onChange={setSide}
      />
      <Chips options={MARKETS.map((m) => ({ value: m.id, label: m.n }))} value={market} onChange={setMarket} colors={colors} />
      {!loading && data && rows.length === 0 && <Text style={[styles.note, { color: colors.muted }]}>Heute (noch) keine Kurse für diesen Markt.</Text>}
      {!loading &&
        rows.map((r, i) => (
          <Row key={r.symbol} first={i === 0} colors={colors} highlight={isMine(mine, r.symbol, r.name)}>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: colors.fg }]} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={[styles.sub, { color: colors.muted }]}>
                {r.symbol} · {cap(r.marketCap)} {r.currency}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={[styles.value, { color: colors.fg }]}>
                {num(r.price)} <Text style={[styles.sub, { color: colors.muted }]}>{r.currency}</Text>
              </Text>
              <Text style={[styles.sub, { color: signColor(colors, r.chgPct) }]}>{pct(r.chgPct)}</Text>
            </View>
          </Row>
        ))}
      {mine && rows.some((r) => isMine(mine, r.symbol, r.name)) && <MineNote colors={colors} />}
    </Tile>
  );
}

function Macro({ quotes, colors }: { quotes: Loaded<Record<string, CockpitQuote>>; colors: Palette }) {
  const { data, error, loading } = quotes;
  return (
    <Tile title="Makro-Markt" colors={colors} loading={loading && !data} error={error} source="Yahoo Finance · Rohstoffe = Front-Month-Futures">
      {data &&
        MACRO.map((g) => (
          <View key={g.group} style={styles.macroGroup}>
            <Text style={[styles.groupTitle, { color: colors.muted }]}>{g.group}</Text>
            <View style={styles.grid}>
              {g.items.map((x) => {
                const q: CockpitQuote | undefined = data[x.s];
                const ok = q && !q.error;
                return (
                  <View key={x.s} style={[styles.cell, { borderColor: colors.line }]}>
                    <Text style={[styles.sub, { color: colors.muted }]}>{x.n}</Text>
                    <Text style={[styles.value, { color: colors.fg }]}>{ok ? num(q.price, x.d) : "–"}</Text>
                    <View style={styles.cellFoot}>
                      <Text style={[styles.sub, { color: signColor(colors, ok ? q.chg.d : null) }]}>{ok ? pct(q.chg.d) : ""}</Text>
                      {ok && <Spark values={q.spark.slice(-22)} color={(q.chg.d ?? 0) >= 0 ? colors.up : colors.down} small />}
                    </View>
                    {x.u && <Text style={[styles.unit, { color: colors.muted }]}>{x.u}</Text>}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
    </Tile>
  );
}

const NEWS_FILTERS = [
  { value: "all", label: "Alle" },
  { value: "important", label: "Wichtig" },
  { value: "earnings", label: "Quartalszahlen" },
  { value: "mna", label: "Übernahme" },
  { value: "analyst", label: "Analysten" },
] as const;
type NewsFilter = (typeof NEWS_FILTERS)[number]["value"];
const NEWS_MAX = 25; // the route's limit per request

function News({ reload, mine, mineError, colors }: { reload: number; mine: Mine | null; mineError: string | null; colors: Palette }) {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const list = mine?.list.slice(0, NEWS_MAX) ?? [];
  const query = list.map((x) => `s=${encodeURIComponent(`${x.symbol}|${x.name}`)}`).join("&");
  const { data, error, loading } = useLoad(
    () => (query ? getJson<{ items: NewsItem[] }>(`/api/cockpit/news?${query}`) : Promise.resolve({ items: [] })),
    `news-${query}`,
    reload,
  );
  const items = (data?.items ?? []).filter((it) =>
    filter === "all" ? true : filter === "important" ? it.tags.length > 0 : it.tags.includes(filter),
  );
  return (
    <Tile
      title="News zu meinen Aktien"
      colors={colors}
      loading={(loading || !mine) && !mineError}
      error={error ?? mineError}
      source="Google News · Kategorien per Stichwort">
      <Chips options={NEWS_FILTERS} value={filter} onChange={setFilter} colors={colors} />
      {mine && !loading && list.length === 0 && (
        <Text style={[styles.note, { color: colors.muted }]}>Erfasse Titel im Depot, um News zu ihnen zu sehen.</Text>
      )}
      {mine && !loading && list.length > 0 && items.length === 0 && (
        <Text style={[styles.note, { color: colors.muted }]}>Keine passenden News in den letzten 7 Tagen.</Text>
      )}
      {!loading &&
        items.slice(0, 40).map((it, i) => (
          <Pressable
            key={`${it.link}-${i}`}
            accessibilityRole="link"
            onPress={() => WebBrowser.openBrowserAsync(it.link)}
            style={[styles.news, i > 0 && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.newsTitle, { color: colors.fg }]}>{it.title}</Text>
            <View style={styles.meta}>
              {it.stock && <Text style={[styles.pill, { color: colors.fg, backgroundColor: colors.card }]}>{it.stock}</Text>}
              {it.tags.map((t) => (
                <Text key={t} style={[styles.pill, { color: t === "mna" ? colors.warn : colors.up }]}>
                  {NEWS_TAGS[t] ?? t}
                </Text>
              ))}
              <Text style={[styles.sub, { color: colors.muted }]}>
                {it.source} · {ago(it.date)}
              </Text>
            </View>
          </Pressable>
        ))}
      {mine && mine.list.length > NEWS_MAX && (
        <Text style={[styles.sub, { color: colors.muted }]}>
          Nur die ersten {NEWS_MAX} Titel; {mine.list.length - NEWS_MAX} weitere sind nicht dabei.
        </Text>
      )}
    </Tile>
  );
}

function Earnings({ reload, mine, colors }: { reload: number; mine: Mine | null; colors: Palette }) {
  const [only, setOnly] = useState<"all" | "mine">("all");
  const { data, error, loading } = useLoad(() => getJson<{ rows: Earning[] }>("/api/cockpit/earnings?days=7"), "earnings", reload);
  const rows = (data?.rows ?? []).filter((r) => only === "all" || isMine(mine, r.symbol, r.name));
  let lastDay = "";
  return (
    <Tile title="Nächste Quartalszahlen" colors={colors} loading={loading && !data} error={error} source="Nasdaq Earnings Calendar (US-Kotierungen inkl. ADRs)">
      <Chips
        options={[
          { value: "all", label: "Alle grossen" },
          { value: "mine", label: "Meine" },
        ]}
        value={only}
        onChange={setOnly}
        colors={colors}
      />
      {data && rows.length === 0 && (
        <Text style={[styles.note, { color: colors.muted }]}>
          {only === "mine" ? "Keiner deiner Titel meldet in den nächsten 7 Werktagen." : "Keine Termine gefunden."}
        </Text>
      )}
      {rows.slice(0, 80).map((r) => {
        const head = r.date !== lastDay;
        lastDay = r.date;
        return (
          <View key={`${r.date}-${r.symbol}`}>
            {head && <Text style={[styles.groupTitle, { color: colors.muted }]}>{dayLabel(r.date)}</Text>}
            <Row first={head} colors={colors} highlight={isMine(mine, r.symbol, r.name)}>
              <View style={styles.flex}>
                <Text style={[styles.name, { color: colors.fg }]} numberOfLines={1}>
                  {r.symbol} <Text style={[styles.sub, { color: colors.muted }]}>{r.name}</Text>
                </Text>
                {(r.time || r.epsForecast) && (
                  <Text style={[styles.sub, { color: colors.muted }]}>
                    {[r.time, r.epsForecast ? `EPS erw. ${r.epsForecast}` : ""].filter(Boolean).join(" · ")}
                  </Text>
                )}
              </View>
              <Text style={[styles.sub, { color: colors.muted }]}>{cap(r.marketCap)}</Text>
            </Row>
          </View>
        );
      })}
    </Tile>
  );
}

/* ---------- Building blocks ---------- */

function Heading({ children, colors }: { children: ReactNode; colors: Palette }) {
  return <Text style={[styles.heading, { color: colors.muted }]}>{children}</Text>;
}

function Tile({
  title,
  source,
  loading,
  error,
  colors,
  children,
}: {
  title: string;
  source: string;
  loading: boolean;
  error: string | null;
  colors: Palette;
  children: ReactNode;
}) {
  return (
    <Card style={styles.tile}>
      <View style={styles.tileHead}>
        <Text style={[styles.tileTitle, { color: colors.fg }]}>{title}</Text>
        {loading && <ActivityIndicator size="small" color={colors.muted} />}
      </View>
      {error ? <Text style={[styles.note, { color: colors.down }]}>{error}</Text> : children}
      <Text style={[styles.source, { color: colors.muted }]}>{source}</Text>
    </Card>
  );
}

function Row({ first, highlight, colors, children }: { first: boolean; highlight?: boolean; colors: Palette; children: ReactNode }) {
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
        highlight && { backgroundColor: colors.accentSoft, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
      ]}>
      {children}
    </View>
  );
}

function MineNote({ colors }: { colors: Palette }) {
  return <Text style={[styles.sub, { color: colors.muted }]}>Hervorgehoben: in deinem Depot.</Text>;
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colors: Palette;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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

function Kpi({ label, value, sub, colors }: { label: string; value: string; sub: string; colors: Palette }) {
  return (
    <View style={[styles.cell, styles.flex, { borderColor: colors.line }]}>
      <Text style={[styles.sub, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.fg }]}>{value}</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>{sub}</Text>
    </View>
  );
}

/** A line with a faint area under it and a dot on the latest value, as in the web Cockpit. */
function Spark({ values, color, small }: { values: number[]; color: string; small?: boolean }) {
  const w = small ? 56 : 64;
  const h = 22;
  if (values.length < 2) return <View style={{ width: w }} />;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const xy = values.map((v, i) => [3 + (i / (values.length - 1)) * (w - 6), h - 3 - ((v - min) / span) * (h - 6)]);
  const pts = xy.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const end = xy[xy.length - 1];
  return (
    <Svg width={w} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Polygon points={`3,${h} ${pts} ${w - 3},${h}`} fill={color} fillOpacity={0.12} />
      <Polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={end[0]} cy={end[1]} r={2.2} fill={color} />
    </Svg>
  );
}

/** The Fear & Greed dial: five bands from fear (red) to greed (green), a needle and the score. */
function Gauge({ score, colors }: { score: number; colors: Palette }) {
  const point = (s: number, r: number) => {
    const a = Math.PI * (1 - s / 100);
    return [100 + r * Math.cos(a), 100 - r * Math.sin(a)];
  };
  const arc = (from: number, to: number, color: string) => {
    const [x1, y1] = point(from, 88);
    const [x2, y2] = point(to, 88);
    return <Path key={from} d={`M${x1.toFixed(1)} ${y1.toFixed(1)} A88 88 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke={color} strokeWidth={14} fill="none" opacity={0.8} />;
  };
  const [nx, ny] = point(score, 78);
  const needle = moodColor(colors, score);
  return (
    <View accessible accessibilityLabel={`Fear & Greed ${Math.round(score)}`} style={styles.gauge}>
      <Svg width={150} height={89} viewBox="0 0 200 118">
        {arc(0.5, 24.5, colors.down)}
        {arc(25.5, 44.5, colors.fixed)}
        {arc(45.5, 54.5, colors.warn)}
        {arc(55.5, 74.5, colors.income)}
        {arc(75.5, 99.5, colors.up)}
        <Line x1={100} y1={100} x2={nx} y2={ny} stroke={needle} strokeWidth={3} strokeLinecap="round" />
        <Circle cx={100} cy={100} r={5} fill={needle} />
      </Svg>
      <Text style={[styles.gaugeScore, { color: colors.fg }]}>{Math.round(score)}</Text>
    </View>
  );
}

const moodColor = (colors: Palette, score: number) => (score < 45 ? colors.down : score <= 55 ? colors.warn : colors.up);
const signColor = (colors: Palette, v: number | null | undefined) => (v == null || v === 0 ? colors.muted : v > 0 ? colors.up : colors.down);

const styles = StyleSheet.create({
  body: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: -0.5 },
  heading: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 8 },
  tile: { gap: 10 },
  tileHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileTitle: { fontSize: 17, fontWeight: "600" },
  source: { fontSize: 11, marginTop: 2 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  right: { alignItems: "flex-end", minWidth: 86 },
  name: { fontSize: 15, fontWeight: "600" },
  value: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  sub: { fontSize: 12, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 11 },
  note: { fontSize: 14, lineHeight: 20 },
  chips: { gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: 13, fontWeight: "500" },
  moodTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  moodRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
  gaugeCol: { alignItems: "center" },
  rating: { fontSize: 15, fontWeight: "700" },
  gauge: { alignItems: "center" },
  gaugeScore: { position: "absolute", top: 34, fontSize: 22, fontWeight: "800" },
  pill: { fontSize: 11, fontWeight: "600", overflow: "hidden", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  kpis: { flexDirection: "row", gap: 8 },
  macroGroup: { gap: 6 },
  groupTitle: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: { width: "48%", flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 10, gap: 2 },
  cellFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  news: { paddingVertical: 10, gap: 5 },
  newsTitle: { fontSize: 15, lineHeight: 20, fontWeight: "500" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  more: { gap: 12 },
});
