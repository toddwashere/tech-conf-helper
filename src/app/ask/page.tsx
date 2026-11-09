import { AskChat } from "./ask-chat";

export const metadata = { title: "Ask · Conference Memory" };

export default function AskPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
      <header className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">Conference Copilot</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Ask your conference</h1>
        <p className="mt-2 text-muted">
          An Elastic Agent Builder agent with ES|QL, search, and workflow tools over the schedule, your plan, live room
          signals, and everything you captured.
        </p>
      </header>
      <AskChat />
    </main>
  );
}
