import { isUnlocked, mountLicenseBox } from "../assets/unlock.js";
import {
  assessAssignment,
  guestLimitMessage,
  parseApartLines,
  parseGuestLines,
  parseTogetherLines,
  solveSeating,
} from "./solver.js";

const TOOL_ID = "wedding-seating-chart";
const SAMPLE = {
  guests: `Alex Chen
Jordan Lee
Sam Patel
Riley Quinn
Morgan Diaz
Casey Brooks
Taylor Nguyen
Avery Shah
Jamie Ortiz
Reese Park
Drew Coleman
Sky Harper
Quinn Blake
Rowan Ellis
Parker Singh
Hayden Brooks`,
  together: `Alex Chen, Jordan Lee
Sam Patel, Riley Quinn
Drew Coleman, Sky Harper`,
  apart: `Alex Chen | Sam Patel
Casey Brooks | Taylor Nguyen`,
  tables: 3,
  seats: 6,
};

const els = {
  guests: document.getElementById("guests"),
  together: document.getElementById("together"),
  apart: document.getElementById("apart"),
  tables: document.getElementById("table-count"),
  seats: document.getElementById("seats-per-table"),
  assign: document.getElementById("assign"),
  sample: document.getElementById("sample"),
  reshuffle: document.getElementById("reshuffle"),
  clear: document.getElementById("clear"),
  status: document.getElementById("status"),
  error: document.getElementById("error"),
  result: document.getElementById("result"),
  heading: document.getElementById("result-heading"),
  mount: document.getElementById("chart-mount"),
};

let seed = 1;
let plan = null;

mountLicenseBox(document.getElementById("unlock"), {
  toolId: TOOL_ID,
  onChange() {
    if (plan) render();
  },
});

els.sample.addEventListener("click", () => {
  els.guests.value = SAMPLE.guests;
  els.together.value = SAMPLE.together;
  els.apart.value = SAMPLE.apart;
  els.tables.value = String(SAMPLE.tables);
  els.seats.value = String(SAMPLE.seats);
  assign(1);
});
els.assign.addEventListener("click", () => assign(seed));
els.reshuffle.addEventListener("click", () => assign(seed + 1));
els.clear.addEventListener("click", () => {
  plan = null;
  els.guests.value = "";
  els.together.value = "";
  els.apart.value = "";
  els.result.hidden = true;
  els.mount.replaceChildren();
  showError("");
  setStatus("Cleared. Guest names are no longer held in this tab.");
});

if (new URLSearchParams(location.search).get("demo") === "1") els.sample.click();

function readProblem() {
  const guestParse = parseGuestLines(els.guests.value);
  const togetherParse = parseTogetherLines(els.together.value);
  const apartParse = parseApartLines(els.apart.value);
  return {
    guestParse,
    togetherParse,
    apartParse,
    input: {
      guests: guestParse.guests,
      together: togetherParse.groups,
      apart: apartParse.pairs,
      tableCount: Number(els.tables.value),
      seatsPerTable: Number(els.seats.value),
    },
  };
}

function assign(nextSeed) {
  const problem = readProblem();
  const errors = [...problem.togetherParse.errors, ...problem.apartParse.errors];
  const limit = guestLimitMessage(problem.guestParse.guests.length, isUnlocked(TOOL_ID));
  if (limit) errors.push(limit);
  if (errors.length) {
    plan = null;
    els.result.hidden = true;
    showError(errors.join(" "));
    setStatus("");
    return;
  }
  seed = nextSeed;
  const solved = solveSeating(problem.input, { seed });
  if (solved.errors.length) {
    plan = null;
    els.result.hidden = true;
    showError(solved.errors.join(" "));
    setStatus("");
    return;
  }
  plan = {
    tables: solved.tables.map((table) => ({ id: table.id, guests: table.guests.slice() })),
    unseated: solved.unseated.slice(),
    notes: solved.notes.slice(),
    together: problem.input.together,
    apart: problem.input.apart,
    seatsPerTable: problem.input.seatsPerTable,
    guests: problem.guestParse.guests.slice(),
  };
  showError("");
  setStatus("Seating is ready in this tab. Names were not uploaded.");
  render();
  els.heading.focus();
}

