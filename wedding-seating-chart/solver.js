export const FREE_GUEST_LIMIT = 40;

export function guestLimitMessage(count, pro) {
  if (pro || count <= FREE_GUEST_LIMIT) return "";
  return `The free seating chart stops at ${FREE_GUEST_LIMIT} guests. This list has ${count}. Unlock Pro for this event, or shorten the list.`;
}

export function canon(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function splitLines(text) {
  return String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function parseGuestLines(text) {
  const guests = [];
  const seen = new Set();
  let duplicates = 0;
  for (const line of splitLines(text)) {
    const name = cleanName(line);
    if (!name) continue;
    const key = canon(name);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    guests.push(name);
  }
  return { guests, duplicates };
}

export function parseTogetherLines(text) {
  const groups = [];
  const errors = [];
  splitLines(text).forEach((line, index) => {
    const names = [];
    const seen = new Set();
    line.split(/,|&|\band\b/i).forEach((part) => {
      const name = cleanName(part);
      if (!name) return;
      const key = canon(name);
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    if (names.length < 2) errors.push(`Together line ${index + 1} needs at least two names.`);
    else groups.push(names);
  });
  return { groups, errors };
}

export function parseApartLines(text) {
  const pairs = [];
  const errors = [];
  splitLines(text).forEach((line, index) => {
    const names = line.split(/[|]/).map(cleanName).filter(Boolean);
    if (names.length !== 2) errors.push(`Keep-apart line ${index + 1} needs two names separated by |.`);
    else if (canon(names[0]) === canon(names[1])) errors.push(`Keep-apart line ${index + 1} lists the same person twice.`);
    else pairs.push(names);
  });
  return { pairs, errors };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return function rand() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seatsUsed(table) {
  return table.blocks.reduce((sum, block) => sum + block.members.length, 0);
}

function peopleCount(blocks) {
  return blocks.reduce((sum, block) => sum + block.members.length, 0);
}

function copyState(state) {
  return {
    tables: state.tables.map((table) => ({ blocks: table.blocks.slice() })),
    unseated: state.unseated.slice(),
  };
}

function variance(state) {
  const counts = state.tables.map(seatsUsed);
  const mean = counts.reduce((sum, count) => sum + count, 0) / (counts.length || 1);
  return counts.reduce((sum, count) => sum + (count - mean) ** 2, 0);
}

function better(next, prev) {
  const nextUnseated = peopleCount(next.unseated);
  const prevUnseated = peopleCount(prev.unseated);
  if (nextUnseated !== prevUnseated) return nextUnseated < prevUnseated;
  return variance(next) < variance(prev) - 1e-9;
}

function isLegal(state, seats, conflicts) {
  return state.tables.every((table) => {
    if (seatsUsed(table) > seats) return false;
    return table.blocks.every((block, index) => table.blocks.slice(index + 1).every((other) => !conflicts(block, other)));
  });
}

function placeGreedy(blocks, tableCount, seats, conflicts) {
  const tables = Array.from({ length: tableCount }, () => ({ blocks: [] }));
  const unseated = [];
  const ordered = blocks.slice().sort((a, b) => b.members.length - a.members.length || a.members[0].display.localeCompare(b.members[0].display));
  for (const block of ordered) {
    let best = -1;
    let bestRoom = Infinity;
    tables.forEach((table, index) => {
      const room = seats - seatsUsed(table);
      if (block.members.length > room) return;
      if (table.blocks.some((other) => conflicts(other, block))) return;
      if (room < bestRoom) {
        best = index;
        bestRoom = room;
      }
    });
    if (best === -1) unseated.push(block);
    else tables[best].blocks.push(block);
  }
  return { tables, unseated };
}

function repair(state, seats, conflicts) {
  let guard = 0;
  let moved = true;
  while (moved && guard < 80) {
    moved = false;
    guard += 1;
    for (let index = 0; index < state.unseated.length; index++) {
      const block = state.unseated[index];
      const table = state.tables.find((candidate) => seatsUsed(candidate) + block.members.length <= seats && candidate.blocks.every((other) => !conflicts(other, block)));
      if (!table) continue;
      table.blocks.push(block);
      state.unseated.splice(index, 1);
      moved = true;
      break;
    }
  }
}

function mutate(state, seats, conflicts, rand) {
  if (state.unseated.length && rand() < 0.55) {
    const from = Math.floor(rand() * state.unseated.length);
    const block = state.unseated[from];
    const table = state.tables[Math.floor(rand() * state.tables.length)];
    const ejected = [];
    table.blocks = table.blocks.filter((other) => {
      if (!conflicts(other, block)) return true;
      ejected.push(other);
      return false;
    });
    while (seatsUsed(table) + block.members.length > seats && table.blocks.length) {
      let small = 0;
      table.blocks.forEach((other, index) => {
        if (other.members.length < table.blocks[small].members.length) small = index;
      });
      ejected.push(table.blocks.splice(small, 1)[0]);
    }
    if (seatsUsed(table) + block.members.length > seats) {
      table.blocks.push(...ejected);
      return false;
    }
    state.unseated.splice(from, 1);
    table.blocks.push(block);
    state.unseated.push(...ejected);
    return true;
  }
  const sources = state.tables.map((table, index) => index).filter((index) => state.tables[index].blocks.length);
  if (!sources.length) return false;
  const from = sources[Math.floor(rand() * sources.length)];
  const blockIndex = Math.floor(rand() * state.tables[from].blocks.length);
  const block = state.tables[from].blocks[blockIndex];
  const to = Math.floor(rand() * state.tables.length);
  if (to === from) return false;
  const dest = state.tables[to];
  if (dest.blocks.some((other) => conflicts(other, block))) return false;
  if (seatsUsed(dest) + block.members.length > seats) return false;
  state.tables[from].blocks.splice(blockIndex, 1);
  dest.blocks.push(block);
  return true;
}

function search(state, seats, conflicts, rand, iterations) {
  let best = state;
  for (let n = 0; n < iterations; n++) {
    const trial = copyState(best);
    if (!mutate(trial, seats, conflicts, rand)) continue;
    if (!isLegal(trial, seats, conflicts)) continue;
    if (better(trial, best)) best = trial;
    if (peopleCount(best.unseated) === 0 && variance(best) < 1e-9) break;
  }
  return best;
}

function buildBlocks(guests, together) {
  const parent = new Map();
  const display = new Map();
  function add(name) {
    const key = canon(name);
    if (!parent.has(key)) parent.set(key, key);
    if (!display.has(key)) display.set(key, cleanName(name));
    return key;
  }
  function find(key) {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    let cursor = key;
    while (parent.get(cursor) !== root) {
      const next = parent.get(cursor);
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  }
  const keys = guests.map(add);
  together.forEach((group) => {
    const groupKeys = group.map(add);
    for (let i = 1; i < groupKeys.length; i++) {
      const left = find(groupKeys[0]);
      const right = find(groupKeys[i]);
      if (left !== right) parent.set(right, left);
    }
  });
  const grouped = new Map();
  for (const key of keys) {
    const root = find(key);
    if (!grouped.has(root)) grouped.set(root, []);
    if (!grouped.get(root).some((member) => member.key === key)) {
      grouped.get(root).push({ key, display: display.get(key) });
    }
  }
  let id = 1;
  return [...grouped.values()].map((members) => {
    members.sort((a, b) => a.display.localeCompare(b.display));
    return { id: id++, members };
  });
}

export function assessAssignment({ tables = [], unseated = [], together = [], apart = [], seatsPerTable, guests = [] }) {
  const violations = [];
  const location = new Map();
  tables.forEach((table) => {
    if (table.guests.length > seatsPerTable) {
      violations.push({ type: "capacity", message: `Table ${table.id} has ${table.guests.length} guests and ${seatsPerTable} seats.` });
    }
    table.guests.forEach((name) => {
      const key = canon(name);
      if (location.has(key)) violations.push({ type: "duplicate", message: `${name} is listed more than once.` });
      location.set(key, table.id);
    });
  });
  unseated.forEach((name) => {
    const key = canon(name);
    if (!location.has(key)) location.set(key, 0);
  });
  guests.forEach((name) => {
    if (!location.has(canon(name))) violations.push({ type: "missing", message: `${name} is not seated.` });
  });
  together.forEach((group) => {
    const places = new Set(group.map((name) => location.get(canon(name))).filter((place) => place != null));
    if (places.size > 1) violations.push({ type: "together", message: `${group.join(", ")} should sit at the same table.` });
  });
  apart.forEach(([left, right]) => {
    const a = location.get(canon(left));
    const b = location.get(canon(right));
    if (a && b && a === b) violations.push({ type: "apart", message: `${left} and ${right} should not sit at the same table.` });
  });
  return violations;
}

export function solveSeating(input, options = {}) {
  const guests = input.guests || [];
  const together = input.together || [];
  const apart = input.apart || [];
  const tableCount = Number(input.tableCount);
  const seatsPerTable = Number(input.seatsPerTable);
  const errors = [];
  const notes = [];
  if (!guests.length) errors.push("Add at least one guest.");
  if (!Number.isInteger(tableCount) || tableCount < 1 || tableCount > 150) errors.push("Table count needs to be a whole number from 1 to 150.");
  if (!Number.isInteger(seatsPerTable) || seatsPerTable < 1 || seatsPerTable > 40) errors.push("Seats per table needs to be a whole number from 1 to 40.");
  const known = new Set(guests.map(canon));
  const seenGuest = new Set();
  guests.forEach((name) => {
    const key = canon(name);
    if (seenGuest.has(key)) notes.push(`Duplicate guest “${name}” was combined.`);
    seenGuest.add(key);
  });
  function unknownNames(names) {
    return names.filter((name) => !known.has(canon(name)));
  }
  together.forEach((group) => {
    const missing = unknownNames(group);
    if (missing.length) errors.push(`Add these guests before seating them together: ${missing.join(", ")}.`);
  });
  apart.forEach(([left, right]) => {
    const missing = unknownNames([left, right]);
    if (missing.length) errors.push(`Add these guests before keeping them apart: ${missing.join(", ")}.`);
  });
  if (errors.length) return { ok: false, errors, notes, tables: [], unseated: [] };

  const uniqueGuests = [];
  const uniqueKeys = new Set();
  guests.forEach((name) => {
    const key = canon(name);
    if (uniqueKeys.has(key)) return;
    uniqueKeys.add(key);
    uniqueGuests.push(cleanName(name));
  });
  const blocks = buildBlocks(uniqueGuests, together);
  const blockOf = new Map();
  blocks.forEach((block) => block.members.forEach((member) => blockOf.set(member.key, block.id)));
  apart.forEach(([left, right]) => {
    if (blockOf.get(canon(left)) && blockOf.get(canon(left)) === blockOf.get(canon(right))) {
      errors.push(`${left} and ${right} are in the same must-sit-together group, so they cannot also be kept apart.`);
    }
  });
  blocks.forEach((block) => {
    if (block.members.length > seatsPerTable) {
      errors.push(`${block.members.map((member) => member.display).join(", ")} must sit together, but that is ${block.members.length} people and each table has ${seatsPerTable} seats.`);
    }
  });
  if (errors.length) return { ok: false, errors, notes, tables: [], unseated: [] };

  const conflictIds = new Set();
  apart.forEach(([left, right]) => {
    const a = blockOf.get(canon(left));
    const b = blockOf.get(canon(right));
    if (!a || !b || a === b) return;
    conflictIds.add(`${Math.min(a, b)}|${Math.max(a, b)}`);
  });
  const conflicts = (a, b) => conflictIds.has(`${Math.min(a.id, b.id)}|${Math.max(a.id, b.id)}`);
  if (uniqueGuests.length > tableCount * seatsPerTable) {
    notes.push(`There are ${uniqueGuests.length} guests and ${tableCount * seatsPerTable} seats, so not everyone can be seated.`);
  }

  let state = placeGreedy(blocks, tableCount, seatsPerTable, conflicts);
  repair(state, seatsPerTable, conflicts);
  const iterations = options.iterations ?? Math.min(2000, 300 + blocks.length * 25);
  state = search(state, seatsPerTable, conflicts, mulberry32(options.seed ?? 1), iterations);
  repair(state, seatsPerTable, conflicts);

  const tables = state.tables.map((table, index) => ({
    id: index + 1,
    guests: table.blocks.flatMap((block) => block.members.map((member) => member.display)),
  }));
  const unseated = state.unseated.flatMap((block) => block.members.map((member) => member.display));
  if (unseated.length) notes.push(`${unseated.join(", ")} could not be seated without breaking a rule or overflowing a table.`);
  const violations = assessAssignment({
    tables,
    unseated,
    together,
    apart,
    seatsPerTable,
    guests: uniqueGuests.filter((name) => !unseated.some((missing) => canon(missing) === canon(name))),
  });
  return {
    ok: unseated.length === 0 && violations.length === 0,
    errors,
    notes,
    tables,
    unseated,
    violations,
  };
}
