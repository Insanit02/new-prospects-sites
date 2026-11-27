import { isUnlocked, mountLicenseBox } from "../assets/unlock.js";
import {
  FREE_ADDRESS_LIMIT,
  LABEL_FORMATS,
  SAMPLE_CSV,
  SAMPLE_NOTE,
  applyEdit,
  duplicateGroups,
  householdKey,
  householdLabel,
  labelPages,
  mergeRows,
  parseAddresses,
  summarizeRows,
  toFlaggedCsv,
  toMailMergeCsv,
  undoMerge,
  flaggedAoa,
} from "./clean.js";

const TOOL_ID = "holiday-card-addresses";
const MAX_FILE = 5 * 1024 * 1024;
const FIELDS = [
  ["", "Skip this column"],
  ["name", "Full name"],
  ["first", "First name"],
  ["last", "Last name"],
  ["street", "Street"],
  ["street2", "Street line 2"],
  ["city", "City"],
  ["state", "State or region"],
  ["zip", "ZIP or postal code"],
  ["country", "Country"],
];

const els = {
  paste: document.getElementById("paste"),
  format: document.getElementById("input-format"),
  file: document.getElementById("address-file"),
  drop: document.getElementById("drop"),
  clean: document.getElementById("clean"),
  sample: document.getElementById("sample"),
  clear: document.getElementById("clear"),
  sampleNote: document.getElementById("sample-note"),
  mapping: document.getElementById("mapping"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  result: document.getElementById("result"),
  heading: document.getElementById("result-heading"),
  review: document.getElementById("review-mount"),
  printRoot: document.getElementById("print-root"),
};

let allRows = [];
let parsed = null;
let showMapping = false;
let skipped = new Set();
let labelFormat = "5160";
let returnText = "";
let usingSample = false;

mountLicenseBox(document.getElementById("unlock"), {
  toolId: TOOL_ID,
  onChange() {
    if (allRows.length) render();
  },
});

els.clean.addEventListener("click", () => runParse());
els.sample.addEventListener("click", () => {
  els.paste.value = SAMPLE_CSV;
  els.format.value = "auto";
  usingSample = true;
  els.sampleNote.hidden = false;
  runParse();
});
els.clear.addEventListener("click", () => {
  allRows = [];
  parsed = null;
  showMapping = false;
  skipped = new Set();
  usingSample = false;
  els.paste.value = "";
  els.sampleNote.hidden = true;
  els.mapping.replaceChildren();
  els.review.replaceChildren();
  els.printRoot.replaceChildren();
  els.result.hidden = true;
  showError("");
  setStatus("Cleared. Addresses are no longer held in this tab.");
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

if (new URLSearchParams(location.search).get("demo") === "1") els.sample.click();

function shownRows() {
  return isUnlocked(TOOL_ID) ? allRows : allRows.slice(0, FREE_ADDRESS_LIMIT);
}

function runParse(extra = {}) {
  const text = els.paste.value;
  parsed = parseAddresses(text, {
    format: els.format.value,
    ...extra,
  });
  allRows = parsed.rows;
  skipped = new Set();
  showMapping = parsed.needsMapping;
  showError("");
  if (parsed.needsMapping) {
    els.result.hidden = true;
    els.review.replaceChildren();
    renderMapping();
    setStatus(parsed.warnings.join(" ") || "Choose the columns, then apply them. Nothing was uploaded.");
    return;
  }
  if (!allRows.length) {
    els.result.hidden = true;
    els.review.replaceChildren();
    renderMapping();
    showError(parsed.warnings.join(" ") || "No addresses were found. Nothing was uploaded.");
    setStatus("");
    return;
  }
  const sampleBit = usingSample ? ` ${SAMPLE_NOTE}` : "";
  setStatus(`Cleaned in this browser. Nothing was uploaded.${sampleBit}`);
  render();
  els.heading.focus();
}

function renderMapping() {
  els.mapping.replaceChildren();
  if (!showMapping || !parsed || parsed.format === "blocks" || !parsed.headers.length) return;
  const box = document.createElement("div");
  box.className = "limits";
  const title = document.createElement("h2");
  title.textContent = parsed.needsMapping ? "Match the columns" : "Columns";
  box.appendChild(title);
  const note = document.createElement("p");
  note.textContent = parsed.needsMapping
    ? "These columns were not recognized on their own. Pick what each one is, then apply."
    : "These columns were recognized. Change one if a field landed in the wrong place.";
  box.appendChild(note);
  const grid = document.createElement("div");
  parsed.headers.forEach((header, index) => {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    const selectId = `map-${index}`;
    label.htmlFor = selectId;
    label.textContent = header || `Column ${index + 1}`;
    const select = document.createElement("select");
    select.id = selectId;
    select.dataset.column = String(index);
    FIELDS.forEach(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    });
    const current = Object.entries(parsed.mapping || {}).find(([, column]) => column === index);
    if (current) select.value = current[0];
    const sample = (parsed.sample[0] && parsed.sample[0][index]) || "";
    if (sample) {
      const hint = document.createElement("span");
      hint.className = "note";
      hint.textContent = `Example: ${String(sample).slice(0, 80)}`;
      field.append(label, select, hint);
    } else field.append(label, select);
    grid.appendChild(field);
  });
  box.appendChild(grid);
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "btn";
  apply.textContent = "Apply columns";
  apply.addEventListener("click", () => {
    const mapping = {};
    grid.querySelectorAll("select").forEach((select) => {
      if (!select.value) return;
      mapping[select.value] = Number(select.dataset.column);
    });
    if (!Object.keys(mapping).length) {
      showError("Pick at least one column. Nothing was uploaded.");
      return;
    }
    runParse({
      format: "csv",
      hasHeader: parsed.hasHeader,
      mapping,
    });
  });
  box.appendChild(apply);
  els.mapping.appendChild(box);
}

function render() {
  const pro = isUnlocked(TOOL_ID);
  const shown = shownRows();
  const omitted = pro ? 0 : Math.max(0, allRows.length - shown.length);
  const counts = summarizeRows(shown);
  const wrap = document.createElement("div");

  const stats = document.createElement("div");
  stats.className = "stats";
  [
    ["Total", counts.total],
    ["Cleaned", counts.cleaned],
    ["Flagged", counts.flagged],
    ["Merged", counts.merged],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat";
    const name = document.createElement("span");
    name.className = "note";
    name.textContent = label;
    const strong = document.createElement("b");
    strong.textContent = String(value);
    card.append(name, strong);
    stats.appendChild(card);
  });
  wrap.appendChild(stats);

  if (usingSample) {
    const sample = document.createElement("p");
    sample.className = "note";
    sample.textContent = SAMPLE_NOTE;
    wrap.appendChild(sample);
  }
  if (omitted) {
    const limit = document.createElement("p");
    limit.className = "warn";
    limit.textContent = `Free includes the first ${FREE_ADDRESS_LIMIT} addresses. ${omitted} more stay in this tab and are not shown, printed, or exported until Pro is on.`;
    wrap.appendChild(limit);
  }

  if (parsed && parsed.format === "csv" && parsed.headers.length && !showMapping) {
    const used = document.createElement("p");
    used.className = "note";
    const names = Object.entries(parsed.mapping || {})
      .map(([field, index]) => `${fieldLabel(field)}: ${parsed.headers[index] || `Column ${index + 1}`}`)
      .join("; ");
    used.textContent = names ? `Columns used: ${names}.` : "Columns were set by hand.";
    const change = document.createElement("button");
    change.type = "button";
    change.className = "btn line";
    change.textContent = "Change columns";
    change.addEventListener("click", () => {
      showMapping = true;
      renderMapping();
    });
    wrap.appendChild(used);
    wrap.appendChild(change);
  }

  duplicateGroups(shown).forEach((group) => {
    const key = householdKey(group[0]);
    if (skipped.has(key)) return;
    wrap.appendChild(householdCard(group, key));
  });

  wrap.appendChild(reviewTable(shown));
  wrap.appendChild(previewBlock(shown, pro));
  wrap.appendChild(exportBlock(shown, pro));

  els.review.replaceChildren(wrap);
  els.result.hidden = false;
  renderMapping();
}

function fieldLabel(field) {
  const found = FIELDS.find(([value]) => value === field);
  return found ? found[1] : field;
}

function householdCard(group, key) {
  const card = document.createElement("div");
  card.className = "household";
  const title = document.createElement("h3");
  title.textContent = "Same street and ZIP";
  const names = document.createElement("p");
  names.textContent = group.map((row) => row.name || "(no name)").join(", ");
  const help = document.createElement("p");
  help.className = "note";
  help.textContent = "Merge these into one label, or leave them as separate rows.";
  const actions = document.createElement("div");
  actions.className = "actions";
  const options = [
    ["ampersand", `Use “${householdLabel(group, "ampersand")}”`],
    ["family", `Use “${householdLabel(group, "family")}”`],
    ["first", `Keep “${householdLabel(group, "first") || "the first name"}”`],
  ];
  options.forEach(([style, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = style === "ampersand" ? "btn" : "btn line";
    button.textContent = text;
    button.addEventListener("click", () => {
      allRows = mergeRows(allRows, group.map((row) => row.id), style);
      render();
    });
    actions.appendChild(button);
  });
  const skip = document.createElement("button");
  skip.type = "button";
  skip.className = "btn line";
  skip.textContent = "Not the same household";
  skip.addEventListener("click", () => {
    skipped.add(key);
    render();
  });
  actions.appendChild(skip);
  card.append(title, names, help, actions);
  return card;
}

function reviewTable(rows) {
  const table = document.createElement("table");
  const head = document.createElement("tr");
  ["Include", "Name", "Street", "Street 2", "City", "State", "ZIP", "Country", "Flags"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.appendChild(th);
  });
  const thead = document.createElement("thead");
  thead.appendChild(head);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => tbody.appendChild(reviewRow(row)));
  table.append(thead, tbody);
  const wrap = document.createElement("div");
  wrap.className = "tbl addr-wrap";
  wrap.tabIndex = 0;
  wrap.appendChild(table);
  return wrap;
}