function render() {
  if (!plan) return;
  const pro = isUnlocked(TOOL_ID);
  const violations = assessAssignment({
    tables: plan.tables,
    unseated: plan.unseated,
    together: plan.together,
    apart: plan.apart,
    seatsPerTable: plan.seatsPerTable,
    guests: plan.guests,
  });
  const wrap = document.createElement("div");
  const count = plan.tables.reduce((sum, table) => sum + table.guests.length, 0);
  const lead = document.createElement("p");
  lead.textContent = `${count} seated across ${plan.tables.length} tables. ${plan.unseated.length} not seated. Drag a name, or use Move, to change a table.`;
  wrap.appendChild(lead);

  if (!pro && plan.guests.length > 40) {
    const note = document.createElement("p");
    note.className = "warn";
    note.textContent = "Pro is off, so print and CSV are off. Assign seats again will stop at 40 guests.";
    wrap.appendChild(note);
  }

  const notes = document.createElement("ul");
  plan.notes.forEach((note) => {
    const li = document.createElement("li");
    li.textContent = note;
    notes.appendChild(li);
  });
  if (plan.notes.length) wrap.appendChild(notes);

  if (violations.length) {
    const warn = document.createElement("div");
    warn.className = "warn";
    const title = document.createElement("b");
    title.textContent = "Some rules are not met.";
    const list = document.createElement("ul");
    violations.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item.message;
      list.appendChild(li);
    });
    warn.append(title, list);
    wrap.appendChild(warn);
  }

  const grid = document.createElement("div");
  grid.className = "grid";
  plan.tables.forEach((table) => grid.appendChild(tableCard(table, false)));
  if (plan.unseated.length || true) grid.appendChild(tableCard({ id: 0, guests: plan.unseated }, true));
  wrap.appendChild(grid);

  const actions = document.createElement("div");
  actions.className = "actions no-print";
  const print = document.createElement("button");
  print.type = "button";
  print.className = "btn";
  print.textContent = "Print or save as PDF";
  print.disabled = !pro;
  print.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    document.body.classList.add("seating-print");
    window.print();
  });
  const csv = document.createElement("button");
  csv.type = "button";
  csv.className = "btn line";
  csv.textContent = "Download CSV";
  csv.disabled = !pro;
  csv.addEventListener("click", () => {
    if (!isUnlocked(TOOL_ID)) return;
    downloadCsv();
  });
  actions.append(print, csv);
  wrap.appendChild(actions);
  if (!pro) {
    const lock = document.createElement("p");
    lock.className = "note no-print";
    lock.textContent = "Print, save as PDF, and CSV are part of Pro for this event.";
    wrap.appendChild(lock);
  }

  els.mount.replaceChildren(wrap);
  els.result.hidden = false;
}

function tableCard(table, unseated) {
  const card = document.createElement("article");
  card.className = unseated ? "table-card unseated-card" : "table-card";
  card.dataset.tableId = String(table.id);
  const title = document.createElement("h3");
  title.textContent = unseated ? "Not seated" : `Table ${table.id}`;
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = unseated ? `${table.guests.length} waiting` : `${table.guests.length} of ${plan.seatsPerTable} seats`;
  card.append(title, meta);
  if (!table.guests.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.textContent = "Drop a guest here.";
    card.appendChild(empty);
  }
  table.guests.forEach((name, index) => card.appendChild(guestRow(table.id, index, name)));
  card.addEventListener("dragover", (event) => {
    event.preventDefault();
    card.classList.add("over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("over"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    card.classList.remove("over");
    const raw = event.dataTransfer.getData("text/plain");
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      moveGuest(data.from, data.index, table.id);
    } catch {
      /* ignore a drop that is not a guest */
    }
  });
  return card;
}

function guestRow(fromId, index, name) {
  const row = document.createElement("div");
  row.className = "guest";
  row.draggable = true;
  const label = document.createElement("span");
  label.textContent = name;
  const move = document.createElement("label");
  move.className = "move";
  const caption = document.createElement("span");
  caption.className = "note";
  caption.textContent = "Move ";
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Move ${name}`);
  const stay = document.createElement("option");
  stay.value = "";
  stay.textContent = "to…";
  select.appendChild(stay);
  plan.tables.forEach((table) => {
    if (table.id === fromId) return;
    const option = document.createElement("option");
    option.value = String(table.id);
    option.textContent = `Table ${table.id}`;
    select.appendChild(option);
  });
  if (fromId !== 0) {
    const option = document.createElement("option");
    option.value = "0";
    option.textContent = "Not seated";
    select.appendChild(option);
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    moveGuest(fromId, index, Number(select.value));
  });
  move.append(caption, select);
  row.append(label, move);
  row.addEventListener("dragstart", (event) => {
    event.dataTransfer.setData("text/plain", JSON.stringify({ from: fromId, index }));
    event.dataTransfer.effectAllowed = "move";
  });
  return row;
}

function moveGuest(fromId, index, toId) {
  if (!plan || fromId === toId) return;
  const from = fromId === 0 ? plan.unseated : (plan.tables.find((table) => table.id === fromId) || {}).guests;
  const to = toId === 0 ? plan.unseated : (plan.tables.find((table) => table.id === toId) || {}).guests;
  if (!from || !to || !from[index]) return;
  const [name] = from.splice(index, 1);
  to.push(name);
  render();
}

function downloadCsv() {
  const lines = ["Table,Seat,Guest"];
  plan.tables.forEach((table) => {
    table.guests.forEach((name, index) => {
      lines.push([table.id, index + 1, csv(name)].join(","));
    });
  });
  plan.unseated.forEach((name, index) => {
    lines.push(["Not seated", index + 1, csv(name)].join(","));
  });
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "seating-chart.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csv(value) {
  let text = String(value || "");
  if (/^[=+@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

window.addEventListener("afterprint", () => document.body.classList.remove("seating-print"));

function setStatus(text) {
  els.status.textContent = text;
}

function showError(text) {
  els.error.textContent = text;
  els.error.hidden = !text;
}
