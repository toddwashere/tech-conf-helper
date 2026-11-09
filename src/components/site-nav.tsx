import Link from "next/link";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/plan", label: "My plan" },
  { href: "/ask", label: "Ask" },
  { href: "/pulse", label: "Pulse" },
  { href: "/report", label: "Report" },
  { href: "/import", label: "Import" },
];

export function SiteNav() {
  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-4 overflow-x-auto px-4 py-3 text-sm">
        <Link href="/" className="shrink-0 font-semibold text-accent">
          Conference Memory
        </Link>
        <ul className="flex gap-1">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="whitespace-nowrap rounded-md px-3 py-1.5 text-muted hover:bg-surface hover:text-foreground">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
