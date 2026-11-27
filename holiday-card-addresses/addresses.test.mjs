import assert from "node:assert/strict";
import {
  FREE_ADDRESS_LIMIT,
  LABEL_FORMATS,
  SAMPLE_CSV,
  applyEdit,
  cleanRecord,
  cleanZip,
  duplicateGroups,
  formatState,
  householdLabel,
  labelPages,
  mergeRows,
  paginate,
  parseAddresses,
  parseCityStateZip,
  printSheetsHtml,
  takeFreeLimit,
  toFlaggedCsv,
  toMailMergeCsv,
  undoMerge,
} from "./clean.js";

assert.equal(FREE_ADDRESS_LIMIT, 25);
assert.equal(LABEL_FORMATS["5160"].perSheet, 30);
assert.equal(LABEL_FORMATS["5163"].perSheet, 10);

assert.equal(cleanZip("2134", true), "02134");
assert.equal(cleanZip("2134.0", true), "02134");
assert.equal(cleanZip("501", true), "00501");
assert.equal(cleanZip("02134", true), "02134");
assert.equal(cleanZip("021346789", true), "02134-6789");
assert.equal(cleanZip("21346789", true), "02134-6789");
assert.equal(cleanZip("12345-6789", true), "12345-6789");
assert.equal(cleanZip("K1A 0B1", true), "K1A 0B1");
assert.equal(cleanZip("200000", false), "200000");

assert.equal(formatState("MASSACHUSETTS"), "MA");
assert.equal(formatState("massachusetts"), "MA");
assert.equal(formatState("Mass."), "MA");
assert.equal(formatState("Washington"), "WA");
assert.equal(formatState("District of Columbia"), "DC");
assert.equal(formatState("D.C."), "DC");
assert.equal(formatState("ny"), "NY");
assert.equal(formatState("Ontario"), "ON");

const caps = cleanRecord({
  name: "JOHN SMITH III",
  street: "15 NE 3RD ST",
  street2: "PO BOX 12",
  city: "BOSTON",
  state: "MASSACHUSETTS",
  zip: "2134",
  country: "USA",
});
assert.equal(caps.name, "John Smith III");
assert.equal(caps.street, "15 NE 3rd St");
assert.equal(caps.street2, "PO Box 12");
assert.equal(caps.city, "Boston");
assert.equal(caps.state, "MA");
assert.equal(caps.zip, "02134");
assert.equal(caps.country, "United States");
assert.equal(caps.changed, true);
assert.equal(caps.flags.includes("Likely non-US"), false);

const dotted = cleanRecord({ name: "Pat Ng", street: "P.O. BOX 12", city: "Austin", state: "TX", zip: "78701", country: "" });
assert.equal(dotted.street, "PO Box 12");

const mixed = cleanRecord({ name: "Mary-Jane O'Neil", street: "123 Main St", city: "Boston", state: "MA", zip: "02134", country: "" });
assert.equal(mixed.name, "Mary-Jane O'Neil");
assert.equal(mixed.changed, false);

const lower = cleanRecord({ name: "mary jane smith", street: "po box 4", city: "ames", state: "iowa", zip: "50010", country: "" });
assert.equal(lower.name, "Mary Jane Smith");
assert.equal(lower.street, "PO Box 4");
assert.equal(lower.state, "IA");

const spaces = cleanRecord({ name: "Ada  Lovelace", street: "1  Main   St", city: "Boston,,  MA", state: "MA", zip: "02134", country: "" });
assert.equal(spaces.name, "Ada Lovelace");
assert.equal(spaces.street, "1 Main St");
assert.equal(spaces.city, "Boston, MA");

