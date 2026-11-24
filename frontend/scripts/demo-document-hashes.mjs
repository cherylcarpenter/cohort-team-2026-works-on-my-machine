// Prints the SHA-256 of each PDF in public/demo-bills/, for lib/demo/demo-mode.ts.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../public/demo-bills/", import.meta.url);
for (const file of readdirSync(dir).filter((name) => name.endsWith(".pdf")).sort()) {
  const sha256 = createHash("sha256").update(readFileSync(new URL(file, dir))).digest("hex");
  console.log(JSON.stringify({ file, sha256 }));
}
