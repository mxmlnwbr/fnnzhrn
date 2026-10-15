import "server-only";
import { failed, fetchJson, fetchText, mapLimit } from "./http";

const FUNDS = [
  { cik: 1067983, name: "Berkshire Hathaway", manager: "Warren Buffett" },
  { cik: 1336528, name: "Pershing Square", manager: "Bill Ackman" },
  { cik: 1040273, name: "Third Point", manager: "Dan Loeb" },
  { cik: 1350694, name: "Bridgewater Associates", manager: "Ray Dalio" },
];

// SEC asks for a descriptive User-Agent with contact details.
const SEC = { headers: { "User-Agent": "fnnzhrn cockpit (https://fnnzhrn.ch)" }, revalidate: 86400 };

type Holding = { name: string; value: number; shares: number };

/** Changes between the two latest 13F-HR filings of each fund: new, increased, reduced and sold positions. */
export async function investorChanges() {
  const funds = await mapLimit(FUNDS, 2, fundChanges);
  return funds.map((f, i) => (failed(f) ? { ...FUNDS[i], error: f.error } : f));
}

async function fundChanges(fund: (typeof FUNDS)[number]) {
  const sub = await fetchJson<{ filings: { recent: { form: string[]; accessionNumber: string[]; filingDate: string[]; reportDate: string[] } } }>(
    `https://data.sec.gov/submissions/CIK${String(fund.cik).padStart(10, "0")}.json`,
    SEC,
  );
  const r = sub.filings.recent;
  const filings: { acc: string; filed: string; period: string }[] = [];
  for (let i = 0; i < r.form.length && filings.length < 2; i++) {
    if (r.form[i] === "13F-HR") filings.push({ acc: r.accessionNumber[i], filed: r.filingDate[i], period: r.reportDate[i] });
  }
  if (filings.length < 2) throw new Error("Zu wenige 13F-Meldungen");
  const [cur, prev] = await Promise.all(filings.map((f) => holdings(fund.cik, f.acc)));
  return { ...fund, period: filings[0].period, filed: filings[0].filed, previousPeriod: filings[1].period, positions: cur.size, totalValue: total(cur), changes: diffHoldings(cur, prev).slice(0, 40) };
}

export type Change = { type: "new" | "add" | "trim" | "exit"; name: string; value: number; shares: number; deltaPct?: number; share?: number | null };

/** Positions that are new, or changed by more than 5 % in shares, sorted by kind then value. */
export function diffHoldings(cur: Map<string, Holding>, prev: Map<string, Holding>): Change[] {
  const changes: Change[] = [];
  const sum = total(cur);
  for (const [cusip, h] of cur) {
    const p = prev.get(cusip);
    const share = sum ? (h.value / sum) * 100 : null;
    if (!p) changes.push({ type: "new", name: h.name, value: h.value, shares: h.shares, share });
    else if (h.shares > p.shares * 1.05) changes.push({ type: "add", name: h.name, value: h.value, shares: h.shares, deltaPct: (h.shares / p.shares - 1) * 100, share });
    else if (h.shares < p.shares * 0.95) changes.push({ type: "trim", name: h.name, value: h.value, shares: h.shares, deltaPct: (h.shares / p.shares - 1) * 100, share });
  }
  for (const [cusip, p] of prev) {
    if (!cur.has(cusip)) changes.push({ type: "exit", name: p.name, value: p.value, shares: 0, deltaPct: -100 });
  }
  const order = { new: 0, add: 1, trim: 2, exit: 3 };
  return changes.sort((a, b) => order[a.type] - order[b.type] || b.value - a.value);
}

async function holdings(cik: number, acc: string) {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
  const idx = await fetchJson<{ directory: { item: { name: string }[] } }>(`${base}/index.json`, SEC);
  const file = idx.directory.item.map((i) => i.name).find((n) => n.endsWith(".xml") && n !== "primary_doc.xml");
  if (!file) throw new Error("Keine Informationstabelle gefunden");
  return parseInfoTable(await fetchText(`${base}/${file}`, { ...SEC, timeout: 20000 }));
}

/** CUSIP -> holding from a 13F information table; one issuer can appear on several lines. Options are skipped. */
export function parseInfoTable(xml: string) {
  const out = new Map<string, Holding>();
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const b = m[1];
    const get = (t: string) => b.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)<`))?.[1].trim() ?? "";
    if (get("putCall")) continue;
    const cusip = get("cusip");
    const h = out.get(cusip) ?? { name: get("nameOfIssuer"), value: 0, shares: 0 };
    h.value += Number(get("value")) || 0;
    h.shares += Number(get("sshPrnamt")) || 0;
    out.set(cusip, h);
  }
  return out;
}

function total(map: Map<string, Holding>) {
  let s = 0;
  for (const h of map.values()) s += h.value;
  return s;
}
