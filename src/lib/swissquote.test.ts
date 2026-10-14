import { describe, expect, it } from "vitest";
import { buildPositions } from "./portfolio";
import {
  applyImport,
  decodeText,
  isImported,
  isSwissquoteCsv,
  parseSwissquoteCsv,
  pickTicker,
  removeImported,
  swissquoteListings,
  tickerCandidates,
} from "./swissquote";

const HEADER =
  "Datum;Auftrag #;Transaktionen;Symbol;Name;ISIN;Anzahl;Stückpreis;Kosten;Aufgelaufene Zinsen;Nettobetrag;Währung Nettobetrag;Nettobetrag in der Währung des Kontos;Saldo;Währung";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\r\n");

describe("parseSwissquoteCsv", () => {
  it("imports trades and dividends, skipping cash movements", () => {
    const { transactions, skipped } = parseSwissquoteCsv(
      csv(
        '23-09-2026 09:35:36;00000000;Dividende;LOGN;"LOGITECH N";CH0025751329;1.0;89.76;31.42;0.00;58.34;CHF;58.34;178.95;CHF',
        '25-08-2026 15:30:20;305257554;Kauf;PG;"PROCTER & GAMBLE ORD";US7427181091;2.0;145.73;5.03;0.00;-296.49;USD;-296.49;3.60;USD',
        "25-08-2026 00:01:44;00000000;Einzahlung;;;;1.0;683.35;0.00;0.00;683.35;CHF;683.35;862.30;CHF",
        '16-10-2023 09:00:20;153639092;Verkauf;SDZ;"SANDOZ GROUP N";CH1243598427;5.0;28.03;7.45;0.00;132.70;CHF;132.70;270.03;CHF',
      ),
    );
    expect(transactions.map((t) => ({ ...t, id: undefined }))).toEqual([
      { id: undefined, symbol: "SDZ.SW", type: "sell", date: "2023-10-16", quantity: 5, price: 28.03, fees: 7.45 },
      { id: undefined, symbol: "PG", type: "buy", date: "2026-08-25", quantity: 2, price: 145.73, fees: 5.03 },
      { id: undefined, symbol: "LOGN.SW", type: "dividend", date: "2026-09-23", quantity: 0, price: 89.76, fees: 31.42, note: undefined },
    ]);
    expect(skipped).toEqual({ Einzahlung: 1 });
  });

  it("takes the latest balance per account currency as cash", () => {
    const { cash } = parseSwissquoteCsv(
      csv(
        `23-09-2026 09:35:36;00000000;Dividende;LOGN;"LOGITECH N";CH0025751329;1.0;89.76;31.42;0.00;58.34;CHF;58.34;1'178.95;CHF`,
        '07-05-2026 12:09:21;00000000;Corporate Action;LHN;"HOLCIM N";CH0012214059;-46.0;0;0.00;0.00;-;;-;;',
        '25-08-2026 15:30:20;305257554;Kauf;PG;"PROCTER & GAMBLE ORD";US7427181091;2.0;145.73;5.03;0.00;-296.49;USD;-296.49;3.60;USD',
        "25-08-2026 00:01:44;00000000;Einzahlung;;;;1.0;683.35;0.00;0.00;683.35;CHF;683.35;862.30;CHF",
        "01-01-2020 00:00:00;00000000;Einzahlung;;;;1.0;10.00;0.00;0.00;10.00;USD;10.00;10.00;USD",
      ),
    );
    expect(cash).toEqual([
      { id: "sq-cash-CHF", name: "Swissquote CHF", currency: "CHF", balance: 1178.95 },
      { id: "sq-cash-USD", name: "Swissquote USD", currency: "USD", balance: 3.6 },
    ]);
  });

  it("marks imported transactions apart from ones entered by hand", () => {
    const text = csv('25-08-2026 15:30:20;305257554;Kauf;PG;"PG";US7427181091;2.0;145.73;5.03;0.00;-296.49;USD;-296.49;3.60;USD');
    expect(isImported(parseSwissquoteCsv(text).transactions[0])).toBe(true);
    expect(isImported({ id: crypto.randomUUID(), symbol: "PG", type: "buy", date: "2026-01-01", quantity: 1, price: 1, fees: 0 })).toBe(false);
  });

  it("gives the same ids when the same export is imported again", () => {
    const text = csv('25-08-2026 15:30:20;305257554;Kauf;PG;"PG";US7427181091;2.0;145.73;5.03;0.00;-296.49;USD;-296.49;3.60;USD');
    expect(parseSwissquoteCsv(text).transactions[0].id).toBe(parseSwissquoteCsv(text).transactions[0].id);
  });

  it("books splits and renames without changing cost", () => {
    const { transactions } = parseSwissquoteCsv(
      csv(
        '14-11-2019 15:20:02;1;Kauf;LHN;"LAFARGEHOLCIM N";CH0012214059;46.0;50.00;0.00;0.00;-2300.00;CHF;-2300.00;0;CHF',
        '07-05-2021 12:09:21;00000000;Corporate Action;LHN;"HOLCIM N";CH0012214059;-46.0;0;0.00;0.00;-;;-;;',
        '07-05-2021 12:09:21;00000000;Corporate Action;HOLN;"HOLCIM N";CH0012214059;46.0;0;0.00;0.00;-;;-;;',
        '01-01-2020 10:00:00;2;Kauf;SQN;"SWISSQUOTE N";CH0010675863;16.0;100.00;0.00;0.00;-1600.00;CHF;-1600.00;0;CHF',
        '27-05-2026 21:05:17;00000000;Split;SQN;"SWISSQUOTE N";CH1548235246;160.0;0;0.00;0.00;-;CHF;-;;CHF',
        '27-05-2026 21:05:17;00000000;Split;SQN;"SWISSQUOTE N";CH0010675863;-16.0;0;0.00;0.00;-;CHF;-;;CHF',
      ),
    );
    const positions = buildPositions(transactions);
    expect([...positions.keys()].sort()).toEqual(["HOLN.SW", "SQN.SW"]);
    expect(positions.get("HOLN.SW")).toMatchObject({ quantity: 46, cost: 2300 });
    expect(positions.get("SQN.SW")).toMatchObject({ quantity: 160, cost: 1600 });
  });

  it("carries cost into converted shares and cancels reversed spin-offs", () => {
    const { transactions } = parseSwissquoteCsv(
      csv(
        '01-01-2020 10:00:00;1;Kauf;ROG;"ROCHE GS";CH0012032048;17.0;300.00;0.00;0.00;-5100.00;CHF;-5100.00;0;CHF',
        '17-03-2026 20:13:06;00000000;Titelumbuchung;ROP;"ROCHE PS";CH1499059983;17.0;0;0.00;0.00;-;CHF;-;;CHF',
        '17-03-2026 20:13:06;00000000;Titelumbuchung;ROG;"ROCHE GS";CH0012032048;-17.0;0;0.00;0.00;-;CHF;-;;CHF',
        '11-04-2022 15:48:02;00000000;Spin off;WBD;"WBD";US9344231041;15.1;24.04;0.00;0.00;-;USD;-;;USD',
        '14-04-2022 09:30:58;00000000;Storno (Corporate Action);WBD;"WBD";US9344231041;15.1;24.04;0.00;0.00;-;USD;-;;USD',
        '14-04-2022 09:34:47;00000000;Spin off;WBD;"WBD";US9344231041;15.241;24.78;0.00;0.00;-;USD;-;;USD',
        '12-07-2022 07:41:06;00000000;Rückzahlung;WBD;"WBD";US9344231041;-0.241;13.055377;0.00;0.00;-;USD;-;;USD',
        '12-07-2022 07:41:06;00000000;Rückzahlung;WBD;"WBD";US9344231041;1.0;3.15;0.00;0.00;3.15;USD;3.15;223.98;USD',
      ),
    );
    const positions = buildPositions(transactions);
    expect(positions.get("ROG.SW")).toMatchObject({ quantity: 0, realized: 0 });
    expect(positions.get("ROP.SW")).toMatchObject({ quantity: 17, cost: 5100 });
    expect(positions.get("WBD")).toMatchObject({ quantity: 15, cost: 0 });
    expect(positions.get("WBD")!.realized).toBeCloseTo(3.15, 2);
  });
});

