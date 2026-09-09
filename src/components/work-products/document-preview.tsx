// Bản xem trước theo trang: hiển thị đúng mẫu trình bày sẽ dùng khi xuất tệp.
import { useMemo } from "react";
import { parseContentBlocks, parseInlineRuns, type DocBlock } from "@/domain/work-products/office-engine";
import { officeTemplateFor } from "@/domain/work-products/office-templates";
import { cn } from "@/lib/utils";

function Runs({ text }: { text: string }) {
  return (
    <>
      {parseInlineRuns(text).map((run, i) => (
        <span
          key={i}
          className={cn(run.bold && "font-semibold", run.italic && "italic", run.underline && "underline")}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}

function Block({ block, accent }: { block: DocBlock; accent: string }) {
  if (block.kind === "heading") {
    const size = block.level === 1 ? "text-2xl" : block.level === 2 ? "text-xl" : "text-lg";
    return (
      <h2 className={cn("mt-6 font-heading font-semibold", size)} style={{ color: `#${accent}` }}>
        <Runs text={block.text} />
      </h2>
    );
  }
  if (block.kind === "bullet")
    return (
      <li className="ml-5 list-disc leading-8">
        <Runs text={block.text} />
      </li>
    );
  if (block.kind === "numbered")
    return (
      <div className="ml-5 flex gap-2 leading-8">
        <span className="tabular-nums text-muted-foreground">{block.index}.</span>
        <span>
          <Runs text={block.text} />
        </span>
      </div>
    );
  if (block.kind === "quote")
    return (
      <blockquote className="my-3 border-l-4 pl-4 italic text-muted-foreground" style={{ borderColor: `#${accent}` }}>
        <Runs text={block.text} />
      </blockquote>
    );
  if (block.kind === "table")
    return (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={cn("border px-3 py-2 align-top", r === 0 && "font-semibold text-primary-foreground")}
                    style={r === 0 ? { backgroundColor: `#${accent}` } : undefined}
                  >
                    <Runs text={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (block.kind === "pagebreak") return null;
  return (
    <p className="leading-8">
      <Runs text={block.text} />
    </p>
  );
}

export function DocumentPreview({
  title,
  content,
  businessType,
  version,
}: {
  title: string;
  content: string;
  businessType: string;
  version: number;
}) {
  const template = useMemo(() => officeTemplateFor(businessType), [businessType]);
  const pages = useMemo(() => {
    const out: DocBlock[][] = [[]];
    for (const b of parseContentBlocks(content)) {
      if (b.kind === "pagebreak") out.push([]);
      else out[out.length - 1].push(b);
    }
    return out;
  }, [content]);

  return (
    <div className="space-y-6">
      {template.cover && (
        <article className="mx-auto w-full max-w-[820px] overflow-hidden border bg-card shadow-sm">
          <div className="px-10 py-14 text-primary-foreground" style={{ backgroundColor: `#${template.accent}` }}>
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">{template.header}</p>
            <h1 className="mt-4 font-heading text-4xl font-semibold">{title}</h1>
          </div>
          <p className="px-10 py-6 text-sm text-muted-foreground">
            {template.label} · v{version}
          </p>
        </article>
      )}

      {pages.map((blocks, i) => (
        <article key={i} className="mx-auto w-full max-w-[820px] border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-10 py-3 text-[11px] text-muted-foreground">
            <span>{template.header}</span>
            <span>
              {template.label} · v{version}
            </span>
          </div>
          <div className="min-h-[640px] space-y-1 px-10 py-10 text-[15px]">
            {!template.cover && i === 0 && (
              <>
                <span className="mb-4 block h-1 w-12" style={{ backgroundColor: `#${template.accent}` }} />
                <h1 className="font-heading text-3xl font-semibold">{title}</h1>
              </>
            )}
            {blocks.map((b, bi) => (
              <Block key={bi} block={b} accent={template.accent} />
            ))}
          </div>
          <div className="flex items-center justify-between border-t px-10 py-3 text-[11px] text-muted-foreground">
            <span>{template.footer}</span>
            <span>
              {i + 1}/{pages.length}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
