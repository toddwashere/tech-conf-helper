import Link from "next/link";
import { Suspense } from "react";
import { PlanBoard } from "./plan-board";

const DEFAULT_DAY = "2026-11-10";

async function PlanFromParams({ searchParams }: { searchParams: PageProps<"/plan">["searchParams"] }) {
  const params = await searchParams;
  const day = typeof params.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? params.day : DEFAULT_DAY;
  const at = typeof params.at === "string" ? params.at : null;
  return <PlanBoard day={day} at={at} />;
}

export default function PlanPage({ searchParams }: PageProps<"/plan">) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <Link href="/" className="text-sm font-medium uppercase tracking-wider text-accent hover:underline">
          ← Conference Memory
        </Link>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">My plan</h1>
        <p className="mt-2 text-muted">Every slot has a Plan A and ranked backups. If a room fills up, we reroute you.</p>
      </header>
      <Suspense fallback={<p className="text-muted">Loading your plan…</p>}>
        <PlanFromParams searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
