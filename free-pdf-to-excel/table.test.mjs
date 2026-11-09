import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildTable, toCsv } from "./table.js";

function item(str, x, y, width, height = 11) {
  return { str, width, height, transform: [height, 0, 0, height, x, y] };
}

function cells(rows) {
  return rows.map((row) => row.slice(1));
}

const simple = buildTable([{
  pageNumber: 1,
  items: [
    item("Invoice INV-100", 50, 730, 160, 14),
    item("Date", 50, 700, 24),
    item("Description", 140, 700, 70),
    item("Qty", 340, 700, 20),
    item("Amount", 420, 700, 42),
    item("2026-03-01", 50, 678, 62),
    item("Lawn mowing", 140, 678, 68),
    item("1", 340, 678, 8),
    item("85.00", 420, 678, 30),
    item("2026-03-08", 50, 656, 62),
    item("Hedge trim", 140, 656, 54),
    item("2", 340, 656, 8),
    item("140.00", 420, 656, 36),
  ],
}]);
assert.deepEqual(cells(simple.rows), [
  ["Invoice INV-100", "", "", ""],
  ["Date", "Description", "Qty", "Amount"],
  ["2026-03-01", "Lawn mowing", "1", "85.00"],
  ["2026-03-08", "Hedge trim", "2", "140.00"],
]);
assert.deepEqual(simple.rows.map((row) => row[0]), ["1", "1", "1", "1"]);

const words = [];
const sentence = ["This", "is", "a", "normal", "paragraph", "about", "a", "visit"];
sentence.forEach((word, i) => words.push(item(word, 50 + i * 46, 700, 40)));
const paragraph = buildTable([{ pageNumber: 1, items: words }]);
assert.equal(paragraph.rows.length, 1);
assert.equal(paragraph.rows[0][1], sentence.join(" "));
assert.equal(paragraph.rows[0].length, 2);

const wide = "Date        Item        85.00";
const wideTable = buildTable([{
  pageNumber: 1,
  items: [item(wide, 50, 700, wide.length * 6, 11)],
}]);
assert.deepEqual(cells(wideTable.rows), [["Date", "Item", "85.00"]]);

const aligned = buildTable([{
  pageNumber: 1,
  items: [
    item("Description", 50, 700, 70),
    item("Amount", 400, 700, 42),
    item("Fuel", 50, 678, 24),
    item("5.00", 442, 678, 28),
    item("Spring cleanup", 50, 656, 90),
    item("140.00", 418, 656, 42),
  ],
}]);
assert.deepEqual(cells(aligned.rows), [
  ["Description", "Amount"],
  ["Fuel", "5.00"],
  ["Spring cleanup", "140.00"],
]);

