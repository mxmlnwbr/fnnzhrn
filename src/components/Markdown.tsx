import type { ReactNode } from "react";

/** Bold, italics, inline code and links within a line. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k} className="rounded bg-zinc-100 px-1 text-[0.9em] dark:bg-zinc-800">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const [, label, href] = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(
        <a key={k} href={href} target="_blank" rel="noreferrer" className="text-emerald-700 underline dark:text-emerald-400">
          {label}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/**
 * The Markdown the assistant writes: paragraphs, headings, lists, tables, code blocks and inline
 * formatting. Rendered as React elements, never as HTML, so nothing in an answer can run.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith("```")) {
      const body: string[] = [];
      for (i++; i < lines.length && !lines[i].startsWith("```"); i++) body.push(lines[i]);
      i++;
      blocks.push(
        <pre key={key} className="overflow-x-auto rounded-md bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
          {body.join("\n")}
        </pre>,
      );
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(
        <p key={key} className="font-semibold">
          {inline(line.replace(/^#+\s*/, ""), key)}
        </p>,
      );
      i++;
    } else if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? "") && lines[i + 1].includes("-")) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]));
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700">
                {head.map((h, j) => (
                  <th key={j} className="px-2 py-1 font-semibold whitespace-nowrap">
                    {inline(h, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, j) => (
                <tr key={j} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                  {r.map((c, k) => (
                    <td key={k} className="px-2 py-1 tabular-nums">
                      {inline(c, `${key}r${j}c${k}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      for (; i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i]); i++) items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key} className={`space-y-0.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}-${j}`)}</li>
          ))}
        </List>,
      );
    } else {
      const para: string[] = [];
      for (; i < lines.length && lines[i].trim() && !/^(```|#{1,6}\s|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i]); i++) para.push(lines[i]);
      if (!para.length) para.push(lines[i++]);
      blocks.push(
        <p key={key}>
          {para.flatMap((p, j) => (j ? [<br key={`br${j}`} />, ...inline(p, `${key}-${j}`)] : inline(p, `${key}-${j}`)))}
        </p>,
      );
    }
  }
  return <div className="space-y-2">{blocks}</div>;
}
