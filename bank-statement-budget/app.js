import * as pdfjsLib from "../assets/vendor/pdfjs/pdf.min.mjs";
import { buildTable } from "../free-pdf-to-excel/table.js";
import { isUnlocked, mountLicenseBox } from "../assets/unlock.js";
import { drawBars, drawPie } from "./chart.js";
import {
  applyCategories,
  cloneCategories,
  flipAmountSign,
  positiveAmountWarning,
  spendingSlices,
  summarize,
  visibleTransactions,
  FREE_TRANSACTION_LIMIT,
} from "./categorize.js";
import { parseCsv, parseStatementRows, SAMPLE_CSV, transactionsToCsv } from "./parse.js";
import { findRecurring } from "./recurring.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../assets/vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const TOOL_ID = "bank-statement-budget";
const CATEGORY_KEY = "np-budget-categories";
const MAX_CSV = 5 * 1024 * 1024;
const MAX_PDF = 15 * 1024 * 1024;
const MAX_PAGES = 25;

const els = {
  file: document.getElementById("statement-file"),
  drop: document.getElementById("drop"),
  sample: document.getElementById("sample"),
  clear: document.getElementById("clear"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  result: document.getElementById("result"),
  heading: document.getElementById("result-heading"),
  summary: document.getElementById("summary-mount"),
  categories: document.getElementById("category-mount"),
  table: document.getElementById("table-mount"),
  positive: document.getElementById("positive-spend"),
};

let runId = 0;
let all = [];
let categories = loadCategories();
let fileLabel = "";
let warnings = [];
let lastCharts = null;

mountLicenseBox(document.getElementById("unlock"), {
  toolId: TOOL_ID,
  onChange() {
    if (isUnlocked(TOOL_ID)) {
      const saved = readSavedCategories();
      if (saved) categories = saved;
    }
    if (all.length) {
      renderCategories();
      renderResults();
    }
  },
});

els.sample.addEventListener("click", () => {
  ingest(parseCsv(SAMPLE_CSV), "Sample statement (made-up)", []);
});
els.clear.addEventListener("click", () => {
  runId += 1;
  all = [];
  fileLabel = "";
  warnings = [];
  lastCharts = null;
  els.result.hidden = true;
  els.summary.replaceChildren();
  els.categories.replaceChildren();
  els.table.replaceChildren();
  showError("");
  setStatus("Cleared. The statement is no longer held in this tab.");
});
els.positive.addEventListener("change", () => {
  if (all.length) renderResults();
});
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
window.addEventListener("resize", () => paintCharts());

if (new URLSearchParams(location.search).get("demo") === "1") {
  els.sample.click();
}

function loadCategories() {
  if (!isUnlocked(TOOL_ID)) return cloneCategories();
  return readSavedCategories() || cloneCategories();
}

function readSavedCategories() {
  try {
    const raw = localStorage.getItem(CATEGORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.some((category) => category.id === "uncategorized")) return null;
    return parsed.slice(0, 24).map((category) => ({
      id: String(category.id || "").slice(0, 40),
      name: String(category.name || "Category").slice(0, 40),
      keywords: Array.isArray(category.keywords) ? category.keywords.map((keyword) => String(keyword).slice(0, 40)).slice(0, 30) : [],
    }));
  } catch {
    return null;
  }
}

function categorizedRows() {
  const source = els.positive.checked ? flipAmountSign(all) : all.map((tx) => ({ ...tx }));
  return applyCategories(source.map((tx, index) => ({
    ...tx,
    category: all[index].category,
    manual: all[index].manual === true,
  })), categories);
}

function renderCategories() {
  const pro = isUnlocked(TOOL_ID);
  const wrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Categories";
  wrap.appendChild(title);
  const note = document.createElement("p");
  note.className = "note";
  note.textContent = pro
    ? "Edit names and keywords, then apply them. Save keeps the list in this browser. Transactions are not saved."
    : "You can edit keywords for this visit. Saving the list on this device is part of Pro.";
  wrap.appendChild(note);

  categories.forEach((category, index) => {
    const row = document.createElement("div");
    row.className = "cat-row";
    const name = document.createElement("input");
    name.value = category.name;
    name.setAttribute("aria-label", `Category name ${index + 1}`);
    name.addEventListener("input", () => {
      categories[index].name = name.value.slice(0, 40);
    });
    const keywords = document.createElement("input");
    keywords.value = category.keywords.join(", ");
    keywords.placeholder = "Keywords, separated by commas";
    keywords.setAttribute("aria-label", `Keywords for ${category.name}`);
    if (category.id === "uncategorized") keywords.disabled = true;
    keywords.addEventListener("input", () => {
      categories[index].keywords = keywords.value.split(",").map((part) => part.trim()).filter(Boolean).slice(0, 30);
    });
    row.append(name, keywords);
    if (category.id !== "uncategorized") {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn line";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        categories.splice(index, 1);
        all.forEach((tx) => {
          if (tx.category === category.id) tx.manual = false;
        });
        renderCategories();
        renderResults();
      });
      row.appendChild(remove);
    }
    wrap.appendChild(row);
  });

  const actions = document.createElement("div");
  actions.className = "actions";
  const add = document.createElement("button");
  add.type = "button";
  add.className = "btn line";
  add.textContent = "Add category";
  add.addEventListener("click", () => {
    const id = `custom-${Date.now()}`;
    categories.splice(Math.max(categories.length - 1, 0), 0, { id, name: "New category", keywords: [] });
    renderCategories();
  });
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn";
  apply.textContent = "Apply categories";
  apply.addEventListener("click", () => renderResults());
  const save = document.createElement("button");
  save.type = "button";
  save.className = "btn line";
  save.textContent = "Save categories on this device";
  save.disabled = !pro;
  save.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) {
      showError("Saving categories is part of Pro. The list still applies for this visit.");
      return;
    }
    localStorage.setItem(CATEGORY_KEY, JSON.stringify(categories));
    setStatus("Categories saved in this browser. Transactions were not saved.");
  });
  actions.append(add, apply, save);
  wrap.appendChild(actions);
  els.categories.replaceChildren(wrap);
}

