import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { categoryTotals, summarizeBudget } from "../budget";
import { loadBudget } from "../budget-store";
import { loadDepotStore, userDepotOverview } from "../cockpit/depot-data";
import { failed, mapLimit } from "../cockpit/http";
import { investorChanges } from "../cockpit/investors";
import { earnings, radar, sentiment } from "../cockpit/markets";
import { mnaNews, stockNews } from "../cockpit/news";
import { movers, valueStocks } from "../cockpit/screener";
import { MARKET_IDS } from "../cockpit/screens";
import { yahooChart } from "../cockpit/yahoo";
import { searchSymbols } from "../yahoo";

/** Whose data the tools read. */
export interface ToolUser {
  id: string;
  email: string;
}

/** Input the model sent that doesn't fit the tool; returned to it as an error so it can try again. */
export class ToolInputError extends Error {}

type Input = Record<string, unknown>;

const str = (input: Input, key: string, required = false): string | undefined => {
  const v = input[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolInputError(`${key} fehlt`);
    return undefined;
  }
  if (typeof v !== "string") throw new ToolInputError(`${key} muss ein Text sein`);
  return v;
};

const strings = (input: Input, key: string, max: number): string[] => {
  const v = input[key];
  if (!Array.isArray(v) || !v.length || v.some((s) => typeof s !== "string" || !s.trim())) throw new ToolInputError(`${key} muss eine Liste von Texten sein`);
  if (v.length > max) throw new ToolInputError(`Höchstens ${max} Einträge in ${key}`);
  return v.map((s: string) => s.trim());
};

const marketOf = (input: Input) => {
  const m = str(input, "market") ?? "us";
  if (!(MARKET_IDS as string[]).includes(m)) throw new ToolInputError(`market muss eines von ${MARKET_IDS.join(", ")} sein`);
  return m;
};

const MARKET_PROP = { type: "string", enum: MARKET_IDS, description: "us = USA, ch = Schweiz, de = Deutschland, eu = Europa, gb = UK, jp = Japan. Standard: us" };

interface AssistantTool {
  definition: Anthropic.Beta.BetaTool;
  run(input: Input, user: ToolUser): Promise<unknown>;
}

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], run: AssistantTool["run"]): AssistantTool => ({
  definition: {
    name,
    description,
    input_schema: { type: "object", properties, required, additionalProperties: false },
    eager_input_streaming: true,
  },
  run,
});

