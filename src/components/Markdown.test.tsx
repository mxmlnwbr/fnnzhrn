import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />);

describe("Markdown", () => {
  it("renders tables, lists and inline formatting", () => {
    const out = html("**Depot**\n\n| Titel | Wert |\n| --- | ---: |\n| NESN | 1 000 CHF |\n\n- eins\n- `zwei`");
    expect(out).toContain("<strong>Depot</strong>");
    expect(out).toContain("<th");
    expect(out).toContain("NESN</td>");
    expect(out).toContain("<ul");
    expect(out).toContain("<code");
  });

  it("escapes HTML instead of rendering it", () => {
    expect(html("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });

  it("only links http(s) URLs", () => {
    expect(html("[a](https://x.ch)")).toContain('href="https://x.ch"');
    expect(html("[a](javascript:alert(1))")).not.toContain("href");
  });
});
