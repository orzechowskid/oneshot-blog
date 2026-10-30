import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const rawCeilingBytes = 490000;
const gzipCeilingBytes = 160000;
const adminEditRawCeilingBytes = 60000;
const adminEditChunkPattern = /^admin-edit-.*\.js$/;
const forbiddenMarkers = ["sanitize-html", "htmlparser2", "postcss", "entities"];

const assetsDir = join(process.cwd(), "build", "client", "assets");
const files = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .sort();
const cssFiles = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".css"))
  .sort();

let rawTotal = 0;
let gzipTotal = 0;
let cssTotal = 0;
const hits: string[] = [];
const chunks: { name: string; raw: number; gzipped: number }[] = [];

for (const name of cssFiles) {
  cssTotal += readFileSync(join(assetsDir, name)).length;
}

for (const name of files) {
  const content = readFileSync(join(assetsDir, name));
  const gzipped = gzipSync(content).length;
  rawTotal += content.length;
  gzipTotal += gzipped;
  chunks.push({ name, raw: content.length, gzipped });
  for (const marker of forbiddenMarkers) {
    if (content.includes(marker)) {
      hits.push(`${marker} in ${name}`);
    }
  }
}

const adminEditChunks = chunks.filter((chunk) =>
  adminEditChunkPattern.test(chunk.name),
);
const largestAdminEdit = adminEditChunks.reduce<
  { name: string; raw: number; gzipped: number } | null
>((max, chunk) => (max === null || chunk.raw > max.raw ? chunk : max), null);

console.log(`Files: ${files.length}`);
console.log(
  `Current: ${rawTotal} bytes raw (ceiling ${rawCeilingBytes}), ${gzipTotal} bytes gzipped (ceiling ${gzipCeilingBytes}).`,
);
console.log("Per-chunk sizes, raw and gzipped, largest first:");
for (const chunk of [...chunks].sort((a, b) => b.raw - a.raw)) {
  console.log(
    `  ${chunk.name}: ${chunk.raw} bytes raw, ${chunk.gzipped} bytes gzipped`,
  );
}
if (largestAdminEdit) {
  for (const chunk of adminEditChunks) {
    console.log(`admin-edit chunk: ${chunk.name} is ${chunk.raw} bytes raw.`);
  }
  console.log(
    `admin-edit chunk: largest is ${largestAdminEdit.name} at ${largestAdminEdit.raw} bytes raw (ceiling ${adminEditRawCeilingBytes}).`,
  );
} else {
  console.log("admin-edit chunk: not present in this build.");
}
console.log(
  `CSS is out of scope for this check: ${cssTotal} bytes across ${cssFiles.length} files.`,
);
if (hits.length === 0) {
  console.log(
    `Scan (advisory, never fails the build): none of ${forbiddenMarkers.join(", ")} found in any client chunk.`,
  );
} else {
  for (const hit of hits) {
    console.log(`Scan (advisory, never fails the build): found ${hit}`);
  }
}
console.log(
  "Scan stays advisory: minification drops package names, and entities is an ordinary English word.",
);

let failed = false;
if (rawTotal > rawCeilingBytes) {
  console.error(
    `FAIL: raw total ${rawTotal} exceeds the ${rawCeilingBytes} byte ceiling.`,
  );
  failed = true;
}
if (gzipTotal > gzipCeilingBytes) {
  console.error(
    `FAIL: gzipped total ${gzipTotal} exceeds the ${gzipCeilingBytes} byte ceiling.`,
  );
  failed = true;
}
if (
  largestAdminEdit &&
  largestAdminEdit.raw > adminEditRawCeilingBytes
) {
  console.error(
    `FAIL: admin-edit chunk ${largestAdminEdit.name} at ${largestAdminEdit.raw} bytes raw exceeds the ${adminEditRawCeilingBytes} byte ceiling.`,
  );
  failed = true;
}
if (failed) {
  process.exit(1);
}
console.log("Bundle budget check passed.");
