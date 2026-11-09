import { Fragment, type ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-surface-2 px-1">
          {part.slice(1, -1)}
        </code>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Just enough Markdown for agent answers: headings, bullets, bold, inline code. */
export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1.5 leading-relaxed">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return null;
        if (/^#{1,4}\s/.test(t)) return <p key={i} className="mt-2 font-semibold">{inline(t.replace(/^#+\s/, ""))}</p>;
        if (/^([-*]|\d+\.)\s/.test(t))
          return (
            <p key={i} className="pl-4 -indent-3">
              • {inline(t.replace(/^([-*]|\d+\.)\s/, ""))}
            </p>
          );
        return <p key={i}>{inline(t)}</p>;
      })}
    </div>
  );
}
