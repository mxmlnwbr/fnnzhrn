import { describe, expect, it } from "vitest";
import { buildPositions } from "./portfolio";
import { isImported, tickerCandidates } from "./swissquote";
import { isYuhCsv, parseYuhCsv, yuhListings } from "./yuh";

const HEADER =
  "DATE;ACTIVITY TYPE;ACTIVITY NAME;DEBIT;DEBIT CURRENCY;CREDIT;CREDIT CURRENCY;CARD NUMBER;LOCALITY;RECIPIENT;SENDER;FEES/COMMISSION;BUY/SELL;QUANTITY;ASSET;PRICE PER UNIT";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

const BUY_GEBERIT = '28/04/2025;INVEST_RECURRING_ORDER_EXECUTED;"""0,4452x Geberit""";-251.47;CHF;;;;;;;1.45;BUY;0.4452;GEBN;561.6';
const BUY_KO = '28/04/2025;INVEST_ORDER_EXECUTED;"""2x Coca-Cola""";-140.00;USD;;;;;;;1.00;BUY;2;KO;69.5';

describe("isYuhCsv", () => {
  it("recognises the activity export", () => {
    expect(isYuhCsv(csv())).toBe(true);
    expect(isYuhCsv("Datum;Auftrag #;Transaktionen")).toBe(false);
  });
});

describe("parseYuhCsv", () => {
  it("imports buys and sells with their fees", () => {
    const { transactions } = parseYuhCsv(
      csv(BUY_GEBERIT, '24/06/2025;INVEST_ORDER_EXECUTED;"""0,4452x Geberit""";;;248.97;CHF;;;;;1.05;SELL;0.4452;GEBN;561.6'),
      { GEBN: "GEBN.SW" },
    );
    expect(transactions.map((t) => ({ ...t, id: undefined }))).toEqual([
      { id: undefined, symbol: "GEBN.SW", type: "buy", date: "2025-04-28", quantity: 0.4452, price: 561.6, fees: 1.45 },
      { id: undefined, symbol: "GEBN.SW", type: "sell", date: "2025-06-24", quantity: 0.4452, price: 561.6, fees: 1.05 },
    ]);
    expect(transactions.every(isImported)).toBe(true);
  });

  it("books dividends gross, with the withholding tax as fees, matched by name", () => {
    const { transactions } = parseYuhCsv(
      csv(BUY_KO, '01/05/2025;CASH_TRANSACTION_RELATED_OTHER;"""Coca-Cola Dividende""";;;13.86;USD;;;;;5.94;;;;'),
    );
    expect(transactions[1]).toMatchObject({ symbol: "KO", type: "dividend", date: "2025-05-01", price: 19.8, fees: 5.94 });
  });

  it("skips cash rows and reports dividends it can't place", () => {
    const { transactions, skipped, unknown } = parseYuhCsv(
      csv(
        '31/03/2025;PAYMENT_TRANSACTION_OUT;"""Twint an X""";-50.00;CHF;;;;;"""X""";;0;;;;',
        "06/04/2025;REWARD_RECEIVED;\"\"\"Kartenbonus\"\"\";;;;;;;;;;;1;SWQ;",
        '22/04/2025;BANK_ORDER_EXECUTED;"""Umtausch von Schweizer Franken""";;;1209.66;USD;;;;;11.60;;1000;CHF;1.209658',
        '01/05/2025;CASH_TRANSACTION_RELATED_OTHER;"""Visa Dividende""";;;1.00;USD;;;;;0.43;;;;',
      ),
    );
    expect(transactions).toEqual([]);
    expect(skipped).toMatchObject({ PAYMENT_TRANSACTION_OUT: 1, REWARD_RECEIVED: 1, BANK_ORDER_EXECUTED: 1 });
    expect(Object.keys(unknown)).toEqual(["Dividend of a security without trades"]);
  });

  it("leaves out share swaps that cancel out, but warns when trades don't add up to them", () => {
    const swap = (q: string) => `14/09/2026;SECURITIES_TRANSACTION_OTHER;"""${q} Coca-Cola Wertpapiertransaktionen""";;;0.00;USD;;;;;0;;;;`;
    const complete = parseYuhCsv(csv(BUY_KO, swap("-2"), swap("2")));
    expect(complete.transactions).toHaveLength(1);
    expect(complete.warnings).toEqual([]);
    expect(complete.unknown).toEqual({});

    const partial = parseYuhCsv(csv(BUY_KO, swap("-24,9538"), swap("24,9538")));
    expect(partial.warnings).toHaveLength(1);
    expect(partial.warnings![0]).toMatch(/^KO: 24.9538 shares were held on 2026-09-14/);
  });

  it("books a one-sided share movement", () => {
    const { transactions } = parseYuhCsv(
      csv(BUY_KO, '14/09/2026;SECURITIES_TRANSACTION_OTHER;"""-2 Coca-Cola Wertpapiertransaktionen""";;;0.00;USD;;;;;0;;;;'),
    );
    // Shares leave at their average cost, fees included.
    expect(transactions[1]).toMatchObject({ type: "sell", quantity: 2, price: 70 });
    expect(buildPositions(transactions).get("KO")?.quantity).toBe(0);
  });
});

describe("yuhListings", () => {
  it("lists each ticker with its name and trade currency", () => {
    expect(yuhListings(csv(BUY_GEBERIT, BUY_KO))).toEqual([
      { symbol: "GEBN", name: "Geberit", isin: "", currency: "CHF" },
      { symbol: "KO", name: "Coca-Cola", isin: "", currency: "USD" },
    ]);
  });

  it("guesses the exchange from the trade currency", () => {
    expect(tickerCandidates({ symbol: "GEBN", isin: "", currency: "CHF" })).toEqual(["GEBN.SW", "GEBN"]);
    expect(tickerCandidates({ symbol: "INFR", isin: "", currency: "USD" })).toEqual(["INFR", "INFR.SW"]);
  });
});
