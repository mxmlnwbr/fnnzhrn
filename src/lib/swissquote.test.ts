import { describe, expect, it } from "vitest";
import { buildPositions } from "./portfolio";
import { decodeText, isSwissquoteCsv, parseSwissquoteCsv } from "./swissquote";

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
