import { ScheduleImporter } from "@/components/schedule-importer";

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold sm:text-4xl">Import a schedule</h1>
        <p className="mt-2 text-muted">
          Paste a conference&apos;s public schedule feed. Preview what we found, then load it into Elasticsearch.
        </p>
      </header>
      <ScheduleImporter />
    </main>
  );
}