describe("decodeText", () => {
  it("reads Windows-1252 exports", () => {
    const bytes = new Uint8Array([...Buffer.from("Datum;Auftrag #;St"), 0xfc, ...Buffer.from("ckpreis")]);
    const text = decodeText(bytes.buffer);
    expect(text).toBe("Datum;Auftrag #;Stückpreis");
    expect(isSwissquoteCsv(text)).toBe(true);
  });
});

describe("ticker mapping", () => {
  const etf = csv(
    '10-06-2026 00:00:00;00000000;Dividende;VWRL;"VANGUARD FTSE ALL-WORLD";IE00B3RBWM25;10.0;0.5;0.00;0.00;5.00;USD;4.00;100.00;CHF',
    '02-03-2025 09:10:00;200000001;Kauf;VWRL;"VANGUARD FTSE ALL-WORLD";IE00B3RBWM25;10.0;120.00;9.00;0.00;-1209.00;CHF;-1209.00;500.00;CHF',
    '01-03-2025 09:10:00;200000002;Kauf;SCHH;"SCHWAB US REIT ETF";US8085248479;5.0;20.00;1.00;0.00;-101.00;USD;-101.00;100.00;USD',
  );

  it("lists each security with the currency it was traded in", () => {
    expect(swissquoteListings(etf)).toEqual([
      { symbol: "VWRL", name: "VANGUARD FTSE ALL-WORLD", isin: "IE00B3RBWM25", currency: "CHF" },
      { symbol: "SCHH", name: "SCHWAB US REIT ETF", isin: "US8085248479", currency: "USD" },
    ]);
  });

  it("puts foreign ETFs bought in CHF on SIX, and keeps dividends on the same ticker", () => {
    const { transactions } = parseSwissquoteCsv(etf);
    expect(transactions.map((t) => [t.symbol, t.type])).toEqual([
      ["SCHH", "buy"],
      ["VWRL.SW", "buy"],
      ["VWRL.SW", "dividend"],
    ]);
  });

  it("uses verified tickers when given", () => {
    const { transactions } = parseSwissquoteCsv(etf, { IE00B3RBWM25: "VWRL.L" });
    expect(transactions.filter((t) => t.symbol === "VWRL.L")).toHaveLength(2);
  });

  it("tries likely exchanges by trade currency", () => {
    expect(tickerCandidates({ symbol: "NESN", isin: "CH0038863350", currency: "CHF" })).toEqual(["NESN.SW"]);
    expect(tickerCandidates({ symbol: "AAPL", isin: "US0378331005", currency: "USD" })).toEqual(["AAPL"]);
    expect(tickerCandidates({ symbol: "SAP", isin: "DE0007164600", currency: "EUR" }).slice(0, 2)).toEqual(["SAP.DE", "SAP.F"]);
    expect(tickerCandidates({ symbol: "BTC", isin: "EX0X00XBT000", currency: "USD" })).toEqual(["BTC-USD"]);
    expect(tickerCandidates({ symbol: "4K9", isin: "CA13683D1087", currency: "EUR" })[0]).toBe("4K9.DE");
    expect(tickerCandidates({ symbol: "CSSPX", isin: "IE00B5BMR087", currency: "USD" }).slice(0, 2)).toEqual(["CSSPX.SW", "CSSPX"]);
  });

  it("picks a priced candidate, preferring the trade currency", () => {
    const quotes = {
      "VWRL.SW": { price: 155, currency: "CHF" },
      "VWRL.L": { price: 141, currency: "GBP" },
      VWRL: { price: 0, currency: "GBP" },
    };
    expect(pickTicker(["VWRL", "VWRL.L", "VWRL.SW"], quotes, "CHF")).toBe("VWRL.SW");
    expect(pickTicker(["VWRL", "VWRL.L", "VWRL.SW"], quotes, "USD")).toBe("VWRL.L");
    expect(pickTicker(["VWRL"], quotes, "GBP")).toBeUndefined();
  });
});

