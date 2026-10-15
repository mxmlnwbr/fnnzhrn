import { describe, expect, it } from "vitest";
import { safeNext } from "./next-path";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/depot")).toBe("/depot");
    expect(safeNext("/cockpit?x=1")).toBe("/cockpit?x=1");
    expect(safeNext(["/depot", "/cockpit"])).toBe("/depot");
  });

  it("falls back for anything that could leave the site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", undefined]) expect(safeNext(bad)).toBe("/");
  });
});