function renderResults() {
  const pro = isUnlocked(TOOL_ID);
  const rows = categorizedRows();
  const visible = visibleTransactions(rows, pro);
  const hidden = rows.length - visible.length;
  const summary = summarize(visible, categories);
  const slices = spendingSlices(visible, categories);
  const recurring = findRecurring(visible);
  const signWarning = positiveAmountWarning(els.positive.checked ? flipAmountSign(all) : all);

  const mount = document.createElement("div");
  const lead = document.createElement("p");
  lead.textContent = hidden
    ? `${fileLabel}: ${rows.length} transactions. The free summary uses the first ${FREE_TRANSACTION_LIMIT}. ${hidden} more ${hidden === 1 ? "is" : "are"} hidden until Pro is unlocked.`
    : `${fileLabel}: ${rows.length} transaction${rows.length === 1 ? "" : "s"}.`;
  mount.appendChild(lead);

  if (warnings.length || signWarning) {
    const list = document.createElement("ul");
    [...warnings, signWarning].filter(Boolean).forEach((warning) => {
      const li = document.createElement("li");
      li.textContent = warning;
      list.appendChild(li);
    });
    mount.appendChild(list);
  }

  const stats = document.createElement("div");
  stats.className = "stats";
  [
    ["Money in", money(summary.moneyIn)],
    ["Money out", money(summary.moneyOut)],
    ["Transfers", money(summary.transfers)],
    ["Net", money(summary.net)],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat";
    const name = document.createElement("span");
    name.className = "note";
    name.textContent = label;
    const strong = document.createElement("b");
    strong.textContent = value;
    card.append(name, strong);
    stats.appendChild(card);
  });
  mount.appendChild(stats);

  const charts = document.createElement("div");
  charts.className = "chart-grid";
  charts.append(chartCard("Spending by category", "pie"), chartCard("Spending by month", "bars"));
  mount.appendChild(charts);
  const chartNote = document.createElement("p");
  chartNote.className = "note";
  chartNote.textContent = "The same numbers are in the tables. Transfers and income are left off the spending chart.";
  mount.appendChild(chartNote);

  mount.appendChild(heading("Monthly summary"));
  mount.appendChild(monthlyTable(summary.months));
  mount.appendChild(heading("Possible recurring charges"));
  mount.appendChild(recurringList(recurring));
  const tableWrap = document.createElement("div");
  tableWrap.appendChild(heading("Transactions"));
  tableWrap.appendChild(transactionTable(visible));

  const actions = document.createElement("div");
  actions.className = "actions";
  const csv = document.createElement("button");
  csv.type = "button";
  csv.className = "btn";
  csv.textContent = "Download CSV";
  csv.disabled = !pro;
  csv.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    download("budget.csv", new Blob([transactionsToCsv(rows, categories)], { type: "text/csv;charset=utf-8" }));
  });
  const xlsx = document.createElement("button");
  xlsx.type = "button";
  xlsx.className = "btn line";
  xlsx.textContent = "Download Excel (.xlsx)";
  xlsx.disabled = !pro || !globalThis.XLSX;
  xlsx.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    try {
      download("budget.xlsx", rowsToXlsx(rows));
    } catch (error) {
      showError("Excel could not be built in this browser. CSV still works if Pro is on.");
      console.error(error);
    }
  });
  actions.append(csv, xlsx);
  tableWrap.appendChild(actions);
  if (!pro) {
    const lockNote = document.createElement("p");
    lockNote.className = "note";
    lockNote.textContent = "CSV and Excel export, the rows past 50, and saved categories are part of Pro.";
    tableWrap.appendChild(lockNote);
  }

  els.summary.replaceChildren(mount);
  els.table.replaceChildren(tableWrap);
  els.result.hidden = false;
  lastCharts = {
    slices,
    bars: summary.months.filter((month) => month.month !== "Unknown").map((month) => ({
      label: monthLabel(month.month),
      value: Math.abs(month.moneyOut),
    })),
  };
  requestAnimationFrame(() => paintCharts());
}

