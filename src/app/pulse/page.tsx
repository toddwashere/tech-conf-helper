import { PulseView } from "./pulse-view";

export const metadata = { title: "Conference pulse · Conference Memory" };

export default function PulsePage() {
  const kibana = process.env.KIBANA_URL ?? "http://localhost:5601";
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">Conference pulse</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">The conference, in aggregations</h1>
        <p className="mt-2 text-muted">
          Live Elasticsearch aggregations: terms, a Mountain-time <code>date_histogram</code>, room signals from a
          time-series data stream, and <code>significant_terms</code> on what you chose versus everyone.{" "}
          <a className="text-accent underline" href={`${kibana}/app/dashboards#/view/conference-pulse`}>
            Open the Kibana dashboard
          </a>
          .
        </p>
      </header>
      <PulseView />
    </main>
  );
}