function reviewRow(row) {
  const tr = document.createElement("tr");
  const include = document.createElement("td");
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = row.included !== false;
  box.setAttribute("aria-label", `Include ${row.name || "this address"}`);
  box.addEventListener("change", () => {
    allRows = allRows.map((item) => (item.id === row.id ? { ...item, included: box.checked } : item));
    render();
  });
  include.appendChild(box);
  tr.appendChild(include);
  ["name", "street", "street2", "city", "state", "zip", "country"].forEach((field) => {
    const td = document.createElement("td");
    const input = document.createElement("input");
    input.type = "text";
    input.value = row[field] || "";
    input.setAttribute("aria-label", `${fieldLabel(field)} for ${row.name || "this row"}`);
    input.addEventListener("change", () => {
      allRows = allRows.map((item) => (item.id === row.id ? applyEdit(item, field, input.value) : item));
      render();
    });
    td.appendChild(input);
    if (field === "name" && row.mergedCount) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = `Merged ${row.mergedCount + 1} addresses.`;
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "btn line";
      undo.textContent = "Undo merge";
      undo.addEventListener("click", () => {
        allRows = undoMerge(allRows, row.id);
        render();
      });
      td.append(note, undo);
    }
    tr.appendChild(td);
  });
  const flags = document.createElement("td");
  flags.className = "flags";
  flags.textContent = row.flags.length ? row.flags.join("; ") : "None";
  tr.appendChild(flags);
  return tr;
}

