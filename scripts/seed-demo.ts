/**
 * Demo data for WS-A (idempotent).
 *   npm run seed:demo                 demo plan for Tue Nov 10 + simulated room-signals history
 *   npm run seed:demo -- --reset      clear the plan and app-written signals (keeps simulated history)
 *   npm run seed:demo -- --reset --all  also clear simulated history
 */
import { getEs } from "../src/lib/es/client";
import { DEMO_PLAN, resetDemo, seedDemoPlan, seedSimulatedSignals } from "../src/lib/plan/demo";

async function main() {
  const es = getEs();
  const args = new Set(process.argv.slice(2));
  if (args.has("--reset")) {
    await resetDemo(es, { simulated: args.has("--all") });
    console.log(`Cleared the plan and ${args.has("--all") ? "all" : "app-written"} room signals.`);
    return;
  }
  const docs = await seedDemoPlan(es);
  console.log(`Demo plan: ${docs.length} choices across ${DEMO_PLAN.length} slots on Tue Nov 10.`);
  const signals = await seedSimulatedSignals(es);
  console.log(`Simulated room-signals history: ${signals} docs (source: "simulated").`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
