// Best-effort text table for one PDF.
// Rows are lines of text (grouped by y). Columns are vertical gaps that
// show up on several of those lines. This is a guess, not a checked grid.

const GAP_FACTOR = 0.8;
const SEPARATOR_FACTOR = 0.35;

export function buildTable(pages) {
  const warnings = [];
  const emptyPages = [];
  let rotatedSkipped = 0;
  const tables = [];

  for (const page of pages) {
    const parsed = pageToRows(page.items || []);
    rotatedSkipped += parsed.rotated;
    if (parsed.textItems === 0) emptyPages.push(page.pageNumber);
    tables.push({ pageNumber: page.pageNumber, rows: parsed.rows });
  }

  if (emptyPages.length === 1) {
    warnings.push(`Page ${emptyPages[0]} has no selectable text. If that page is a scan or a photo, this tool cannot read it.`);
  } else if (emptyPages.length > 1) {
    warnings.push(`Pages ${emptyPages.join(", ")} have no selectable text. Scans and photos cannot be read here.`);
  }
  if (rotatedSkipped > 0) {
    warnings.push(`Skipped ${rotatedSkipped} sideways text item${rotatedSkipped === 1 ? "" : "s"}.`);
  }

  const counts = tables
    .filter((table) => table.rows.length)
    .map((table) => table.rows.reduce((max, row) => Math.max(max, row.length), 0));
  if (new Set(counts).size > 1) {
    warnings.push("Not every page has the same number of columns, so cells may not line up across pages.");
  }

  const width = counts.length ? Math.max(...counts) : 0;
  const rows = [];
  for (const table of tables) {
    for (const row of table.rows) {
      const padded = row.concat(Array(Math.max(0, width - row.length)).fill(""));
      rows.push([String(table.pageNumber), ...padded]);
    }
  }

  return { rows, warnings, emptyPages, rotatedSkipped };
}