describe("transfers, crypto and write-offs", () => {
  const text = csv(
    "15-05-2026 17:12:07;00000000;Wertlose Ausbuchung;ABC RT;\"ABC RIGHTS\";CH0000000001;-10.0;0;0.00;0.00;-;CHF;-;;CHF",
    "12-03-2026 16:58:43;00000000;Crypto Withdrawal;SOL;\"SOL\";EX0X00SOL000;2.0;0;0.00;0.00;-;USD;-;;USD",
    "22-12-2025 16:43:38;00000000;Crypto Deposit;SOL;\"SOL\";EX0X00SOL000;5.0;0;0.00;0.00;-;USD;-;;USD",
    "23-12-2025 11:05:44;00000000;Titeleingang;D7G;\"NEL ORD\";NO0010081235;100.0;0.20;0.00;0.00;-;EUR;-;;EUR",
    "16-09-2025 07:09:33;00000000;Ausgabe von Anrechten;ABC RT;\"ABC RIGHTS\";CH0000000001;10.0;0;0.00;0.00;-;CHF;-;;CHF",
    "24-07-2025 17:17:17;00000000;Kapitalrückzahlung;SLHN;\"SWISS LIFE\";CH0014852781;1.0;30.00;0.00;0.00;30.00;CHF;30.00;100.00;CHF",
    "01-05-2022 00:00:36;111;Kauf;SOL;\"SOL\";EX0X00SOL000;1.0;100.00;1.00;0.00;-101.00;USD;-101.00;50.00;USD",
  );
  const { transactions, skipped } = parseSwissquoteCsv(text);
  const positions = buildPositions(transactions);

  it("books crypto under Yahoo's coin tickers, with deposits free and withdrawals at cost", () => {
    // 1 bought at 100 + 5 deposited free = 6 at 100 total; 2 leave at the average cost.
    expect(positions.get("SOL-USD")).toMatchObject({ quantity: 4, realized: 0 });
    expect(positions.get("SOL-USD")!.cost).toBeCloseTo((101 * 4) / 6);
  });

  it("adds shares transferred in at their stated value", () => {
    expect(positions.get("D7G.DE")).toMatchObject({ quantity: 100, cost: 20 });
  });

  it("nets subscription rights against their write-off", () => {
    expect(positions.get("ABC RT.SW")).toMatchObject({ quantity: 0 });
  });

  it("counts capital repayments as payouts", () => {
    expect(transactions.find((t) => t.symbol === "SLHN.SW")).toMatchObject({ type: "dividend", price: 30, note: "Kapitalrückzahlung" });
    expect(skipped).toEqual({});
  });
});

