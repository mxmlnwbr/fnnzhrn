import { describe, expect, it } from "vitest";
import { previousClose } from "./previous-close";

const CET = 3600e3;
// Daily candles stamped at the session open, 09:00 Zurich.
const at = (date: string) => Date.parse(`${date}T08:00:00Z`);

describe("previousClose", () => {
  const pts: [number, number][] = [
    [at("2026-11-10"), 15037.94],
    [at("2026-11-11"), 15053.86],
    [at("2026-11-12"), 15149.43],
  ];

  it("skips back over a missing close for today", () => {
    // During the session of the 13th Yahoo has no candle with a close for it yet.
    expect(previousClose(pts, Date.parse("2026-11-13T11:00:00Z"), CET)).toBe(15149.43);
  });

  it("skips today's candle when it has a close", () => {
    const withToday: [number, number][] = [...pts, [at("2026-11-13"), 15106.12]];
    expect(previousClose(withToday, Date.parse("2026-11-13T16:30:00Z"), CET)).toBe(15149.43);
  });

  it("uses the exchange's day, not UTC's", () => {
    // 00:30 in Tokyo on the 13th is still the 12th in UTC.
    const tokyo: [number, number][] = [[Date.parse("2026-11-11T00:00:00Z"), 1], [Date.parse("2026-11-12T00:00:00Z"), 2]];
    expect(previousClose(tokyo, Date.parse("2026-11-12T06:00:00Z"), 9 * 3600e3)).toBe(1);
  });

  it("is null without an earlier day", () => {
    expect(previousClose([[at("2026-11-13"), 1]], Date.parse("2026-11-13T12:00:00Z"), CET)).toBeNull();
  });
});