export function toCsv(rows) {
  const lines = rows.map((row) => row.map(csvField).join(","));
  return `\uFEFF${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
}

function csvField(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+@]/.test(text) || /^-(?!\d)/.test(text) || /^[\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function pageToRows(rawItems) {
  let rotated = 0;
  const ink = [];
  for (const raw of rawItems) {
    const norm = normalizeItem(raw);
    if (!norm) continue;
    if (norm.vertical) {
      rotated += 1;
      continue;
    }
    for (const part of expandWideSpaces(norm)) {
      if (part.str.trim()) ink.push(part);
    }
  }
  if (!ink.length) return { rows: [], rotated, textItems: 0 };

  const deduped = dedupeItems(ink);
  const { rows, medH } = clusterRows(deduped);
  const separators = findSeparators(rows, medH);
  const byGaps = rows.map((row) => assignRow(row, separators));
  const byAnchors = tableFromAnchors(rows, medH);
  let table = byAnchors || byGaps;
  table = dropEmptyColumns(table).filter((row) => row.some((cell) => cell));
  return { rows: table, rotated, textItems: deduped.length };
}

// Left edges line up in a text column. Right edges line up in a money column.
// Empty cells make a gap vote too wide, so aligned edges are tried first.
function tableFromAnchors(rows, medH) {
  const structural = rows.filter((row) => row.items.length >= 2).flatMap((row) => row.items);
  if (structural.length < 4) return null;
  const tol = Math.max(8, medH * 0.75);
  const groups = [
    ...clusterBy(structural, (item) => item.x, tol).filter((group) => group.length >= 2).map((items) => ({ items, kind: "start" })),
    ...clusterBy(structural, (item) => item.end, tol).filter((group) => group.length >= 2).map((items) => ({ items, kind: "end" })),
  ];
  if (!groups.length) return null;

  const parent = groups.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  const membership = new Map();
  groups.forEach((group, index) => {
    for (const item of group.items) {
      const seen = membership.get(item);
      if (seen) seen.forEach((other) => union(index, other));
      else membership.set(item, []);
      membership.get(item).push(index);
    }
  });

  const merged = new Map();
  groups.forEach((group, index) => {
    const root = find(index);
    if (!merged.has(root)) merged.set(root, { items: new Set(), anchors: [] });
    const column = merged.get(root);
    const values = group.items.map((item) => (group.kind === "start" ? item.x : item.end)).sort((a, b) => a - b);
    column.anchors.push({ kind: group.kind, x: values[Math.floor(values.length / 2)] });
    for (const item of group.items) column.items.add(item);
  });

  const columns = [...merged.values()].map((column) => {
    let x = Infinity;
    for (const item of column.items) x = Math.min(x, item.x);
    column.x = x;
    return column;
  }).sort((a, b) => a.x - b.x);
  if (columns.length < 2) return null;

  const limit = Math.max(14, medH * 1.25);
  for (const row of rows) {
    if (row.items.length < 2) continue;
    for (const item of row.items) {
      if (distanceToColumns(item, columns) > limit) return null;
    }
  }

  const columnOf = new Map();
  columns.forEach((column, index) => {
    for (const item of column.items) columnOf.set(item, index);
  });
  return rows.map((row) => {
    const cells = Array.from({ length: columns.length }, () => []);
    for (const item of [...row.items].sort((a, b) => a.x - b.x)) {
      const index = columnOf.has(item) ? columnOf.get(item) : nearestColumn(item, columns);
      cells[index].push(item);
    }
    return cells.map((group) => joinItems(group));
  });
}

function clusterBy(items, getX, tol) {
  const sorted = [...items].sort((a, b) => getX(a) - getX(b) || a.y - b.y);
  const groups = [];
  for (const item of sorted) {
    const x = getX(item);
    const last = groups[groups.length - 1];
    if (last && x - last.max <= tol) {
      last.items.push(item);
      last.max = x;
    } else {
      groups.push({ items: [item], max: x });
    }
  }
  return groups.map((group) => group.items);
}

function distanceToColumns(item, columns) {
  let best = Infinity;
  for (const column of columns) {
    for (const anchor of column.anchors) {
      const distance = anchor.kind === "start" ? Math.abs(item.x - anchor.x) : Math.abs(item.end - anchor.x);
      if (distance < best) best = distance;
    }
  }
  return best;
}

function nearestColumn(item, columns) {
  let best = 0;
  let bestDistance = Infinity;
  columns.forEach((column, index) => {
    const distance = Math.abs(item.x - column.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

function normalizeItem(raw) {
  if (!raw || typeof raw.str !== "string") return null;
  const transform = Array.isArray(raw.transform) ? raw.transform : [1, 0, 0, 1, 0, 0];
  const a = Number(transform[0]) || 0;
  const b = Number(transform[1]) || 0;
  const x = Number(transform[4]);
  const y = Number(transform[5]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const height = Math.abs(Number(transform[3])) || Number(raw.height) || 10;
  let width = Number(raw.width);
  if (!(width > 0)) width = raw.str.length * height * 0.45;
  return {
    str: raw.str.replace(/\u00a0/g, " "),
    x,
    y,
    width,
    height,
    end: x + width,
    vertical: Math.abs(b) > Math.abs(a),
  };
}

function expandWideSpaces(item) {
  const str = item.str;
  if (!/ {2,}|\t/.test(str)) return [item];
  const charW = item.width / Math.max(str.length, 1);
  const parts = [];
  const tokens = str.split(/(\s{2,}|\t+)/);
  let x = item.x;
  for (const token of tokens) {
    if (!token) continue;
    const w = token.length * charW;
    if (!/^\s+$/.test(token)) {
      parts.push({ ...item, str: token, x, width: w, end: x + w });
    }
    x += w;
  }
  return parts.length ? parts : [item];
}

function dedupeItems(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x || a.str.localeCompare(b.str));
  const out = [];
  for (const item of sorted) {
    const prev = out.find((other) =>
      other.str === item.str &&
      Math.abs(other.x - item.x) < 0.8 &&
      Math.abs(other.y - item.y) < 0.8);
    if (!prev) out.push(item);
  }
  return out;
}

function clusterRows(items) {
  const heights = items.map((item) => item.height).filter((height) => height > 0).sort((a, b) => a - b);
  const medH = heights.length ? heights[Math.floor(heights.length / 2)] : 10;
  const tol = Math.max(2, medH * 0.45);
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const item of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - item.y) <= tol) last.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return { rows, medH };
}

function findSeparators(rows, medH) {
  const minGap = Math.max(7, medH * GAP_FACTOR);
  const minSep = Math.max(4, medH * SEPARATOR_FACTOR);
  const gaps = [];
  let voters = 0;
  for (const row of rows) {
    const items = [...row.items].sort((a, b) => a.x - b.x);
    let voted = false;
    for (let i = 1; i < items.length; i++) {
      const start = items[i - 1].end;
      const end = items[i].x;
      if (end - start >= minGap) {
        gaps.push([start, end]);
        voted = true;
      }
    }
    if (voted) voters += 1;
  }
  if (!gaps.length) return [];

  const need = voters <= 1 ? 1 : voters === 2 ? 2 : Math.max(2, Math.ceil(voters * 0.5));
  let minX = Infinity;
  let maxX = -Infinity;
  for (const [start, end] of gaps) {
    minX = Math.min(minX, start);
    maxX = Math.max(maxX, end);
  }
  const origin = minX;
  const bins = Math.max(1, Math.ceil(maxX - origin) + 2);
  const votes = new Uint16Array(bins);
  for (const [start, end] of gaps) {
    const from = Math.max(0, Math.floor(start - origin));
    const to = Math.min(bins, Math.ceil(end - origin));
    for (let i = from; i < to; i++) votes[i] += 1;
  }

  const separators = [];
  let i = 0;
  while (i < bins) {
    if (votes[i] >= need) {
      const start = i;
      while (i < bins && votes[i] >= need) i += 1;
      if (i - start >= minSep) {
        let best = -1;
        for (let k = start; k < i; k++) if (votes[k] > best) best = votes[k];
        let a = start;
        let b = i - 1;
        while (a <= b && votes[a] < best) a += 1;
        while (b >= a && votes[b] < best) b -= 1;
        separators.push(origin + (a + b + 1) / 2);
      }
    } else {
      i += 1;
    }
  }
  return separators;
}

function assignRow(row, separators) {
  const cells = Array.from({ length: separators.length + 1 }, () => []);
  const items = [...row.items].sort((a, b) => a.x - b.x);
  for (const item of items) {
    // Left edge keeps a title that starts in the first column in that column,
    // even when the words run across the gap. Right-aligned amounts still
    // start to the right of the gutter, so they stay in their own column.
    let col = 0;
    while (col < separators.length && item.x > separators[col]) col += 1;
    cells[col].push(item);
  }
  return cells.map((group) => joinItems(group));
}

function joinItems(items) {
  if (!items.length) return "";
  const sorted = [...items].sort((a, b) => a.x - b.x || a.y - b.y);
  let text = "";
  let prev = null;
  for (const item of sorted) {
    if (prev) {
      const gap = item.x - prev.end;
      const spaceAt = Math.max(1.2, Math.min(prev.height, item.height) * 0.15);
      if (gap > spaceAt) text += " ";
    }
    text += item.str;
    prev = item;
  }
  return text.replace(/[ \t\r\n]+/g, " ").trim();
}

function dropEmptyColumns(table) {
  if (!table.length) return table;
  const width = table.reduce((max, row) => Math.max(max, row.length), 0);
  const keep = [];
  for (let c = 0; c < width; c++) {
    if (table.some((row) => (row[c] || "").trim())) keep.push(c);
  }
  return table.map((row) => keep.map((c) => row[c] || ""));
}