describe("unknown row types", () => {
  it("reports skipped rows the importer doesn't know, but not cash movements", () => {
    const odd = '01-01-2026 10:00:00;00000000;Fusion;ABC;"ABC";CH0000000002;5.0;10.00;0.00;0.00;-;CHF;-;;CHF';
    const { unknown, skipped } = parseSwissquoteCsv(
      csv(odd, "25-08-2025 00:01:44;00000000;Einzahlung;;;;1.0;683.35;0.00;0.00;683.35;CHF;683.35;862.30;CHF"),
    );
    expect(skipped).toEqual({ Fusion: 1, Einzahlung: 1 });
    expect(unknown).toEqual({ Fusion: { count: 1, example: odd } });
  });
});

describe("replacing imported data", () => {
  const manualTx = { id: "m1", symbol: "AAPL", type: "buy" as const, date: "2024-01-01", quantity: 1, price: 100, fees: 0 };
  const oldTx = { ...manualTx, id: "sq-old", symbol: "OLD.SW" };
  const manualCash = { id: "c1", name: "UBS", currency: "CHF", balance: 1000 };
  const oldCash = { id: "sq-cash-EUR", name: "Swissquote EUR", currency: "EUR", balance: 50 };
  const data = { version: 1 as const, settings: { baseCurrency: "CHF" }, transactions: [manualTx, oldTx], cash: [manualCash, oldCash] };

  it("removes everything imported, including imported cash, and keeps manual entries", () => {
    const cleaned = removeImported(data);
    expect(cleaned.transactions).toEqual([manualTx]);
    expect(cleaned.cash).toEqual([manualCash]);
  });

  it("replaces all earlier imported data on a fresh import", () => {
    const newTx = { ...manualTx, id: "sq-new", symbol: "NEW.SW" };
    const newCash = { id: "sq-cash-CHF", name: "Swissquote CHF", currency: "CHF", balance: 10 };
    const next = applyImport(data, { transactions: [newTx], cash: [newCash] });
    expect(next.transactions).toEqual([manualTx, newTx]);
    expect(next.cash).toEqual([manualCash, newCash]);
  });
});

describe("custody fees", () => {
  it("imports Depotgebühren as custody fees in the account currency", () => {
    const { transactions, skipped } = parseSwissquoteCsv(
      csv("31-12-2025 00:00:00;00000000;Depotgebühren;;;;1.0;45.00;0.00;0.00;-45.00;CHF;-45.00;955.00;CHF"),
    );
    expect(transactions.map((t) => ({ ...t, id: undefined }))).toEqual([
      { id: undefined, symbol: "", type: "fee", date: "2025-12-31", quantity: 0, price: 45, fees: 0, currency: "CHF" },
    ]);
    expect(transactions.every(isImported)).toBe(true);
    expect(skipped).toEqual({});
  });
});

describe("skipped rows", () => {
  it("leaves out card and Twint payments and cancelled corporate actions without reporting them", () => {
    const { transactions, skipped, unknown } = parseSwissquoteCsv(
      csv(
        "04-11-2022 18:23:14;00000000;Twint;;;;1.0;-150.00;0.00;0.00;-150.00;CHF;-150.00;394.75;CHF",
        '11-12-2024 16:28:43;00000000;Kartentransaktion;;"SHOP*123";;1.0;-20.00;0.00;0.00;-20.00;USD;-20.00;124.55;USD',
        '04-10-2023 04:30:26;00000000;Corporate Action (Storniert);SDZ;"SANDOZ GROUP N";CH1243598427;-5.6;0;0.00;0.00;-;;-;;',
        '04-10-2023 04:30:26;00000000;Corporate Action (Storniert);SDZ;"SANDOZ GROUP N";CH1243598427;5.6;0;0.00;0.00;-;;-;;',
      ),
    );
    expect(transactions).toEqual([]);
    expect(skipped).toEqual({ Twint: 1, Kartentransaktion: 1, "Corporate Action (Storniert)": 2 });
    expect(unknown).toEqual({});
  });
});
