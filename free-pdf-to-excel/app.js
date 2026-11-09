import * as pdfjsLib from "../assets/vendor/pdfjs/pdf.min.mjs";
import { buildTable, toCsv } from "./table.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../assets/vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PAGES = 25;
const PREVIEW_ROWS = 200;

const els = {
  file: document.getElementById("pdf-file"),
  drop: document.getElementById("drop"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  result: document.getElementById("result"),
  heading: document.getElementById("result-heading"),
  summary: document.getElementById("summary"),
  warnings: document.getElementById("warnings"),
  preview: document.getElementById("preview"),
  csv: document.getElementById("download-csv"),
  xlsx: document.getElementById("download-xlsx"),
  clear: document.getElementById("clear"),
  xlsxMissing: document.getElementById("xlsx-missing"),
};

let runId = 0;
let current = null;

if (!globalThis.XLSX) {
  els.xlsx.hidden = true;
  els.xlsxMissing.hidden = false;
}

els.file.addEventListener("change", () => {
  const file = els.file.files && els.file.files[0];
  els.file.value = "";
  if (file) handleFile(file, false);
});

els.drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.drop.classList.add("over");
});
els.drop.addEventListener("dragleave", () => els.drop.classList.remove("over"));
els.drop.addEventListener("drop", (event) => {
  event.preventDefault();
  els.drop.classList.remove("over");
  const files = event.dataTransfer && event.dataTransfer.files;
  if (files && files[0]) handleFile(files[0], files.length > 1);
});

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

els.csv.addEventListener("click", () => {
  if (!current) return;
  downloadBlob(`${current.name}.csv`, new Blob([toCsv(current.rows)], { type: "text/csv;charset=utf-8" }));
});
els.xlsx.addEventListener("click", () => {
  if (!current) return;
  try {
    downloadBlob(`${current.name}.xlsx`, rowsToXlsxBlob(current.rows));
  } catch (error) {
    showError("The Excel file could not be built in this browser. Download the CSV instead. Your PDF was not uploaded.");
    console.error(error);
  }
});
els.clear.addEventListener("click", () => {
  runId += 1;
  clearResult();
  setStatus("Cleared. The PDF and the table are no longer held in this tab.");
  els.file.focus();
});

async function handleFile(file, extraFiles) {
  const id = ++runId;
  clearResult();
  showError("");
  if (file.size > MAX_BYTES) {
    showError("That PDF is over 15 MB. This free tool stops there so the browser stays responsive. For a longer file, use the paid conversion below.");
    return;
  }
  setStatus(extraFiles
    ? "Reading the first PDF in this browser. Extra files were ignored."
    : "Reading the PDF in this browser. It is not uploaded.");
  document.body.setAttribute("aria-busy", "true");
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (id !== runId) return;
    if (!isPdf(bytes)) {
      showError("That file does not look like a PDF. Choose a .pdf file. Nothing was uploaded.");
      setStatus("");
      return;
    }
    const pages = await readPages(bytes, id);
    if (id !== runId || !pages) return;
    const table = buildTable(pages);
    if (!table.rows.length) {
      showError("No selectable text was found. This usually means the PDF is a scan or a photo of a page. This free tool cannot read those. Email us about a paid conversion and we will tell you what we can and cannot do before you send the file.");
      setStatus("");
      return;
    }
    current = { name: downloadName(file.name), rows: table.rows };
    renderResult(table, pages.length);
  } catch (error) {
    if (id !== runId) return;
    showError(messageFor(error));
    setStatus("");
    console.error(error);
  } finally {
    if (id === runId) document.body.removeAttribute("aria-busy");
  }
}

async function readPages(bytes, id) {
  const doc = await pdfjsLib.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableRange: true,
    disableStream: true,
  }).promise;
  try {
    if (doc.numPages > MAX_PAGES) {
      throw Object.assign(new Error("too many pages"), { code: "too-many-pages" });
    }
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (id !== runId) return null;
      setStatus(`Reading page ${n} of ${doc.numPages} in this browser. The file is not uploaded.`);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ pageNumber: n, items: content.items });
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