const quoted = `Name,Street,City,State,ZIP,Country
"Smith, John","123 Main St, Apt 4",Boston,MA,02134,USA
"Chen, Wei","88 Nanjing Road, Floor 2",Shanghai,,200000,China
`;
const quotedParsed = parseAddresses(quoted);
assert.equal(quotedParsed.needsMapping, false);
assert.equal(quotedParsed.rows.length, 2);
assert.equal(quotedParsed.rows[0].name, "John Smith");
assert.equal(quotedParsed.rows[0].street, "123 Main St, Apt 4");
assert.equal(quotedParsed.rows[0].state, "MA");
assert.equal(quotedParsed.rows[1].name, "Wei Chen");
assert.equal(quotedParsed.rows[1].flags.includes("Likely non-US"), true);
assert.equal(quotedParsed.rows[1].street, "88 Nanjing Road, Floor 2");

const blocks = `JOHN SMITH
123 MAIN ST
BOSTON, MASSACHUSETTS 2134

jane doe
9 elm street
apt 2
portland, oregon 97201

Wei Chen
88 Nanjing Road
Shanghai 200000
China
`;
const blockParsed = parseAddresses(blocks);
assert.equal(blockParsed.format, "blocks");
assert.equal(blockParsed.rows.length, 3);
assert.equal(blockParsed.rows[0].name, "John Smith");
assert.equal(blockParsed.rows[0].street, "123 Main St");
assert.equal(blockParsed.rows[0].city, "Boston");
assert.equal(blockParsed.rows[0].state, "MA");
assert.equal(blockParsed.rows[0].zip, "02134");
assert.equal(blockParsed.rows[1].name, "Jane Doe");
assert.equal(blockParsed.rows[1].street, "9 Elm Street");
assert.equal(blockParsed.rows[1].street2, "Apt 2");
assert.equal(blockParsed.rows[1].state, "OR");
assert.equal(blockParsed.rows[2].country, "China");
assert.equal(blockParsed.rows[2].flags.includes("Likely non-US"), true);

assert.deepEqual(parseCityStateZip("Austin TX 78701"), { city: "Austin", state: "TX", zip: "78701" });
assert.equal(parseCityStateZip("Toronto, Ontario K1A 0B1").zip, "K1A 0B1");

const google = `Name,Given Name,Family Name,Address 1 - Street,Address 1 - City,Address 1 - Region,Address 1 - Postal Code,Address 1 - Country,E-mail 1 - Value
Jordan Lee,Jordan,Lee,10 King St,Cambridge,Massachusetts,2139,United States,jordan@example.com
`;
const googleParsed = parseAddresses(google);
assert.equal(googleParsed.rows.length, 1);
assert.equal(googleParsed.rows[0].name, "Jordan Lee");
assert.equal(googleParsed.rows[0].street, "10 King St");
assert.equal(googleParsed.rows[0].state, "MA");
assert.equal(googleParsed.rows[0].zip, "02139");
assert.equal(JSON.stringify(googleParsed.rows).includes("jordan@example.com"), false);

const outlook = `First Name,Last Name,Home Street,Home City,Home State,Home Postal Code,Business Street,Business City
Riley,Quinn,22 Oak Rd,Madison,Wisconsin,53703,1 Office Park,Milwaukee
`;
const outlookParsed = parseAddresses(outlook);
assert.equal(outlookParsed.rows[0].name, "Riley Quinn");
assert.equal(outlookParsed.rows[0].street, "22 Oak Rd");
assert.equal(outlookParsed.rows[0].city, "Madison");
assert.equal(outlookParsed.rows[0].state, "WI");

const headerless = `John Smith,123 Main St,Boston,MA,02134
Jane Doe,9 Elm St,Portland,OR,97201
`;
const headerlessParsed = parseAddresses(headerless);
assert.equal(headerlessParsed.format, "csv");
assert.equal(headerlessParsed.needsMapping, true);
assert.equal(headerlessParsed.rows.length, 0);
const mapped = parseAddresses(headerless, {
  format: "csv",
  hasHeader: false,
  mapping: { name: 0, street: 1, city: 2, state: 3, zip: 4 },
});
assert.equal(mapped.needsMapping, false);
assert.equal(mapped.rows.length, 2);
assert.equal(mapped.rows[0].city, "Boston");
assert.equal(mapped.rows[1].state, "OR");

