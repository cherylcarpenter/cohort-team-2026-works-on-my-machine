import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEMO_DOCUMENTS, demoDocumentGuard, isAllowedDemoDocument, isDemoMode } from "./demo-mode";

const fixturesDir = new URL("../invoices/__fixtures__/", import.meta.url);
const publicDir = new URL("../../public/demo-bills/", import.meta.url);
const readFixture = (file: string) => new Uint8Array(readFileSync(new URL(file, fixturesDir)));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const ALLOWED_SLUGS = ["alder-creek", "brightwater", "copper-ridge"];
const OTHER_FIXTURES = [
  "cedar-valley", "harborlight", "maple-junction", "northline", "prairie-grid", "summit-trail", "sunmeadow",
].map((slug) => `${slug}-bill.pdf`);
const ALLOWED_FILES = ALLOWED_SLUGS.map((slug) => `${slug}-bill.pdf`);
const REJECTION = { error: "This demo only accepts the sample bills." };

test("isDemoMode is true only for the exact string \"true\"", () => {
  assert.equal(isDemoMode({ DEMO_MODE: "true" }), true);
  for (const value of [undefined, "", "false", "TRUE", "1"]) {
    assert.equal(isDemoMode({ DEMO_MODE: value }), false, String(value));
  }
  assert.equal(isDemoMode({}), false);
});

test("DEMO_DOCUMENTS lists exactly the three sample bills", () => {
  assert.deepEqual(DEMO_DOCUMENTS.map((d) => d.slug), ALLOWED_SLUGS);
  for (const doc of DEMO_DOCUMENTS) {
    assert.equal(doc.file, `${doc.slug}-bill.pdf`);
    assert.ok(doc.label && doc.amount, doc.slug);
    assert.match(doc.sha256, /^[0-9a-f]{64}$/, doc.slug);
  }
});

test("isAllowedDemoDocument accepts the three sample bills", async () => {
  for (const file of ALLOWED_FILES) assert.equal(await isAllowedDemoDocument(readFixture(file)), true, file);
});

test("isAllowedDemoDocument rejects the other seven fixtures", async () => {
  for (const file of OTHER_FIXTURES) assert.equal(await isAllowedDemoDocument(readFixture(file)), false, file);
});

test("isAllowedDemoDocument rejects a one-byte change and empty bytes", async () => {
  const tampered = readFixture("alder-creek-bill.pdf").slice();
  tampered[tampered.length - 1] ^= 0xff;
  assert.equal(await isAllowedDemoDocument(tampered), false);
  assert.equal(await isAllowedDemoDocument(new Uint8Array()), false);
});

test("demoDocumentGuard passes everything when demo mode is off", async () => {
  const random = new Uint8Array([1, 2, 3, 4, 5]);
  assert.equal(await demoDocumentGuard(random, {}), null);
  assert.equal(await demoDocumentGuard(random, { DEMO_MODE: "false" }), null);
  assert.equal(await demoDocumentGuard(readFixture("cedar-valley-bill.pdf"), { DEMO_MODE: "TRUE" }), null);
});

test("demoDocumentGuard passes allowed bills in demo mode", async () => {
  for (const file of ALLOWED_FILES) {
    assert.equal(await demoDocumentGuard(readFixture(file), { DEMO_MODE: "true" }), null, file);
  }
});

test("demoDocumentGuard returns 403 JSON for other bytes in demo mode", async () => {
  for (const bytes of [readFixture("cedar-valley-bill.pdf"), new Uint8Array([1, 2, 3]), new Uint8Array()]) {
    const response = await demoDocumentGuard(bytes, { DEMO_MODE: "true" });
    assert.ok(response instanceof Response);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), REJECTION);
  }
});

test("each DEMO_DOCUMENTS hash matches both the public copy and the fixture", () => {
  for (const doc of DEMO_DOCUMENTS) {
    const publicCopy = new Uint8Array(readFileSync(new URL(doc.file, publicDir)));
    assert.equal(sha256(publicCopy), doc.sha256, `public/demo-bills/${doc.file}`);
    assert.equal(sha256(readFixture(doc.file)), doc.sha256, `__fixtures__/${doc.file}`);
  }
});
