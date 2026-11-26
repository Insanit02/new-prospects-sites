const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const HEADER_ALIASES = {
  date: ["date", "posted", "posting date", "trans date", "transaction date", "post date", "posted date"],
  description: ["description", "memo", "details", "narrative", "payee", "name", "transaction", "merchant"],
  debit: ["debit", "withdrawal", "money out", "charge", "amount debit", "debits"],
  credit: ["credit", "deposit", "money in", "amount credit", "credits"],
  amount: ["amount", "sum", "value", "transaction amount"],
};

function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function parseAmount(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (!text || text === "-" || text === "—" || text === "–") return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }
  if (/\bcr\b/i.test(text)) negative = false;
  if (/\bdr\b/i.test(text)) negative = true;
  text = text.replace(/[^0-9.]/g, "");
  if (!text || text === ".") return null;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return cents(negative ? -Math.abs(amount) : Math.abs(amount));
}

function iso(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function expandYear(year) {
  const value = Number(year);
  if (String(year).length <= 2) return value >= 70 ? 1900 + value : 2000 + value;
  return value;
}

export function parseDate(value) {
  const text = String(value || "").trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return iso(match[1], match[2], match[3]);
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (match) return iso(expandYear(match[3]), match[1], match[2]);
  match = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/.exec(text);
  if (match && MONTHS[match[2].toLowerCase()]) return iso(expandYear(match[3]), MONTHS[match[2].toLowerCase()], match[1]);
  match = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (match && MONTHS[match[1].toLowerCase()]) return iso(match[3], MONTHS[match[1].toLowerCase()], match[2]);
  return null;
}

function normHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function classifyHeader(value) {
  const text = normHeader(value);
  for (const [kind, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(text)) return kind;
  }
  return "";
}

export function parseCsvTable(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => String(value).trim()));
}

function detectDelimiter(text) {
  const line = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).find((entry) => entry.trim()) || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts[ch] != null) counts[ch] += 1;
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

function maybeDropPageColumn(rows) {
  if (rows.length < 2) return rows;
  if (classifyHeader(rows[0][0])) return rows;
  const numeric = rows.filter((row) => /^\d{1,3}$/.test(String(row[0] || "").trim())).length;
  if (numeric < rows.length * 0.6) return rows;
  return rows.map((row) => row.slice(1));
}

function findHeaderIndex(rows) {
  const limit = Math.min(rows.length, 15);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const kinds = new Set(rows[i].map(classifyHeader).filter(Boolean));
    if (!kinds.has("date")) continue;
    if (!kinds.has("amount") && !kinds.has("debit") && !kinds.has("credit")) continue;
    if (kinds.size > bestScore) {
      best = i;
      bestScore = kinds.size;
    }
  }
  return best;
}

function columnsFromHeader(header) {
  const columns = { date: null, description: null, debit: null, credit: null, amount: null };
  header.forEach((cell, index) => {
    const kind = classifyHeader(cell);
    if (kind && columns[kind] == null) columns[kind] = index;
  });
  if (columns.amount != null) {
    columns.debit = null;
    columns.credit = null;
  }
  return columns;
}

function guessColumns(rows) {
  const sample = rows.slice(0, 20);
  const width = sample.reduce((max, row) => Math.max(max, row.length), 0);
  if (!width) return null;
  const dateScores = Array(width).fill(0);
  const amountScores = Array(width).fill(0);
  sample.forEach((row) => {
    row.forEach((cell, index) => {
      if (parseDate(cell)) dateScores[index] += 1;
      if (parseAmount(cell) != null && /[0-9]/.test(String(cell))) amountScores[index] += 1;
    });
  });
  let date = 0;
  dateScores.forEach((score, index) => {
    if (score > dateScores[date]) date = index;
  });
  if (dateScores[date] < Math.min(2, sample.length)) return null;
  let amount = -1;
  let amountScore = 0;
  amountScores.forEach((score, index) => {
    if (index !== date && score > amountScore) {
      amount = index;
      amountScore = score;
    }
  });
  if (amount < 0) return null;
  let description = null;
  for (let index = 0; index < width; index++) {
    if (index !== date && index !== amount) {
      description = index;
      break;
    }
  }
  return { date, description, debit: null, credit: null, amount };
}

