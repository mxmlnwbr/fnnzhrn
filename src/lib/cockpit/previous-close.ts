const DAY = 864e5;

/**
 * The last close of a day before the one the price is from. Not simply the second-to-last candle: while a
 * session runs Yahoo often has no close for today yet, and then that candle is the day before yesterday.
 */
export function previousClose(pts: [number, number][], priceTime: number, gmtOffset: number): number | null {
  const day = (t: number) => Math.floor((t + gmtOffset) / DAY);
  const today = day(priceTime);
  for (let k = pts.length - 1; k >= 0; k--) if (day(pts[k][0]) < today) return pts[k][1];
  return null;
}