function paintCharts() {
  if (!lastCharts) return;
  drawPie(document.getElementById("pie"), lastCharts.slices);
  drawBars(document.getElementById("bars"), lastCharts.bars);
}

function chartCard(title, id) {
  const card = document.createElement("div");
  card.className = "chart-card";
  const h = document.createElement("h3");
  h.textContent = title;
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.setAttribute("aria-hidden", "true");
  card.append(h, canvas);
  return card;
}

function heading(text) {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

function monthlyTable(months) {
  const table = document.createElement("table");
  const head = document.createElement("tr");
  ["Month", "Money in", "Money out", "Transfers", "Net", "Rows"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.appendChild(th);
  });
  const thead = document.createElement("thead");
  thead.appendChild(head);
  const tbody = document.createElement("tbody");
  months.forEach((month) => {
    const tr = document.createElement("tr");
    [month.month, money(month.moneyIn), money(month.moneyOut), money(month.transfers), money(month.net), String(month.count)].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  const wrap = document.createElement("div");
  wrap.className = "tbl";
  wrap.appendChild(table);
  return wrap;
}

function recurringList(rows) {
  if (!rows.length) {
    const p = document.createElement("p");
    p.textContent = "No repeating charges stood out in this set. A repeat is a similar amount, at least 25 days apart, under a similar description.";
    return p;
  }
  const list = document.createElement("ul");
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.textContent = `${row.label}: ${money(row.typicalAmount)} typical, ${row.count} charges, ${row.months.join(", ")}, ${money(row.total)} total.`;
    list.appendChild(li);
  });
  return list;
}

function transactionTable(rows) {
  const table = document.createElement("table");
  const head = document.createElement("tr");
  ["Date", "Description", "Amount", "Category"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.appendChild(th);
  });
  const thead = document.createElement("thead");
  thead.appendChild(head);
  const tbody = document.createElement("tbody");
  rows.forEach((tx, index) => {
    const tr = document.createElement("tr");
    [tx.date || tx.dateLabel || "", tx.description, money(tx.amount)].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    const td = document.createElement("td");
    const select = document.createElement("select");
    select.className = "mini";
    select.setAttribute("aria-label", `Category for ${tx.description || "transaction"}`);
    categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      if (category.id === tx.category) option.selected = true;
      select.appendChild(option);
    });
    select.addEventListener("change", () => {
      all[index].category = select.value;
      all[index].manual = true;
      renderResults();
    });
    td.appendChild(select);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  const wrap = document.createElement("div");
  wrap.className = "tbl";
  wrap.tabIndex = 0;
  wrap.appendChild(table);
  return wrap;
}