const blanks = buildTable([{
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
assert.deepEqual(cells(blanks.rows)[1], ["2026-04-02", "Client payment", "", "150.00", "650.00"]);
assert.deepEqual(cells(blanks.rows)[2], ["2026-04-03", "Fuel", "42.15", "", "607.85"]);

const jitter = buildTable([{
  pageNumber: 1,
  items: [
    item("Date", 50, 700, 24),
    item("Amount", 200, 699.4, 42),
    item("2026-03-01", 50, 678.2, 62),
    item("85.00", 200, 678, 30),
  ],
}]);
assert.deepEqual(cells(jitter.rows), [
  ["Date", "Amount"],
  ["2026-03-01", "85.00"],
]);

const mixed = buildTable([
  { pageNumber: 1, items: [item("Only", 40, 700, 30), item("Two", 160, 700, 30)] },
  { pageNumber: 2, items: [item("Alpha", 40, 700, 36), item("Beta", 160, 700, 30), item("Gamma", 280, 700, 40)] },
]);
assert.equal(mixed.rows[0][0], "1");
assert.equal(mixed.rows[1][0], "2");
assert.ok(mixed.warnings.some((warning) => warning.includes("same number of columns")));
assert.equal(mixed.rows[0].length, mixed.rows[1].length);

const rotated = buildTable([{
  pageNumber: 3,
  items: [
    { str: "SIDEWAYS", width: 40, height: 11, transform: [0, 11, -11, 0, 40, 400] },
    item("Kept", 80, 700, 30),
  ],
}]);
assert.deepEqual(rotated.rows, [["3", "Kept"]]);
assert.equal(rotated.rotatedSkipped, 1);
assert.ok(rotated.warnings.some((warning) => warning.includes("sideways")));

const empty = buildTable([
  { pageNumber: 1, items: [] },
  { pageNumber: 2, items: [item("Hello", 50, 700, 40)] },
]);
assert.deepEqual(empty.emptyPages, [1]);
assert.equal(empty.rows.length, 1);

const dup = buildTable([{
  pageNumber: 1,
  items: [item("Date", 50, 700, 24), item("Date", 50.2, 700.1, 24), item("Amount", 180, 700, 42)],
}]);
assert.deepEqual(cells(dup.rows), [["Date", "Amount"]]);

const csv = toCsv([
  ["a,b", 'say "hi"', "=2+2", "-42.15", "-hello", "+1", "@cmd", "ok"],
]);
assert.equal(csv, '\uFEFF"a,b","say ""hi""",\'=2+2,-42.15,\'-hello,\'+1,\'@cmd,ok\r\n');

function pdfEscape(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfText(lines) {
  return `BT\n/F1 11 Tf\n${lines.map(([x, y, text]) => `1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj`).join("\n")}\nET`;
}

function buildPdf(pageStreams) {
  const objs = [];
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const kids = [];
  let id = 4;
  for (const stream of pageStreams) {
    const pageId = id++;
    const contentId = id++;
    kids.push(`${pageId} 0 R`);
    const data = Buffer.from(stream, "latin1");
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objs[contentId] = data;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageStreams.length} >>`;

  const chunks = [Buffer.from("%PDF-1.4\n")];
  const offsets = [0];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const body = objs[i];
    if (Buffer.isBuffer(body)) {
      chunks.push(Buffer.from(`${i} 0 obj\n<< /Length ${body.length} >>\nstream\n`));
      chunks.push(body);
      chunks.push(Buffer.from("\nendstream\nendobj\n"));
    } else {
      chunks.push(Buffer.from(`${i} 0 obj\n${body}\nendobj\n`));
    }
  }
  const startxref = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`));
  return Buffer.concat(chunks);
}

const pdfjs = await import("../assets/vendor/pdfjs/pdf.min.mjs");
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../assets/vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
const samplePdf = buildPdf([
  pdfText([
    [50, 730, "Sample invoice INV-100"],
    [50, 700, "Date"],
    [140, 700, "Description"],
    [340, 700, "Qty"],
    [420, 700, "Amount"],
    [50, 678, "2026-03-01"],
    [140, 678, "Lawn mowing"],
    [340, 678, "1"],
    [420, 678, "85.00"],
    [50, 656, "2026-03-08"],
    [140, 656, "Hedge trim"],
    [340, 656, "2"],
    [420, 656, "140.00"],
  ]),
  pdfText([
    [50, 730, "Page two"],
    [50, 700, "Date"],
    [140, 700, "Description"],
    [340, 700, "Qty"],
    [420, 700, "Amount"],
    [50, 678, "2026-03-15"],
    [140, 678, "Spring cleanup"],
    [340, 678, "1"],
    [420, 678, "220.00"],
  ]),
]);

const doc = await pdfjs.getDocument({ data: new Uint8Array(samplePdf), disableWorker: true, isEvalSupported: false, verbosity: 0 }).promise;
const pages = [];
for (let n = 1; n <= doc.numPages; n++) {
  const page = await doc.getPage(n);
  const content = await page.getTextContent();
  pages.push({ pageNumber: n, items: content.items });
}
await doc.destroy();
const extracted = buildTable(pages);
const body = cells(extracted.rows);
const mowing = body.find((row) => row.includes("Lawn mowing"));
const cleanup = body.find((row) => row.includes("Spring cleanup"));
assert.ok(mowing, "expected Lawn mowing row");
assert.equal(mowing[3], "85.00");
assert.notEqual(mowing.indexOf("Lawn mowing"), mowing.indexOf("85.00"));
assert.ok(cleanup, "expected Spring cleanup row");
assert.equal(cleanup[3], "220.00");
assert.equal(extracted.rows.find((row) => row.includes("Lawn mowing"))[0], "1");
assert.equal(extracted.rows.find((row) => row.includes("Spring cleanup"))[0], "2");
assert.ok(body.some((row) => row[0] === "Date" && row[1] === "Description" && row[3] === "Amount"));

const pageSource = readFileSync(new URL("./index.html", import.meta.url), "utf8");
for (const phrase of [
  "Your PDF never leaves this browser",
  "not uploaded",
  "pdf-to-excel-conversion/",
  "newestprospects@gmail.com",
  "no client reviews",
  "Fiverr from $20",
  "PeoplePerHour from $20",
]) {
  assert.ok(pageSource.includes(phrase), `page missing: ${phrase}`);
}

console.log("table tests passed");
