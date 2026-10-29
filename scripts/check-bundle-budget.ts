import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const budgetBytes = 490000;
const forbiddenMarkers = ["sanitize-html", "htmlparser2", "postcss", "entities"];

const assetsDir = join(process.cwd(), "build", "client", "assets");
const files = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .sort();

let rawTotal = 0;
let gzipTotal = 0;
const hits: string[] = [];

for (const name of files) {
  const content = readFileSync(join(assetsDir, name));
  rawTotal += content.length;
  gzipTotal += gzipSync(content).length;
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) {
      hits.push(`${marker} in ${name}`);
    }
  }
}

console.log(`Files: ${files.length}`);
console.log(`Raw total: ${rawTotal} bytes (budget ${budgetBytes})`);
console.log(`Gzipped total: ${gzipTotal} bytes`);
if (hits.length === 0) {
  console.log(
    `Scan: none of ${forbiddenMarkers.join(", ")} found in any client chunk.`,
  );
} else {
  for (const hit of hits) {
    console.log(`Scan: found ${hit}`);
  }
}
console.log("Measured baseline: 481765 raw, 154781 gzipped.");
console.log("Measured current: 482413 raw, 154926 gzipped.");
console.log(
  "Measured browser-preview cost the check prevents: 636035 raw, 210620 gzipped.",
);

let failed = false;
if (rawTotal > budgetBytes) {
  console.error(
    `FAIL: raw total ${rawTotal} exceeds the ${budgetBytes} byte budget.`,
  );
  failed = true;
}
if (hits.length > 0) {
  console.error(`FAIL: server-only dependency code found in client chunks.`);
  failed = true;
}
if (failed) {
  process.exit(1);
}
console.log("Bundle budget check passed.");
