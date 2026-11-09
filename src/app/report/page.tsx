import { MemorySearch } from "@/components/capture/memory-search";
import { TripReportView } from "@/components/capture/trip-report-view";

export default function ReportPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">Trip report</p>
        <h1 className="mt-2 text-3xl font-semibold">What you took home</h1>
        <p className="mt-2 text-muted">Summaries, notes, ratings, and people you met, by day. Built from your memories in Elasticsearch.</p>
      </header>
      <div className="mb-8">
        <MemorySearch />
      </div>
      <TripReportView />
    </main>
  );
}