function ingest(parsed, label, extraWarnings) {
  all = parsed.transactions.map((tx) => ({ ...tx }));
  fileLabel = label;
  warnings = [...extraWarnings, ...parsed.warnings];
  showError("");
  if (!all.length) {
    els.result.hidden = true;
    showError(warnings.join(" ") || "No transactions were found. Nothing was uploaded.");
    setStatus("");
    return;
  }
  setStatus("Done. The statement is only in this tab. It was not uploaded.");
  renderCategories();
  renderResults();
  els.heading.focus();
}

async function handleFile(file, extra) {
  const id = ++runId;
  showError("");
  const pdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  if (pdf && file.size > MAX_PDF) {
    showError("That PDF is over 15 MB. Nothing was uploaded.");
    return;
  }
  if (!pdf && file.size > MAX_CSV) {
    showError("That file is over 5 MB. Nothing was uploaded.");
    return;
  }
  setStatus(extra ? "Reading the first file in this browser. Extra files were ignored." : "Reading the file in this browser. It is not uploaded.");
  try {
    if (pdf) {
      const parsed = await readPdf(file, id);
      if (id !== runId || !parsed) return;
      ingest(parsed.statement, file.name, parsed.warnings);
      return;
    }
    const text = await file.text();
    if (id !== runId) return;
    ingest(parseCsv(text), file.name, []);
  } catch (error) {
    if (id !== runId) return;
    showError(messageFor(error));
    setStatus("");
    console.error(error);
  }
}

async function readPdf(file, id) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (id !== runId) return null;
  if (!isPdf(bytes)) throw Object.assign(new Error("not pdf"), { code: "not-pdf" });
  const doc = await pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, disableRange: true, disableStream: true }).promise;
  try {
    if (doc.numPages > MAX_PAGES) throw Object.assign(new Error("pages"), { code: "too-many-pages" });
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (id !== runId) return null;
      setStatus(`Reading page ${n} of ${doc.numPages} in this browser. The file is not uploaded.`);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push({ pageNumber: n, items: content.items });
    }
    const table = buildTable(pages);
    return { statement: parseStatementRows(table.rows), warnings: table.warnings };
  } finally {
    await doc.destroy();
  }
}

function rowsToXlsx(rows) {
  const XLSX = globalThis.XLSX;
  if (!XLSX) throw new Error("SheetJS did not load");
  const names = new Map(categories.map((category) => [category.id, category.name]));
  const data = [["Date", "Description", "Amount", "Category", "Month"]];
  rows.forEach((tx) => {
    data.push([
      tx.date || tx.dateLabel || "",
      safeText(tx.description),
      tx.amount,
      names.get(tx.category) || tx.category || "",
      tx.date ? tx.date.slice(0, 7) : "",
    ]);
  });
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Transactions");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function safeText(value) {
  const text = value == null ? "" : String(value);
  return /^[=+@]/.test(text) ? `'${text}` : text;
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function monthLabel(value) {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return names[Number(match[2]) - 1] || value;
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function isPdf(bytes) {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function messageFor(error) {
  if (error && error.code === "not-pdf") return "That file does not look like a PDF. Nothing was uploaded.";
  if (error && error.code === "too-many-pages") return "That PDF has more than 25 pages. Nothing was uploaded.";
  if (error && (error.name === "PasswordException" || error.code === 1)) return "This PDF is password-protected. Nothing was uploaded, and this page does not ask for the password.";
  return "That file could not be read in the browser. Nothing was uploaded.";
}

function setStatus(text) {
  els.status.textContent = text;
}

function showError(text) {
  els.error.textContent = text;
  els.error.hidden = !text;
}
