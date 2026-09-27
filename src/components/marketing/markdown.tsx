// Trình hiển thị Markdown tối giản, an toàn (không dùng HTML thô):
// ## tiêu đề, **đậm**, *nghiêng*, [link](url), danh sách "- " / "1. ", đoạn văn.
import type { ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("[")) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      const href = /^(https?:\/\/|\/|mailto:)/i.test(mm[2]) ? mm[2] : "#";
      const ext = href.startsWith("http");
      out.push(
        <a
          key={k}
          href={href}
          className="text-primary underline underline-offset-2"
          {...(ext ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {mm[1]}
        </a>,
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let b = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const k = `b${b++}`;
      const cls = h[1].length === 1 ? "text-2xl" : h[1].length === 2 ? "text-xl" : "text-lg";
      blocks.push(
        <h2 key={k} className={`mt-6 font-semibold tracking-tight ${cls}`}>
          {inline(h[2], k)}
        </h2>,
      );
      i++;
      continue;
    }
    const isUl = /^\s*[-*]\s+/.test(line);
    const isOl = /^\s*\d+\.\s+/.test(line);
    if (isUl || isOl) {
      const items: string[] = [];
      const re = isUl ? /^\s*[-*]\s+/ : /^\s*\d+\.\s+/;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ""));
      const k = `b${b++}`;
      const lis = items.map((it, j) => <li key={j}>{inline(it, `${k}-${j}`)}</li>);
      blocks.push(
        isUl ? (
          <ul key={k} className="ml-5 list-disc space-y-1">
            {lis}
          </ul>
        ) : (
          <ol key={k} className="ml-5 list-decimal space-y-1">
            {lis}
          </ol>
        ),
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+\.\s)/.test(lines[i]))
      para.push(lines[i++]);
    const k = `b${b++}`;
    blocks.push(
      <p key={k} className="leading-7">
        {inline(para.join(" "), k)}
      </p>,
    );
  }
  return <div className={`grid gap-3 ${className}`}>{blocks}</div>;
}
