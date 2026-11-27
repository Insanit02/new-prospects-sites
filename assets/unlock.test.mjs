import assert from "node:assert/strict";
import { TOOLS, isPlaceholder } from "./tools-config.js";
import {
  clearUnlock,
  interpretLicenseCheck,
  isUnlocked,
  licenseKeyFormatOk,
  normalizeLicenseKey,
  readUnlock,
  storageKey,
  verifyLicense,
} from "./unlock.js";

const KEY = "AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD";
const BANK = "bank-statement-budget";

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

function purchase(extra = {}) {
  return {
    success: true,
    purchase: {
      email: "buyer@example.com",
      refunded: false,
      disputed: false,
      chargebacked: false,
      quantity: 1,
      ...extra,
    },
  };
}

assert.equal(licenseKeyFormatOk(" aaaaaaaa-bbbbbbbb-cccccccc-dddddddd "), true);
assert.equal(licenseKeyFormatOk("short"), false);
assert.equal(normalizeLicenseKey(" ab "), "AB");

assert.equal(TOOLS[BANK].productId, "7b88MYfSEWRkfYEzZCmDvg==");
assert.equal(TOOLS[BANK].checkoutUrl, "https://prospectify0.gumroad.com/l/bank-statement-budget-pro");
assert.equal(TOOLS[BANK].priceUsd, 9);
assert.equal(TOOLS["wedding-seating-chart"].productId, "e_jffjVOzqBYN7LBbZN0OA==");
assert.equal(TOOLS["wedding-seating-chart"].checkoutUrl, "https://prospectify0.gumroad.com/l/wedding-seating-chart-pro");
assert.equal(TOOLS["wedding-seating-chart"].perEvent, true);
assert.equal(TOOLS["wedding-seating-chart"].priceUsd, 5);
assert.equal(TOOLS["holiday-card-addresses"].productId, "Ss5btifrQmWB9vONScShFA==");
assert.equal(TOOLS["holiday-card-addresses"].checkoutUrl, "https://prospectify0.gumroad.com/l/holiday-address-labels-pro");
assert.equal(TOOLS["holiday-card-addresses"].priceUsd, 5);
assert.equal(TOOLS["holiday-card-addresses"].perEvent, false);
assert.equal(isPlaceholder(TOOLS["holiday-card-addresses"].productId), false);

const params = new URLSearchParams({
  product_id: TOOLS[BANK].productId,
  license_key: KEY,
  increment_uses_count: "false",
});
assert.equal(params.get("product_id"), "7b88MYfSEWRkfYEzZCmDvg==");
assert.equal(params.get("increment_uses_count"), "false");
assert.equal(params.toString().includes("increment_uses_count=false"), true);
assert.equal(params.toString().includes("%3D%3D"), true);

assert.equal(interpretLicenseCheck({ productId: TOOLS[BANK].productId, licenseKey: "nope", outcome: { kind: "result", body: purchase() } }).unlock, false);

const confirmed = interpretLicenseCheck({ productId: TOOLS[BANK].productId, licenseKey: KEY, outcome: { kind: "result", body: purchase({ quantity: 2 }) } });
assert.equal(confirmed.unlock, true);
assert.equal(confirmed.verifiedWithGumroad, true);
assert.equal(confirmed.quantity, 2);
assert.equal(JSON.stringify(confirmed).includes("buyer@example.com"), false);

assert.equal(interpretLicenseCheck({
  productId: TOOLS[BANK].productId,
  licenseKey: KEY,
  outcome: { kind: "result", body: { success: false, message: "That license does not exist for the provided product." } },
}).unlock, false);

for (const body of [
  purchase({ refunded: true }),
  purchase({ chargebacked: true }),
  purchase({ disputed: true, dispute_won: false }),
  purchase({ subscription_ended_at: "2026-01-01" }),
]) {
  assert.equal(interpretLicenseCheck({ productId: TOOLS[BANK].productId, licenseKey: KEY, outcome: { kind: "result", body } }).unlock, false);
}

assert.equal(interpretLicenseCheck({
  productId: TOOLS[BANK].productId,
  licenseKey: KEY,
  outcome: { kind: "result", body: purchase({ disputed: true, dispute_won: true }) },
}).unlock, true);

const fallback = interpretLicenseCheck({ productId: TOOLS[BANK].productId, licenseKey: KEY, outcome: { kind: "network" } });
assert.equal(fallback.unlock, true);
assert.equal(fallback.verifiedWithGumroad, false);
assert.match(fallback.message, /not confirm/i);

assert.equal(interpretLicenseCheck({ productId: "REPLACE_WITH_ID", licenseKey: KEY, outcome: { kind: "network" } }).unlock, false);

const store = memory();
let seenBody = "";
const saved = await verifyLicense(BANK, KEY, {
  store,
  fetch: async (_url, options) => {
    seenBody = options.body.toString();
    return { status: 200, json: async () => purchase() };
  },
});
assert.equal(saved.unlock, true);
assert.equal(seenBody.includes("increment_uses_count=false"), true);
assert.equal(seenBody.includes("product_id=7b88MYfSEWRkfYEzZCmDvg%3D%3D"), true);
const record = readUnlock(BANK, store);
assert.equal(record.verifiedWithGumroad, true);
assert.equal(record.productId, TOOLS[BANK].productId);
assert.equal(JSON.stringify(record).includes("buyer@example.com"), false);
assert.equal(isUnlocked(BANK, store), true);

const rejected = memory();
const no = await verifyLicense(BANK, KEY, {
  store: rejected,
  fetch: async () => ({ status: 404, json: async () => ({ success: false, message: "That license does not exist for the provided product." }) }),
});
assert.equal(no.unlock, false);
assert.equal(isUnlocked(BANK, rejected), false);

const offline = memory();
const soft = await verifyLicense(BANK, KEY, {
  store: offline,
  fetch: async () => { throw new TypeError("Failed to fetch"); },
});
assert.equal(soft.unlock, true);
assert.equal(soft.verifiedWithGumroad, false);
assert.equal(readUnlock(BANK, offline).source, "format-fallback");

let called = false;
const bad = await verifyLicense(BANK, "not-a-key", {
  store: memory(),
  fetch: async () => { called = true; return { status: 200, json: async () => purchase() }; },
});
assert.equal(called, false);
assert.equal(bad.unlock, false);

clearUnlock(BANK, store);
assert.equal(isUnlocked(BANK, store), false);

const stale = memory();
stale.setItem(storageKey(BANK), JSON.stringify({
  unlocked: true,
  licenseKey: KEY,
  verifiedWithGumroad: true,
  source: "gumroad",
  productId: "different-product",
}));
assert.equal(readUnlock(BANK, stale), null);

const holidayStore = memory();
let holidayBody = "";
const holidaySaved = await verifyLicense("holiday-card-addresses", KEY, {
  store: holidayStore,
  fetch: async (_url, options) => {
    holidayBody = options.body.toString();
    return { status: 200, json: async () => purchase() };
  },
});
assert.equal(holidaySaved.unlock, true);
assert.equal(holidaySaved.verifiedWithGumroad, true);
assert.equal(holidayBody.includes("product_id=Ss5btifrQmWB9vONScShFA%3D%3D"), true);
assert.equal(holidayBody.includes("increment_uses_count=false"), true);
assert.equal(readUnlock("holiday-card-addresses", holidayStore).productId, TOOLS["holiday-card-addresses"].productId);
