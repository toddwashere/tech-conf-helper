import { DEFAULT_CONFERENCE } from "../src/lib/conference";
import { getEs } from "../src/lib/es/client";
import { importSessionize } from "../src/lib/import/run";

async function main() {
  const urls = process.argv.slice(2);
  const result = await importSessionize(
    getEs(),
    (urls.length ? urls : [...DEFAULT_CONFERENCE.feeds]).map((url) => ({ url })),
    { conference: DEFAULT_CONFERENCE.id, timeZone: DEFAULT_CONFERENCE.timeZone },
    (done, total) => console.log(`[import] embedded ${done}/${total} sessions`),
  );
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
