import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { accountMonth, accountSpend } = await import("./account");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("accountSpend", () => {
  it("adds the Cost Report's earlier days and prices today from the Usage Report", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00Z"), toFake: ["Date"] });
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        urls.push(url);
        if (url.pathname.endsWith("/cost_report"))
          return Response.json({
            data: [
              { starting_at: "2026-10-01T00:00:00Z", results: [{ amount: "60" }, { amount: "16" }] },
              { starting_at: "2026-10-26T00:00:00Z", results: [] },
            ],
            has_more: false,
            next_page: null,
          });
        return Response.json({
          data: [
            {
              results: [
                {
                  model: "claude-haiku-5-5",
                  uncached_input_tokens: 1_000_000,
                  output_tokens: 0,
                  cache_read_input_tokens: 0,
                  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
                },
              ],
            },
          ],
        });
      }),
    );
    const spend = await accountSpend("u1", "sk-ant-admin-test");
    expect(spend.before).toBeCloseTo(0.76);
    expect(spend.today).toBeCloseTo(0.1);
    expect(urls[0].searchParams.get("starting_at")).toBe("2026-10-01T00:00:00.000Z");
    // Only complete days: a range reaching into the future isn't asked for.
    expect(urls[0].searchParams.get("ending_at")).toBe("2026-10-27T00:00:00.000Z");
  });

  it("only asks the Usage Report on the 1st, when the month has no complete day yet", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T08:00:00Z"), toFake: ["Date"] });
    const fetch = vi.fn<(url: URL) => Promise<Response>>(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    expect(await accountSpend("u3", "sk-ant-admin-test")).toEqual({ before: 0, today: 0 });
    expect(fetch.mock.calls.map(([url]) => url.pathname)).toEqual(["/v1/organizations/usage_report/messages"]);
  });

  it("passes on what Anthropic says is wrong with a request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "error", error: { type: "invalid_request_error", message: "ending_at must not be in the future" } }, { status: 400 })));
    await expect(accountSpend("u4", "sk-ant-admin-test")).rejects.toThrow("Anthropic antwortet mit 400: ending_at must not be in the future");
  });

  it("explains a key Anthropic doesn't accept", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 401 })));
    await expect(accountSpend("u2", "sk-ant-admin-bad")).rejects.toThrow("Admin-Key");
  });
});

describe("accountMonth", () => {
  it("counts today by whichever is higher, the reports or fnnzhrn's own answers", () => {
    expect(accountMonth({ before: 1, today: 0.2 }, 0.5)).toBeCloseTo(1.5);
    expect(accountMonth({ before: 1, today: 0.7 }, 0.5)).toBeCloseTo(1.7);
  });
});