function renderResult(table, pageCount) {
  const columnCount = table.rows.reduce((max, row) => Math.max(max, row.length), 0) - 1;
  const shown = Math.min(PREVIEW_ROWS, table.rows.length);
  const countNote = shown < table.rows.length
    ? `${table.rows.length} rows from ${pageCount} page${pageCount === 1 ? "" : "s"}, ${columnCount} column${columnCount === 1 ? "" : "s"} besides the Page column. Showing the first ${shown} rows. The download includes every row.`
    : `${table.rows.length} row${table.rows.length === 1 ? "" : "s"} from ${pageCount} page${pageCount === 1 ? "" : "s"}, ${columnCount} column${columnCount === 1 ? "" : "s"} besides the Page column. Check the preview before you download.`;
  els.summary.textContent = `${countNote} Scroll the table sideways to see every column.`;

  els.warnings.replaceChildren();
  for (const warning of table.warnings) {
    const li = document.createElement("li");
    li.textContent = warning;
    els.warnings.appendChild(li);
  }
  els.warnings.hidden = table.warnings.length === 0;

  const tableEl = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = "Extracted text. Page numbers are added by this tool.";
  tableEl.appendChild(caption);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (let c = 0; c < columnCount + 1; c++) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = c === 0 ? "Page" : `Column ${c}`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  tableEl.appendChild(thead);
  const tbody = document.createElement("tbody");
  for (const row of table.rows.slice(0, PREVIEW_ROWS)) {
    const tr = document.createElement("tr");
    for (let c = 0; c < columnCount + 1; c++) {
      const td = document.createElement("td");
      td.textContent = row[c] || "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tableEl.appendChild(tbody);
  els.preview.replaceChildren(tableEl);
  els.result.hidden = false;
  els.csv.disabled = false;
  els.xlsx.disabled = !globalThis.XLSX;
  setStatus("Done. The table is only in this tab.");
  els.heading.focus();
}

function rowsToXlsxBlob(rows) {
  const XLSX = globalThis.XLSX;
  if (!XLSX) throw new Error("SheetJS did not load");
  const ws = {};
  let maxC = 0;
  rows.forEach((row, r) => {
    row.forEach((value, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value == null ? "" : String(value) };
      if (c > maxC) maxC = c;
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(rows.length - 1, 0), c: maxC },
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PDF text");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function clearResult() {
  current = null;
  els.result.hidden = true;
  els.preview.replaceChildren();
  els.warnings.replaceChildren();
  els.summary.textContent = "";
  els.csv.disabled = true;
  els.xlsx.disabled = true;
}

function setStatus(text) {
  els.status.textContent = text;
}

function showError(text) {
  els.error.textContent = text;
  els.error.hidden = !text;
}

function isPdf(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function downloadName(filename) {
  const base = String(filename || "converted").replace(/^.*[/\\]/, "").replace(/\.pdf$/i, "");
  const clean = base.replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/\s+/g, "-");
  return clean || "converted";
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function messageFor(error) {
  const name = error && error.name;
  if (name === "PasswordException" || (error && error.code === 1)) {
    return "This PDF is password-protected. The free tool does not open locked files, and you should not email us the password. The paid service needs an unlocked text-based PDF. Your file was not uploaded.";
  }
  if (error && error.code === "too-many-pages") {
    return `This PDF has more than ${MAX_PAGES} pages. The free tool stops there. For a longer file, use the paid conversion below. Your file was not uploaded.`;
  }
  if (name === "InvalidPDFException") {
    return "This file could not be read as a PDF. Nothing was uploaded.";
  }
  return "This PDF could not be read in the browser. Nothing was uploaded. If it is a scan or an unusual file, use the paid service and we will say what we can and cannot do before you send it.";
}
