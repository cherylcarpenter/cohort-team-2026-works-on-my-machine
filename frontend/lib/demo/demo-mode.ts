import { DEMO_BILLS, demoBillOptions } from "./demo-bills";

export { demoBillOptions };

export type DemoDocument = { slug: string; file: string; label: string; amount: string; sha256: string };

// Hashes come from `node scripts/demo-document-hashes.mjs`.
const hashes: Record<string, string> = {
  "alder-creek": "e829c200b0bed4b1b58b8a62a1a353e28c303555cd7542df02ab69122af92537",
  brightwater: "d19061f36e73992230eb60ae9d9c932c0cf28b3a0407b06b5d4d09a45d4750b6",
  "copper-ridge": "3d93521cd49e3e69e324265b2cd0b02c063cd14808bf87cab161403efb5952a1",
};

export const DEMO_DOCUMENTS: readonly DemoDocument[] = DEMO_BILLS.map(({ slug, label, amount }) => ({
  slug, file: `${slug}-bill.pdf`, label, amount, sha256: hashes[slug],
}));

export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "true";
}

export async function isAllowedDemoDocument(bytes: Uint8Array): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return DEMO_DOCUMENTS.some((doc) => doc.sha256 === hex);
}

export async function demoDocumentGuard(
  bytes: Uint8Array,
  env: Record<string, string | undefined> = process.env,
): Promise<Response | null> {
  if (!isDemoMode(env) || await isAllowedDemoDocument(bytes)) return null;
  return Response.json({ error: "This demo only accepts the sample bills." }, { status: 403 });
}