function isSkippableDescription(description) {
  return /^(total|totals|ending balance|beginning balance|opening balance|closing balance|balance forward|grand total)$/i.test(description.trim());
}

function rowToTransaction(row, columns) {
  const description = columns.description == null ? "" : String(row[columns.description] || "").trim();
  const dateLabel = columns.date == null ? "" : String(row[columns.date] || "").trim();
  const date = parseDate(dateLabel);
  let amount = null;
  if (columns.amount != null) amount = parseAmount(row[columns.amount]);
  if (amount == null && (columns.debit != null || columns.credit != null)) {
    const debit = columns.debit == null ? null : parseAmount(row[columns.debit]);
    const credit = columns.credit == null ? null : parseAmount(row[columns.credit]);
    if (debit == null && credit == null) amount = null;
    else amount = cents(Math.abs(credit || 0) - Math.abs(debit || 0));
  }
  if (amount == null || amount === 0 && !description) return null;
  if (!description && !date) return null;
  if (isSkippableDescription(description)) return null;
  return { date: date || "", dateLabel, description, amount };
}

export function parseStatementRows(rows) {
  const source = maybeDropPageColumn(rows || []);
  const warnings = [];
  if (!source.length) return { transactions: [], warnings: ["No rows were found."] };
  const headerIndex = findHeaderIndex(source);
  const transactions = [];
  if (headerIndex >= 0) {
    const columns = columnsFromHeader(source[headerIndex]);
    if (columns.description == null) warnings.push("No description column was found.");
    source.slice(headerIndex + 1).forEach((row) => {
      const tx = rowToTransaction(row, columns);
      if (tx) transactions.push(tx);
    });
  } else {
    const columns = guessColumns(source);
    if (!columns) {
      return {
        transactions: [],
        warnings: ["No date and amount columns were found. Use a header such as Date, Description, Amount, or Debit and Credit."],
      };
    }
    warnings.push("No header row was found. The date, description, and amount columns were guessed.");
    source.forEach((row) => {
      const tx = rowToTransaction(row, columns);
      if (tx) transactions.push(tx);
    });
  }
  if (!transactions.length) warnings.push("No transactions were read from those rows.");
  return { transactions, warnings };
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  return parseStatementRows(parseCsvTable(text, delimiter));
}

function csvField(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+@]/.test(text) || /^-(?!\d)/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function transactionsToCsv(transactions, categories) {
  const names = new Map((categories || []).map((category) => [category.id, category.name]));
  const lines = [["Date", "Description", "Amount", "Category", "Month"].join(",")];
  transactions.forEach((tx) => {
    lines.push([
      tx.date || tx.dateLabel || "",
      tx.description || "",
      Number(tx.amount || 0).toFixed(2),
      names.get(tx.category) || tx.category || "",
      tx.date ? tx.date.slice(0, 7) : "",
    ].map(csvField).join(","));
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function buildSampleCsv() {
  const lines = ["Date,Description,Amount"];
  ["01", "02", "03", "04"].forEach((month, monthIndex) => {
    lines.push(`2026-${month}-03,Netflix.com,-15.99`);
    lines.push(`2026-${month}-03,Spotify,-11.99`);
    lines.push(`2026-${month}-04,Adobe,-19.99`);
    lines.push(`2026-${month}-01,Rent payment,-1450.00`);
    lines.push(`2026-${month}-15,Payroll Acme Co,${(2400 + monthIndex * 125).toFixed(2)}`);
    [
      ["Kroger", 72],
      ["Starbucks", 5.5],
      ["Shell Oil", 38],
      ["City Power & Light", 90],
      ["Zelle to Riley", 20],
      ["Amazon.com", 24],
      ["Target", 33],
    ].forEach((entry, index) => {
      const day = String(5 + index).padStart(2, "0");
      const amount = -(entry[1] + monthIndex * 9 + index);
      lines.push(`2026-${month}-${day},${entry[0]},${amount.toFixed(2)}`);
    });
  });
  for (let i = 1; i <= 12; i++) {
    lines.push(`2026-04-${String(14 + i).padStart(2, "0")},Corner market ${i},-${(3 + i * 4.35).toFixed(2)}`);
  }
  return `${lines.join("\n")}\n`;
}

export const SAMPLE_CSV = buildSampleCsv();
