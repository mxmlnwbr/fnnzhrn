import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IOS_APP_ID } from "./app-links";

describe("IOS_APP_ID", () => {
  it("matches the team and bundle id in mobile/app.json", () => {
    const { ios } = JSON.parse(readFileSync(new URL("../../mobile/app.json", import.meta.url), "utf8")).expo;
    expect(IOS_APP_ID).toBe(`${ios.appleTeamId}.${ios.bundleIdentifier}`);
    expect(readFileSync(new URL("../../mobile/app.config.ts", import.meta.url), "utf8")).toContain('"webcredentials:fnnzhrn.ch"');
  });
});