function previewBlock(rows, pro) {
  const block = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Label preview";
  const formatField = document.createElement("div");
  formatField.className = "field";
  const label = document.createElement("label");
  label.htmlFor = "label-format";
  label.textContent = "Sheet to preview";
  const select = document.createElement("select");
  select.id = "label-format";
  Object.values(LABEL_FORMATS).forEach((format) => {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = `${format.name} (${format.perSheet} per sheet)`;
    select.appendChild(option);
  });
  select.value = labelFormat;
  select.addEventListener("change", () => {
    labelFormat = select.value;
    render();
  });
  formatField.append(label, select);
  const pages = labelPages(rows, labelFormat);
  const note = document.createElement("p");
  const format = pages.format;
  note.textContent = pages.pages.length
    ? `On-screen preview of the first sheet. ${format.name} holds ${format.perSheet} labels. Included addresses fill ${pages.pages.length} sheet${pages.pages.length === 1 ? "" : "s"}. Dashed lines are only on screen.`
    : "Check at least one row to preview a label.";
  block.append(title, formatField, note);
  if (pages.pages.length) {
    const clip = document.createElement("div");
    clip.className = "preview-clip";
    clip.appendChild(sheetElement(pages.pages[0], labelFormat));
    block.appendChild(clip);
  }
  const tip = document.createElement("p");
  tip.className = "limits";
  tip.textContent = "Print alignment test: in the print dialog choose US Letter, scale 100% (not Fit to page), margins None, and turn headers and footers off. Print one page on plain paper and hold it against a label sheet up to the light before you print on labels.";
  block.appendChild(tip);
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    printButton("Print or save as PDF (Avery 5160 / 8160)", "5160", pro, rows),
    printButton("Print or save as PDF (Avery 5163)", "5163", pro, rows),
  );
  block.appendChild(actions);
  if (!pro) {
    const lock = document.createElement("p");
    lock.className = "note";
    lock.textContent = "Printing and saving as PDF are part of Pro. The preview above stays on screen either way.";
    block.appendChild(lock);
  }
  block.appendChild(returnBlock(pro));
  return block;
}

function returnBlock(pro) {
  const block = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Return address";
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = "return-address";
  label.textContent = "One return address, a line per row. Pro prints it 30 times on Avery 5160.";
  const area = document.createElement("textarea");
  area.id = "return-address";
  area.placeholder = "Ada Lovelace\n1 Example Ave\nBoston, MA 02134";
  area.value = returnText;
  area.addEventListener("input", () => {
    returnText = area.value;
  });
  field.append(label, area);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn line";
  button.textContent = "Print or save return-address sheet";
  button.disabled = !pro;
  button.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    const lines = returnText.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      showError("Enter a return address first. Nothing was uploaded.");
      return;
    }
    showError("");
    printPages([Array.from({ length: 30 }, () => lines)], "5160");
  });
  block.append(title, field, button);
  return block;
}