const sample = parseAddresses(SAMPLE_CSV);
assert.equal(sample.rows.length, 11);
const smiths = sample.rows.filter((row) => row.last === "Smith" && row.zip === "02134");
assert.equal(smiths.length, 2);
assert.equal(householdLabel(smiths, "ampersand"), "John & Jane Smith");
assert.equal(householdLabel(smiths, "family"), "The Smith Family");
assert.equal(householdLabel(smiths, "first"), "John Smith");
const groups = duplicateGroups(sample.rows);
assert.equal(groups.length, 2);
const merged = mergeRows(sample.rows, smiths.map((row) => row.id), "ampersand");
assert.equal(merged.length, sample.rows.length - 1);
const household = merged.find((row) => row.name === "John & Jane Smith");
assert.ok(household);
assert.equal(household.mergedCount, 1);
assert.equal(household.zip, "02134");
assert.equal(household.state, "MA");
const restored = undoMerge(merged, household.id);
assert.equal(restored.length, sample.rows.length);
assert.equal(restored.filter((row) => row.name === "John Smith" || row.name === "Jane Smith").length, 2);

const missing = cleanRecord({ name: "Riley Cho", street: "10 Pine Rd", city: "Denver", state: "Colorado", zip: "", country: "" });
assert.deepEqual(missing.flags, ["Missing ZIP"]);
assert.equal(missing.state, "CO");

const badZip = cleanRecord({ name: "A", street: "1 Main", city: "Boston", state: "MA", zip: "ABCDE", country: "" });
assert.equal(badZip.flags.includes("ZIP doesn't look valid"), true);

const edited = applyEdit(caps, "zip", "2138");
assert.equal(edited.zip, "02138");
assert.equal(edited.id, caps.id);

const many = Array.from({ length: 30 }, (_, index) => cleanRecord({
  name: `Person ${index}`,
  street: `${index} Main St`,
  city: "Boston",
  state: "MA",
  zip: "02134",
  country: "",
}));
const limited = takeFreeLimit(many, false);
assert.equal(limited.rows.length, 25);
assert.equal(limited.omitted, 5);
assert.equal(takeFreeLimit(many, true).omitted, 0);

const pages = labelPages(many, "5160");
assert.equal(pages.pages.length, 1);
assert.equal(pages.pages[0].length, 30);
const overflow = labelPages([...many, cleanRecord({ name: "Extra", street: "2 Side St", city: "Boston", state: "MA", zip: "02134" })], "5160");
assert.equal(overflow.pages.length, 2);
assert.equal(overflow.pages[0].length, 30);
assert.equal(overflow.pages[1].length, 1);
assert.equal(paginate(many.slice(0, 10).map((row) => [row.name]), 10).length, 1);
assert.equal(labelPages(many.slice(0, 11), "5163").pages.length, 2);

const html30 = printSheetsHtml(pages.pages, "5160");
assert.equal(html30.match(/class="sheet sheet-5160"/g).length, 1);
assert.equal(html30.match(/class="label"/g).length, 30);
const html31 = printSheetsHtml(overflow.pages, "5160");
assert.equal(html31.match(/class="sheet sheet-5160"/g).length, 2);
assert.equal(html31.includes("<script"), false);

const mergeCsv = toMailMergeCsv(merged);
assert.match(mergeCsv, /John & Jane Smith/);
assert.match(mergeCsv, /02134/);
const injected = applyEdit(quotedParsed.rows[0], "name", "=cmd");
assert.equal(injected.name, "=cmd");
const flagged = toFlaggedCsv([injected]);
assert.match(flagged, /'=cmd/);
assert.equal(flagged.split("\r\n").filter(Boolean).length, 2);

const excluded = sample.rows.map((row, index) => (index === 0 ? { ...row, included: false } : row));
assert.equal(duplicateGroups(excluded).some((group) => group.some((row) => row.name === "John Smith")), false);

console.log("holiday-card-addresses tests passed");
