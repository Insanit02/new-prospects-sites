import assert from "node:assert/strict";
import {
  assessAssignment,
  FREE_GUEST_LIMIT,
  guestLimitMessage,
  parseApartLines,
  parseGuestLines,
  parseTogetherLines,
  solveSeating,
} from "./solver.js";

assert.equal(FREE_GUEST_LIMIT, 40);
assert.equal(guestLimitMessage(40, false), "");
assert.match(guestLimitMessage(41, false), /40/);
assert.equal(guestLimitMessage(80, true), "");

const guests = parseGuestLines("Alex Chen\nalex chen\nJordan Lee\n");
assert.deepEqual(guests.guests, ["Alex Chen", "Jordan Lee"]);
assert.equal(guests.duplicates, 1);
assert.deepEqual(parseTogetherLines("Alex Chen, Jordan Lee\nSam Patel & Riley Quinn").groups, [
  ["Alex Chen", "Jordan Lee"],
  ["Sam Patel", "Riley Quinn"],
]);
assert.equal(parseTogetherLines("Only one").errors.length, 1);
assert.deepEqual(parseApartLines("Alex Chen | Sam Patel").pairs, [["Alex Chen", "Sam Patel"]]);
assert.equal(parseApartLines("Alex Chen, Sam Patel").errors.length, 1);

function seated(result) {
  return result.tables.reduce((sum, table) => sum + table.guests.length, 0);
}

function sameTable(result, a, b) {
  const tableA = result.tables.find((table) => table.guests.some((name) => name.toLowerCase() === a.toLowerCase()));
  const tableB = result.tables.find((table) => table.guests.some((name) => name.toLowerCase() === b.toLowerCase()));
  return tableA && tableB && tableA.id === tableB.id;
}

const party = ["Alex Chen", "Jordan Lee", "Sam Patel", "Riley Quinn", "Casey Brooks", "Taylor Nguyen", "Morgan Diaz", "Avery Shah"];
const solved = solveSeating({
  guests: party,
  together: [["Alex Chen", "Jordan Lee"], ["Sam Patel", "Riley Quinn"]],
  apart: [["Alex Chen", "Sam Patel"], ["Casey Brooks", "Taylor Nguyen"]],
  tableCount: 2,
  seatsPerTable: 4,
});
assert.equal(solved.ok, true, JSON.stringify(solved));
assert.equal(seated(solved), 8);
assert.equal(solved.unseated.length, 0);
assert.equal(sameTable(solved, "Alex Chen", "Jordan Lee"), true);
assert.equal(sameTable(solved, "Sam Patel", "Riley Quinn"), true);
assert.equal(sameTable(solved, "Alex Chen", "Sam Patel"), false);
assert.equal(sameTable(solved, "Casey Brooks", "Taylor Nguyen"), false);
assert.equal(solved.tables.every((table) => table.guests.length <= 4), true);

const again = solveSeating({
  guests: party,
  together: [["alex chen", "jordan lee"], ["Sam Patel", "Riley Quinn"]],
  apart: [["Alex Chen", "Sam Patel"], ["Casey Brooks", "Taylor Nguyen"]],
  tableCount: 2,
  seatsPerTable: 4,
}, { seed: 1 });
assert.equal(JSON.stringify(again.tables), JSON.stringify(solved.tables));

const tight = solveSeating({
  guests: ["A", "B", "C", "D", "E"],
  together: [],
  apart: [],
  tableCount: 2,
  seatsPerTable: 2,
});
assert.equal(tight.ok, false);
assert.equal(seated(tight) + tight.unseated.length, 5);
assert.equal(seated(tight), 4);
assert.equal(tight.tables.every((table) => table.guests.length <= 2), true);

const tooBig = solveSeating({
  guests: ["A", "B", "C"],
  together: [["A", "B", "C"]],
  apart: [],
  tableCount: 2,
  seatsPerTable: 2,
});
assert.equal(tooBig.ok, false);
assert.equal(tooBig.tables.length, 0);
assert.match(tooBig.errors.join(" "), /must sit together/);

const clash = solveSeating({
  guests: ["A", "B"],
  together: [["A", "B"]],
  apart: [["A", "B"]],
  tableCount: 1,
  seatsPerTable: 2,
});
assert.equal(clash.tables.length, 0);
assert.match(clash.errors.join(" "), /kept apart/);

const unknown = solveSeating({
  guests: ["A"],
  together: [["A", "Z"]],
  apart: [],
  tableCount: 1,
  seatsPerTable: 2,
});
assert.match(unknown.errors.join(" "), /Z/);

const oneTable = solveSeating({
  guests: ["A", "B", "C", "D"],
  together: [],
  apart: [["A", "B"]],
  tableCount: 1,
  seatsPerTable: 4,
});
assert.equal(oneTable.tables.some((table) => table.guests.includes("A") && table.guests.includes("B")), false);

const many = Array.from({ length: 40 }, (_, index) => `Guest ${index + 1}`);
const full = solveSeating({ guests: many, together: [], apart: [], tableCount: 5, seatsPerTable: 8 });
assert.equal(full.ok, true);
assert.equal(seated(full), 40);

const handmade = assessAssignment({
  tables: [{ id: 1, guests: ["A", "B"] }, { id: 2, guests: ["C"] }],
  together: [],
  apart: [["A", "B"]],
  seatsPerTable: 4,
  guests: ["A", "B", "C"],
});
assert.equal(handmade.some((item) => item.type === "apart"), true);

const overfull = assessAssignment({
  tables: [{ id: 1, guests: ["A", "B", "C"] }],
  seatsPerTable: 2,
  guests: ["A", "B", "C"],
});
assert.equal(overfull.some((item) => item.type === "capacity"), true);
