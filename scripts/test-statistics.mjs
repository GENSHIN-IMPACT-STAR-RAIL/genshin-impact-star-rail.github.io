import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "..", "src", "statistics");
function find(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? find(join(directory, entry.name))
      : entry.name.endsWith(".test.ts")
        ? [join(directory, entry.name)]
        : [],
  );
}
const files = find(root).sort();
if (!files.length) throw new Error("No statistics tests found");
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...files],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
