/**
 * Demo memories for WS-B (idempotent): notes, ratings, a saved transcript replay, a summary, and two fictional
 * contacts across four real Tue/Wed sessions, so /report and memory search look full during the demo.
 *   npm run seed:memories              upsert the demo memories
 *   npm run seed:memories -- --reset   delete them (only source "demo-seed"; live captures stay)
 */
import { getEs } from "../src/lib/es/client";
import { resetDemoMemories, seedDemoMemories } from "../src/lib/capture/demo-memories";

async function main() {
  const es = getEs();
  if (process.argv.includes("--reset")) {
    console.log(`Deleted ${await resetDemoMemories(es)} demo memories.`);
    return;
  }
  const { saved, failed } = await seedDemoMemories(es);
  console.log(`Seeded ${saved} demo memories${failed ? `, ${failed} failed` : ""}.`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
