import { SessionSearch } from "@/components/session-search";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">Conference Memory</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Find the right talk</h1>
        <p className="mt-2 text-muted">
          KubeCon + CloudNativeCon North America 2026. Search by keyword or by meaning.
        </p>
      </header>
      <SessionSearch />
    </main>
  );
}