const TOOLS: AssistantTool[] = [
  tool(
    "get_depot",
    "Depot-Übersicht aus dem Depot-Tool mit aktuellen Kursen: Positionen (Menge, Einstand, Kurs, Tagesänderung, Marktwert, unrealisierter G/V, Gewicht), Totale, Cash, Nettovermögen, Rendite seit 1. Januar und Dividenden. Beträge in der Basiswährung des Depots. Ohne depot werden bei mehreren Depots alle zusammengezählt; die Antwort listet die Depots mit ihren ids.",
    { depot: { type: "string", description: "id eines Depots oder \"all\" für alle zusammen" } },
    [],
    async (input, user) => (await userDepotOverview(user.id, str(input, "depot") ?? null)) ?? { empty: true, note: "Keine Depots gespeichert" },
  ),
  tool(
    "get_depot_records",
    "Rohdaten aus dem Depot-Tool: alle Transaktionen (Käufe, Verkäufe, Dividenden, Depotgebühren; Beträge in der Handelswährung), Cash-Konten mit Saldo, Basiswährung, Anlageklassen und Zielgewichte, pro Depot. Für Fragen zu einzelnen Käufen, Daten, Gebühren oder der Historie.",
    { depot: { type: "string", description: "id eines Depots; ohne werden alle Depots geliefert" }, symbol: { type: "string", description: "nur Transaktionen dieses Tickers" } },
    [],
    async (input, user) => {
      const store = await loadDepotStore(user.id);
      if (!store) return { empty: true, note: "Keine Depots gespeichert" };
      const id = str(input, "depot");
      const symbol = str(input, "symbol")?.toUpperCase();
      return {
        depots: store.depots
          .filter((d) => !id || d.id === id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            settings: d.data.settings,
            cash: d.data.cash,
            transactions: d.data.transactions.filter((t) => !symbol || t.symbol.toUpperCase() === symbol),
          })),
        combinedSettings: store.combined,
      };
    },
  ),
  tool(
    "get_finances",
    "Die Finanzübersicht aus dem Finanzen-Tool: Einnahmen, Fixkosten, variable Ausgaben und Investitionen (je mit Betrag und Intervall month, month13 = monatlich 13×, year), Totale pro Monat und Jahr, Ausgaben pro Kategorie, Notiz, Jahres-Snapshots und die tatsächlichen Ausgaben Monat für Monat.",
    {},
    [],
    async (_input, user) => {
      const budget = await loadBudget(user.id, user.email);
      return { ...budget, summary: summarizeBudget(budget), categoryTotals: categoryTotals(budget) };
    },
  ),
  tool(
    "get_quotes",
    "Aktuelle Kurse und Performance (Tag, Woche, Monat, 6 Monate, seit Jahresbeginn, 1 Jahr, 52-Wochen-Hoch/Tief) für Yahoo-Ticker, z. B. NESN.SW, AAPL, ^SSMI, EURCHF=X, BTC-USD.",
    { symbols: { type: "array", items: { type: "string" }, description: "Yahoo-Ticker, höchstens 20" } },
    ["symbols"],
    async (input) => {
      const symbols = strings(input, "symbols", 20);
      const rows = await mapLimit(symbols, 8, (s) => yahooChart(s));
      return rows.map((r, i) => (failed(r) ? { symbol: symbols[i], error: r.error } : { ...r, spark: undefined }));
    },
  ),
  tool(
    "search_symbol",
    "Sucht Yahoo-Ticker zu einem Firmen-, Fonds- oder ETF-Namen oder einer ISIN.",
    { query: { type: "string" } },
    ["query"],
    async (input) => searchSymbols(str(input, "query", true)!),
  ),
  tool(
    "get_news",
    "News der letzten 7 Tage zu Aktien (Google News, Englisch und Deutsch, mit Tags earnings / mna / analyst), oder mit topic \"mna\" Übernahmegerüchte und Firmen, die einen Käufer suchen.",
    {
      stocks: { type: "array", items: { type: "string" }, description: "Einträge \"TICKER|Firmenname\", höchstens 10" },
      topic: { type: "string", enum: ["mna"] },
    },
    [],
    async (input) => {
      const items = str(input, "topic") === "mna" ? await mnaNews() : await stockNews(strings(input, "stocks", 10));
      return items.slice(0, 60).map(({ title, source, date, tags, symbol, group, link }) => ({ title, source, date: new Date(date).toISOString(), tags, symbol, group, link }));
    },
  ),
  tool(
    "get_market_screen",
    "Listen aus dem Cockpit pro Markt: movers = heutige Top-10-Gewinner und -Verlierer, value = Value-Chancen (tiefes KGV, Gewinnwachstum, wenig Schulden), radar = Schnäppchen-Radar (grösste Kursrückgänge über 6 und 12 Monate).",
    { kind: { type: "string", enum: ["movers", "value", "radar"] }, market: MARKET_PROP, maxPe: { type: "number", description: "nur bei value: höchstes KGV, Standard 15" } },
    ["kind"],
    async (input) => {
      const kind = str(input, "kind", true);
      const market = marketOf(input);
      if (kind === "movers") return movers(market);
      if (kind === "radar") return radar(market);
      if (kind === "value") {
        const maxPe = typeof input.maxPe === "number" ? Math.min(Math.max(Math.round(input.maxPe), 5), 50) : 15;
        return valueStocks(market, { maxPe, growth: true, lowDebt: true });
      }
      throw new ToolInputError("kind muss movers, value oder radar sein");
    },
  ),
  tool(
    "get_earnings",
    "Nächste Quartalszahlen (Nasdaq-Kalender, US-Kotierungen inkl. ADRs) mit Datum, Zeitpunkt und EPS-Prognose.",
    { days: { type: "integer", description: "Handelstage voraus, 1 bis 14, Standard 7" }, minCap: { type: "number", description: "Mindest-Börsenwert in USD, Standard 10e9" } },
    [],
    async (input) => {
      const days = Math.min(Math.max(Math.floor(Number(input.days) || 7), 1), 14);
      const minCap = Math.max(Number(input.minCap) || 10e9, 0);
      return (await earnings(days, minCap)).slice(0, 80);
    },
  ),
  tool("get_sentiment", "Marktstimmung: CNN Fear & Greed Index mit Put/Call-Ratio und VIX.", {}, [], () => sentiment()),
  tool(
    "get_investors",
    "Buffett-Radar: Änderungen zwischen den letzten zwei 13F-Meldungen bekannter Investoren (Berkshire Hathaway, Pershing Square, Third Point, Bridgewater): neue, aufgestockte, reduzierte und verkaufte Positionen.",
    {},
    [],
    () => investorChanges(),
  ),
];

export const TOOL_DEFINITIONS = TOOLS.map((t) => t.definition);

/** Runs a tool the model called; the result goes back to it as JSON text. */
export async function runTool(name: string, input: unknown, user: ToolUser): Promise<string> {
  const t = TOOLS.find((x) => x.definition.name === name);
  if (!t) throw new ToolInputError(`Unbekanntes Werkzeug ${name}`);
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new ToolInputError("Eingabe muss ein Objekt sein");
  return JSON.stringify(await t.run(input as Input, user));
}