function printButton(text, formatId, pro, rows) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.textContent = text;
  button.disabled = !pro;
  button.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    const pages = labelPages(rows, formatId).pages;
    if (!pages.length) {
      showError("No included addresses to print. Nothing was uploaded.");
      return;
    }
    showError("");
    printPages(pages, formatId);
  });
  return button;
}

function exportBlock(rows, pro) {
  const block = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = "Download";
  const actions = document.createElement("div");
  actions.className = "actions";
  const mail = document.createElement("button");
  mail.type = "button";
  mail.className = "btn";
  mail.textContent = "Mail-merge CSV";
  mail.disabled = !pro;
  mail.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    download("holiday-card-mail-merge.csv", new Blob([toMailMergeCsv(rows)], { type: "text/csv;charset=utf-8" }));
  });
  const flags = document.createElement("button");
  flags.type = "button";
  flags.className = "btn line";
  flags.textContent = "CSV with flags";
  flags.disabled = !pro;
  flags.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    download("holiday-card-addresses.csv", new Blob([toFlaggedCsv(rows)], { type: "text/csv;charset=utf-8" }));
  });
  const xlsx = document.createElement("button");
  xlsx.type = "button";
  xlsx.className = "btn line";
  xlsx.textContent = "Excel with flags (.xlsx)";
  xlsx.disabled = !pro || !globalThis.XLSX;
  xlsx.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    try {
      download("holiday-card-addresses.xlsx", rowsToXlsx(rows));
    } catch (error) {
      showError("Excel could not be built in this browser. The CSV with flags still works if Pro is on.");
      console.error(error);
    }
  });
  actions.append(mail, flags, xlsx);
  block.append(title, actions);
  if (!pro) {
    const lock = document.createElement("p");
    lock.className = "note";
    lock.textContent = "Mail-merge CSV and the flag export are part of Pro. The file is built in this browser.";
    block.appendChild(lock);
  }
  return block;
}

function sheetElement(lines, formatId) {
  const sheet = document.createElement("section");
  sheet.className = formatId === "5163" ? "sheet sheet-5163" : "sheet sheet-5160";
  lines.forEach((label) => sheet.appendChild(labelElement(label)));
  return sheet;
}

function labelElement(lines) {
  const label = document.createElement("div");
  label.className = "label";
  const inner = document.createElement("div");
  inner.className = "label-inner";
  lines.forEach((line) => {
    const div = document.createElement("div");
    div.textContent = line;
    inner.appendChild(div);
  });
  label.appendChild(inner);
  return label;
}

function printPages(pages, formatId) {
  els.printRoot.replaceChildren();
  pages.forEach((page) => els.printRoot.appendChild(sheetElement(page, formatId)));
  document.body.classList.add("labels-print");
  window.print();
}

function rowsToXlsx(rows) {
  const XLSX = globalThis.XLSX;
  if (!XLSX) throw new Error("Excel support did not load");
  const sheet = XLSX.utils.aoa_to_sheet(flaggedAoa(rows));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Addresses");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function handleFile(file, extra) {
  if (file.size > MAX_FILE) {
    showError("That file is over 5 MB. Nothing was uploaded.");
    return;
  }
  const excel = /\.xlsx?$/i.test(file.name) || /spreadsheet|excel/i.test(file.type || "");
  setStatus(extra
    ? "Reading the first file in this browser. Extra files were ignored. It is not uploaded."
    : "Reading the file in this browser. It is not uploaded.");
  try {
    let text;
    let extraSheet = false;
    if (excel) {
      if (!globalThis.XLSX) throw new Error("Excel support did not load. Save the sheet as CSV and try again.");
      const book = globalThis.XLSX.read(await file.arrayBuffer(), { type: "array" });
      const name = book.SheetNames[0];
      if (!name) throw new Error("That workbook has no sheets.");
      text = globalThis.XLSX.utils.sheet_to_csv(book.Sheets[name]);
      extraSheet = book.SheetNames.length > 1;
    } else text = await file.text();
    usingSample = false;
    els.sampleNote.hidden = true;
    els.paste.value = text;
    els.format.value = "auto";
    runParse();
    if (extraSheet && els.status.textContent) els.status.textContent += " Only the first sheet was read.";
  } catch (error) {
    showError(error && error.message ? error.message : "That file could not be read. Nothing was uploaded.");
    setStatus("");
  }
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

window.addEventListener("afterprint", () => document.body.classList.remove("labels-print"));

function setStatus(text) {
  els.status.textContent = text;
}

function showError(text) {
  els.error.textContent = text;
  els.error.hidden = !text;
}
