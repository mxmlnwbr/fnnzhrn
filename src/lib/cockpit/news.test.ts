import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { categorize, cleanName, decode } = await import("./news");

describe("categorize", () => {
  it("tags takeovers, results and analyst calls", () => {
    expect(categorize("Novartis übernimmt Avidity für 12 Milliarden")).toEqual(["mna"]);
    expect(categorize("Apple buys AI startup in deal to boost Siri")).toEqual(["mna"]);
    expect(categorize("Nestlé kauft Beteiligung an Kaffeehändler")).toEqual(["mna"]);
    expect(categorize("Pfizer to buy Metsera for $7.3bn")).toEqual(["mna"]);
    expect(categorize("Microsoft in talks to buy Nuance")).toEqual(["mna"]);
    expect(categorize("Quartalszahlen: Roche steigert Umsatz")).toEqual(["earnings"]);
    expect(categorize("UBS upgrades Nestlé to Buy, raises price target")).toEqual(["analyst"]);
    expect(categorize("Analysten stufen Zurich herab")).toEqual(["analyst"]);
  });

  it("does not tag on word fragments", () => {
    expect(categorize("3 Stocks to Buy Now Before Earnings Season")).toEqual(["earnings"]);
    expect(categorize("Best stocks to buy in October")).toEqual([]);
    expect(categorize("Why I plan to buy more Apple shares")).toEqual([]);
    expect(categorize("Operating margin improves as costs fall")).toEqual([]);
    expect(categorize("Konfusion um Zinsentscheid")).toEqual([]);
    expect(categorize("Swisscom expands fibre network")).toEqual([]);
  });
});

describe("cleanName", () => {
  it("strips the legal form", () => {
    expect(cleanName("NVIDIA Corporation")).toBe("NVIDIA");
    expect(cleanName("Nestlé S.A.")).toBe("Nestlé");
    expect(cleanName("UBS Group AG")).toBe("UBS Group");
  });
});

describe("decode", () => {
  it("decodes the entities Google News uses", () => {
    expect(decode("Barry Callebaut &amp; Lindt &#8211; Kakao &quot;teuer&quot;")).toBe('Barry Callebaut & Lindt – Kakao "teuer"');
  });
});
