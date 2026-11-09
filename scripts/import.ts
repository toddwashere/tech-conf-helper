import { DEFAULT_CONFERENCE } from "../src/lib/conference";
import { getEs } from "../src/lib/es/client";
import { importSessionize } from "../src/lib/import/run";

async function main() {
  const urls = process.argv.slice(2);
  const result = await importSessionize(
    getEs(),
    (urls.length ? urls : [...DEFAULT_CONFERENCE.feeds]).map((url) => ({ url })),
    { conference: DEFAULT_CONFERENCE.id, timeZone: DEFAULT_CONFERENCE.timeZone },
    (p) => console.log(`[import] ${p.phase} ${p.done}/${p.total}`),
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
