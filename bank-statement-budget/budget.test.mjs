import assert from "node:assert/strict";
import { buildTable } from "../free-pdf-to-excel/table.js";
import {
  applyCategories,
  cloneCategories,
  DEFAULT_CATEGORIES,
  flipAmountSign,
  FREE_TRANSACTION_LIMIT,
  positiveAmountWarning,
  spendingSlices,
  suggestCategory,
  summarize,
  visibleTransactions,
} from "./categorize.js";
import { parseAmount, parseCsv, parseDate, parseStatementRows, SAMPLE_CSV, transactionsToCsv } from "./parse.js";
import { findRecurring, merchantKey } from "./recurring.js";

function item(str, x, y, width, height = 11) {
  return { str, width, height, transform: [height, 0, 0, height, x, y] };
}

const categories = cloneCategories();
assert.equal(suggestCategory("KROGER #123", categories), "groceries");
assert.equal(suggestCategory("STARBUCKS STORE 12", categories), "dining");
assert.equal(suggestCategory("SHELL OIL 5742", categories), "gas");
assert.equal(suggestCategory("BP #12", categories), "gas");
assert.equal(suggestCategory("subpoena fee", categories), "uncategorized");
assert.equal(suggestCategory("Payroll Acme Co", categories), "income");
assert.equal(suggestCategory("Zelle to Riley", categories), "transfers");
assert.equal(suggestCategory("City Power & Light", categories), "utilities");
assert.equal(suggestCategory("Rent payment", categories), "rent");
assert.equal(suggestCategory("Amazon.com order", categories), "shopping");
assert.equal(suggestCategory("AMAZON PRIME*1A2B", categories), "subscriptions");
assert.equal(suggestCategory("NETFLIX.COM", categories), "subscriptions");
assert.equal(suggestCategory("Corner market 3", categories), "uncategorized");

const custom = cloneCategories();
custom.splice(4, 0, { id: "pets", name: "Pets", keywords: ["chewy"] });
assert.equal(suggestCategory("CHEWY.COM", custom), "pets");

const manual = applyCategories([{ description: "Kroger", amount: -10, category: "dining", manual: true }], categories);
assert.equal(manual[0].category, "dining");
const auto = applyCategories([{ description: "Kroger", amount: -10 }], categories);
assert.equal(auto[0].category, "groceries");

assert.equal(parseAmount("(12.34)"), -12.34);
assert.equal(parseAmount("-$1,234.56"), -1234.56);
assert.equal(parseAmount("40.00 DR"), -40);
assert.equal(parseAmount("40.00 CR"), 40);
assert.equal(parseDate("01/05/2026"), "2026-01-05");
assert.equal(parseDate("2026-04-02"), "2026-04-02");
assert.equal(parseDate("13/40/2026"), null);

const quoted = parseCsv('Date,Description,Amount\n01/05/2026,"Coffee, Downtown",-4.50\n01/06/2026,Kroger,"-54.20"\n');
assert.equal(quoted.transactions.length, 2);
assert.equal(quoted.transactions[0].description, "Coffee, Downtown");
assert.equal(quoted.transactions[0].amount, -4.5);
assert.equal(quoted.transactions[0].date, "2026-01-05");
assert.equal(quoted.transactions[1].amount, -54.2);

const split = parseCsv("Date,Memo,Debit,Credit\n2026-01-02,Paycheck,,1500.00\n2026-01-03,Shell,40.00,\n");
assert.deepEqual(split.transactions.map((tx) => tx.amount), [1500, -40]);
const splitCats = applyCategories(split.transactions, categories);
assert.equal(splitCats[0].category, "income");
assert.equal(splitCats[1].category, "gas");

const sample = applyCategories(parseCsv(SAMPLE_CSV).transactions, categories);
assert.ok(sample.length > FREE_TRANSACTION_LIMIT);
assert.equal(visibleTransactions(sample, false).length, 50);
assert.equal(visibleTransactions(sample, true).length, sample.length);
assert.equal(sample.find((tx) => tx.description === "Netflix.com").category, "subscriptions");
assert.equal(sample.find((tx) => tx.description === "Kroger").category, "groceries");
assert.equal(sample.find((tx) => tx.description.startsWith("Corner market")).category, "uncategorized");
assert.equal(positiveAmountWarning(sample), "");
assert.match(positiveAmountWarning([{ amount: 5 }, { amount: 8 }]), /Positive amounts/);

const flipped = flipAmountSign([{ amount: 12.5, description: "Store" }]);
assert.equal(flipped[0].amount, -12.5);

const recurring = findRecurring(sample);
const labels = recurring.map((row) => row.label.toLowerCase());
assert.ok(labels.some((label) => label.includes("netflix")));
assert.ok(labels.some((label) => label.includes("spotify")));
assert.ok(labels.some((label) => label.includes("rent")));
assert.equal(labels.some((label) => label.includes("starbucks")), false);
assert.equal(merchantKey("NETFLIX.COM 866-579-7172"), merchantKey("Netflix.com"));

const summary = summarize(visibleTransactions(sample, false), categories);
assert.equal(summary.count, 50);
assert.ok(summary.moneyIn > 0);
assert.ok(summary.moneyOut < 0);
assert.equal(summary.net, Math.round((summary.moneyIn + summary.moneyOut + summary.transfers) * 100) / 100);
const slices = spendingSlices(visibleTransactions(sample, false), categories);
assert.equal(slices.some((slice) => slice.id === "transfers"), false);
assert.ok(slices.some((slice) => slice.id === "groceries"));

const csv = transactionsToCsv([{ date: "2026-01-01", description: "=cmd", amount: -5, category: "shopping" }], DEFAULT_CATEGORIES);
assert.match(csv, /'=cmd/);
assert.match(csv, /Shopping/);

const pdf = buildTable([{
  pageNumber: 1,
  items: [
    item("Date", 40, 700, 28),
    item("Details", 120, 700, 40),
    item("Debit", 280, 700, 30),
    item("Credit", 360, 700, 36),
    item("Balance", 460, 700, 46),
    item("2026-04-02", 40, 678, 62),
    item("Client payment", 120, 678, 80),
    item("150.00", 360, 678, 36),
    item("650.00", 460, 678, 36),
    item("2026-04-03", 40, 656, 62),
    item("Fuel", 120, 656, 24),
    item("42.15", 280, 656, 30),
    item("607.85", 460, 656, 36),
  ],
}]);
const fromPdf = applyCategories(parseStatementRows(pdf.rows).transactions, categories);
assert.deepEqual(fromPdf.map((tx) => [tx.description, tx.amount, tx.category]), [
  ["Client payment", 150, "uncategorized"],
  ["Fuel", -42.15, "gas"],
]);
