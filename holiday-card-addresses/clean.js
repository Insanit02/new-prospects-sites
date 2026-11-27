// Address cleaning for holiday-card labels. Runs in the browser.
// Nothing in this file sends an address anywhere.

export const FREE_ADDRESS_LIMIT = 25;

export const LABEL_FORMATS = {
  "5160": { id: "5160", name: "Avery 5160 / 8160", perSheet: 30, columns: 3, rows: 10 },
  "5163": { id: "5163", name: "Avery 5163", perSheet: 10, columns: 2, rows: 5 },
};

const STATE_NAMES = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC", "washington dc": "DC", "washington d c": "DC",
  "puerto rico": "PR", guam: "GU", "virgin islands": "VI", "us virgin islands": "VI",
  "american samoa": "AS", "northern mariana islands": "MP",
  calif: "CA", fla: "FL", ill: "IL", mass: "MA", mich: "MI", minn: "MN",
  miss: "MS", tenn: "TN", tex: "TX", wash: "WA", ariz: "AZ", colo: "CO",
  conn: "CT", ore: "OR", penn: "PA", okla: "OK", wis: "WI",
};

for (const code of new Set(Object.values(STATE_NAMES))) {
  STATE_NAMES[code.toLowerCase()] = code;
}

const PROVINCE_NAMES = {
  alberta: "AB", "british columbia": "BC", manitoba: "MB", "new brunswick": "NB",
  "newfoundland and labrador": "NL", newfoundland: "NL", "nova scotia": "NS",
  "northwest territories": "NT", nunavut: "NU", ontario: "ON", "prince edward island": "PE",
  quebec: "QC", saskatchewan: "SK", yukon: "YT",
};

for (const code of new Set(Object.values(PROVINCE_NAMES))) {
  PROVINCE_NAMES[code.toLowerCase()] = code;
}

const US_COUNTRIES = new Set([
  "us", "usa", "u s", "u s a", "united states", "united states of america",
]);

const FIELD_ALIASES = {
  name: ["name", "full name", "display name", "contact name", "fn"],
  first: ["first name", "first", "given name", "givenname"],
  middle: ["middle name", "middle", "additional name"],
  last: ["last name", "last", "family name", "surname", "lastname"],
  prefix: ["name prefix", "prefix", "salutation"],
  suffix: ["name suffix", "suffix"],
  street: [
    "street", "address", "address 1", "address1", "address line 1", "street address",
    "address 1 street", "home street", "mailing street", "street 1", "business street",
    "work street", "home address", "mailing address",
  ],
  street2: [
    "street 2", "address 2", "address2", "address line 2", "address 1 extended address",
    "home street 2", "home street 3", "mailing street 2", "extended address",
    "business street 2", "address line 2",
  ],
  poBox: ["address 1 po box", "po box", "p o box", "home address po box"],
  city: [
    "city", "address 1 city", "home city", "mailing city", "town", "business city",
    "work city", "address city",
  ],
  state: [
    "state", "region", "province", "address 1 region", "home state", "mailing state",
    "state region", "state province", "business state", "address state",
  ],
  zip: [
    "zip", "zip code", "zipcode", "postal", "postal code", "postalcode", "postcode",
    "address 1 postal code", "home postal code", "mailing postal code", "zip postal code",
    "business postal code", "post code",
  ],
  country: [
    "country", "address 1 country", "home country", "mailing country", "business country",
    "address country",
  ],
  formatted: ["address 1 formatted", "formatted address", "address formatted"],
};

const STREET_ABBREV = {
  street: "st", avenue: "ave", road: "rd", drive: "dr", lane: "ln", court: "ct",
  boulevard: "blvd", place: "pl", terrace: "ter", circle: "cir", highway: "hwy",
  parkway: "pkwy", north: "n", south: "s", east: "e", west: "w",
  northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
};

const COUNTRY_LINE = /^(usa|u\.s\.a\.?|u\.s\.?|us|united states(?: of america)?|canada|mexico|uk|u\.k\.|united kingdom|england|scotland|wales|australia|china|japan|india|germany|france|italy|spain|ireland|new zealand|brazil)$/i;

let nextId = 1;

function nid() {
  const id = `a${nextId}`;
  nextId += 1;
  return id;
}

export function collapse(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^,\s*|\s*,$/g, "")
    .trim();
}

function stateKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toStateCode(value) {
  const key = stateKey(value);
  return key && STATE_NAMES[key] ? STATE_NAMES[key] : "";
}

export function toProvinceCode(value) {
  const key = stateKey(value);
  return key && PROVINCE_NAMES[key] ? PROVINCE_NAMES[key] : "";
}

function countryKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalCountry(value) {
  const key = countryKey(value);
  if (!key) return "";
  if (US_COUNTRIES.has(key)) return "United States";
  if (["uk", "u k", "united kingdom", "great britain", "britain", "england"].includes(key)) return "United Kingdom";
  if (key === "canada") return "Canada";
  return properCaseField(collapse(value), "city");
}

function needsCaseFix(text) {
  const letters = String(text).replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  return letters === letters.toUpperCase() || letters === letters.toLowerCase();
}

function fixWord(token, kind, index, words) {
  const comma = String(token).trim().endsWith(",") ? "," : "";
  const lower = String(token).toLowerCase().replace(/,/g, "");
  const apostrophe = lower.replace(/\./g, "");
  if (/^o'[a-z]+$/.test(apostrophe)) {
    return `O'${apostrophe.charAt(2).toUpperCase()}${apostrophe.slice(3)}${comma}`;
  }
  const letters = lower.replace(/[^a-z0-9]/g, "");
  if (!letters) return token;
  if (/^\d+$/.test(letters)) return letters + comma;
  if (/^\d+(st|nd|rd|th)$/.test(letters)) return letters + comma;
  const next = String(words[index + 1] || "").toLowerCase().replace(/[^a-z]/g, "");
  const prev = String(words[index - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
  if (kind === "street" && letters === "po" && next === "box") return `PO${comma}`;
  if (kind === "street" && letters === "box" && prev === "po") return `Box${comma}`;
  const romans = { ii: "II", iii: "III", iv: "IV", vi: "VI", vii: "VII", viii: "VIII", ix: "IX" };
  if (romans[letters]) return romans[letters] + comma;
  if (letters === "v" && kind === "name" && index === words.length - 1 && index > 0) return `V${comma}`;
  if (kind === "street") {
    const dirs = { n: "N", s: "S", e: "E", w: "W", ne: "NE", nw: "NW", se: "SE", sw: "SW" };
    if (dirs[letters]) return dirs[letters] + comma;
    const units = {
      apt: "Apt", ste: "Ste", unit: "Unit", suite: "Suite", apartment: "Apartment",
      bldg: "Bldg", fl: "Fl", rm: "Rm", dept: "Dept",
    };
    if (units[letters]) return units[letters] + comma;
  }
  if (kind === "name") {
    if (letters === "jr") return `Jr${comma}`;
    if (letters === "sr") return `Sr${comma}`;
    const particles = new Set(["de", "da", "del", "della", "van", "von", "der", "den", "la", "le", "di", "du"]);
    if (index > 0 && particles.has(letters)) return letters + comma;
    if (/^mc[a-z]{2,}$/.test(letters)) return `Mc${letters.charAt(2).toUpperCase()}${letters.slice(3)}${comma}`;
  }
  return letters.charAt(0).toUpperCase() + letters.slice(1) + comma;
}

export function properCaseField(value, kind) {
  const text = collapse(value);
  if (!text || !needsCaseFix(text)) return text;
  const words = text.split(" ");
  return words.map((word, index) => {
    if (word.includes("-") && word !== "-") {
      return word.split("-").map((part) => fixWord(part, kind, index, words)).join("-");
    }
    return fixWord(word, kind, index, words);
  }).join(" ");
}

export function formatState(value) {
  const text = collapse(value);
  if (!text) return "";
  const us = toStateCode(text);
  if (us) return us;
  const province = toProvinceCode(text);
  if (province) return province;
  return properCaseField(text, "city");
}

export function cleanZip(value, assumeUS) {
  let text = String(value ?? "").trim().replace(/\.0+$/, "").trim();
  if (!text) return "";
  text = text.replace(/\s+/g, " ").trim();
  const canadian = text.toUpperCase().match(/^([A-Z]\d[A-Z])\s?(\d[A-Z]\d)$/);
  if (canadian) return `${canadian[1]} ${canadian[2]}`;
  if (!assumeUS) return text;
  const compact = text.replace(/\s+/g, "");
  if (!/^[\d-]+$/.test(compact)) return text.toUpperCase();
  const digits = compact.replace(/\D/g, "");
  if (digits.length > 0 && digits.length <= 4) return digits.padStart(5, "0");
  if (digits.length === 5) return digits;
  if (digits.length === 8) {
    const padded = digits.padStart(9, "0");
    return `${padded.slice(0, 5)}-${padded.slice(5)}`;
  }
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return digits;
}

export function regionKind(addr) {
  const country = countryKey(addr.country);
  if (country && US_COUNTRIES.has(country)) return "us";
  if (country && !US_COUNTRIES.has(country)) return "non-us";
  if (addr.state && toStateCode(addr.state)) return "us";
  if (addr.state && toProvinceCode(addr.state)) return "non-us";
  if (addr.zip && /[A-Za-z]/.test(addr.zip)) return "non-us";
  if (addr.state) return "non-us";
  return "us";
}

export function flagsFor(addr) {
  const flags = [];
  if (!String(addr.street || "").trim()) flags.push("Missing street");
  if (!String(addr.city || "").trim()) flags.push("Missing city");
  if (!String(addr.state || "").trim()) flags.push("Missing state");
  if (!String(addr.zip || "").trim()) flags.push("Missing ZIP");
  else if (regionKind(addr) === "us" && !/^\d{5}(-\d{4})?$/.test(String(addr.zip))) flags.push("ZIP doesn't look valid");
  if (regionKind(addr) === "non-us") flags.push("Likely non-US");
  return flags;
}

function flipCommaName(name) {
  const match = String(name).match(/^([^,]+),\s*([^,]+)$/);
  if (!match) return name;
  const left = match[1].trim();
  const right = match[2].trim();
  if (!left || !right) return name;
  if (/\d/.test(left) || /\d/.test(right)) return name;
  if (/^(jr|sr|ii|iii|iv|v|vi|vii|viii|ix|esq)\.?$/i.test(right)) return name;
  return `${right} ${left}`;
}

export function personParts(row) {
  const name = String((row && row.name) || "").trim();
  const family = name.match(/^the\s+(.+?)\s+family$/i);
  if (family) return { first: "", last: family[1], family: true };
  const suffixRe = /^(jr|sr|ii|iii|iv|v|vi|vii|viii|ix|esq)\.?$/i;
  const parts = name.split(/\s+/).filter(Boolean);
  while (parts.length > 1 && suffixRe.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  const last = parts.pop();
  return { first: parts.join(" "), last };
}

export function cleanRecord(raw) {
  const input = {
    name: collapse(raw.name),
    street: collapse(raw.street),
    street2: collapse(raw.street2),
    city: collapse(raw.city),
    state: collapse(raw.state),
    zip: collapse(raw.zip),
    country: collapse(raw.country),
  };
  const country = canonicalCountry(input.country);
  const state = formatState(input.state);
  const previewZip = cleanZip(input.zip, false);
  const assumeUS = regionKind({ country, state, zip: previewZip }) !== "non-us";
  const zip = cleanZip(input.zip, assumeUS);
  let name = properCaseField(input.name, "name");
  name = flipCommaName(name);
  const street = properCaseField(input.street, "street");
  const street2 = properCaseField(input.street2, "street");
  const city = properCaseField(input.city, "city");
  const row = {
    id: nid(),
    included: true,
    name,
    street,
    street2,
    city,
    state,
    zip,
    country,
    mergedCount: 0,
    mergeId: "",
    undo: null,
  };
  const person = personParts(row);
  row.first = person.first;
  row.last = person.last;
  row.flags = flagsFor(row);
  const after = { name, street, street2, city, state, zip, country };
  row.changed = Object.keys(input).some((key) => input[key] !== after[key]);
  return row;
}

export function applyEdit(row, field, value) {
  const allowed = ["name", "street", "street2", "city", "state", "zip", "country"];
  if (!row || !allowed.includes(field)) return row;
  const next = { ...row, flags: row.flags.slice(), undo: row.undo ? row.undo.map(snapshotRow) : null };
  if (field === "state") next.state = formatState(value);
  else if (field === "zip") {
    const preview = cleanZip(value, false);
    const assumeUS = regionKind({ ...next, zip: preview }) !== "non-us";
    next.zip = cleanZip(value, assumeUS);
  } else if (field === "country") next.country = canonicalCountry(value);
  else next[field] = collapse(value);
  if (field === "name" || field === "country") {
    const person = personParts(next);
    next.first = person.first;
    next.last = person.last;
  }
  next.flags = flagsFor(next);
  if (next[field] !== row[field]) next.changed = true;
  return next;
}

function looksLikeStreet(line) {
  return /^(p\.?\s*o\.?\s*box|post office box)\b/i.test(String(line || "").trim()) || /^\d/.test(String(line || "").trim());
}

export function parseCityStateZip(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const canadian = text.match(/^(.+?)[,\s]+([A-Za-z]{2})\.?\s+([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)$/);
  if (canadian && toProvinceCode(canadian[2])) {
    return {
      city: canadian[1].replace(/[,\s]+$/, ""),
      state: canadian[2],
      zip: `${canadian[3]} ${canadian[4]}`.toUpperCase(),
    };
  }
  const canadianName = text.match(/^(.+?)[,\s]+([A-Za-z][A-Za-z .]+?)\s+([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)$/);
  if (canadianName && toProvinceCode(canadianName[2])) {
    return {
      city: canadianName[1].replace(/[,\s]+$/, ""),
      state: canadianName[2],
      zip: `${canadianName[3]} ${canadianName[4]}`.toUpperCase(),
    };
  }
  const uk = text.match(/^(.+?)\s+([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})$/i);
  if (uk && !/^\d/.test(uk[1])) {
    return { city: uk[1].replace(/[,\s]+$/, ""), state: "", zip: uk[2].toUpperCase().replace(/\s+/, " ") };
  }
  const zipMatch = text.match(/^(.*?)[\s,]+(\d{5}(?:[-\s]\d{4})?|\d{8,9}|\d{3,4})$/);
  if (!zipMatch) return null;
  const zip = zipMatch[2].replace(/\s+/, "-");
  const rest = zipMatch[1].replace(/[,\s]+$/, "");
  if (!rest) return { city: "", state: "", zip };
  const two = rest.match(/^(.*?)[,\s]+([A-Za-z]{2})\.?$/);
  if (two && (toStateCode(two[2]) || toProvinceCode(two[2]))) {
    return { city: two[1].replace(/[,\s]+$/, ""), state: two[2].replace(/\./g, ""), zip };
  }
  const words = rest.replace(/[.,]/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const key = stateKey(words.slice(i).join(" "));
    if (key && (STATE_NAMES[key] || PROVINCE_NAMES[key]) && key.length > 2) {
      return { city: words.slice(0, i).join(" "), state: words.slice(i).join(" "), zip };
    }
  }
  return null;
}

function parseBlock(lines) {
  const parts = lines.slice();
  let country = "";
  if (parts.length >= 2 && COUNTRY_LINE.test(parts[parts.length - 1].trim())) country = parts.pop();
  let cszIndex = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parseCityStateZip(parts[i])) {
      cszIndex = i;
      break;
    }
  }
  if (cszIndex < 0) {
    return {
      name: parts[0] || "",
      street: parts[1] || "",
      street2: parts.slice(2).join(", "),
      city: "",
      state: "",
      zip: "",
      country,
    };
  }
  const csz = parseCityStateZip(parts[cszIndex]);
  const before = parts.slice(0, cszIndex);
  let name = "";
  let streetLines = before;
  if (before.length >= 2) {
    name = before[0];
    streetLines = before.slice(1);
  } else if (before.length === 1) {
    if (looksLikeStreet(before[0])) streetLines = before;
    else {
      name = before[0];
      streetLines = [];
    }
  }
  return {
    name,
    street: streetLines[0] || "",
    street2: streetLines.slice(1).join(", "),
    city: csz.city,
    state: csz.state,
    zip: csz.zip,
    country,
  };
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
        } else quoted = false;
      } else cell += ch;
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
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => String(value).trim()));
}

function detectDelimiter(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  let line = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') quoted = !quoted;
    else if ((ch === "\n" || ch === "\r") && !quoted) break;
    else line += ch;
  }
  const counts = { ",": 0, ";": 0, "\t": 0 };
  quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && counts[ch] != null) counts[ch] += 1;
  }
  if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

function normHeader(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function matchField(header) {
  const text = normHeader(header);
  if (!text) return "";
  if (/\b(e mail|email|phone|fax|mobile|website|url|birthday|notes)\b/.test(text)) return "";
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.includes(text)) return field;
  }
  return "";
}

function headerPenalty(header) {
  const text = normHeader(header);
  let penalty = 0;
  if (/\b(address 2|address 3|business|work|other|company)\b/.test(text)) penalty += 5;
  return penalty;
}

export function inferMapping(headers) {
  const best = {};
  headers.forEach((header, index) => {
    const field = matchField(header);
    if (!field) return;
    const penalty = headerPenalty(header);
    if (!best[field] || penalty < best[field].penalty) best[field] = { index, penalty };
  });
  const mapping = {};
  Object.entries(best).forEach(([field, info]) => {
    mapping[field] = info.index;
  });
  return mapping;
}

function hasField(mapping, field) {
  return Number.isInteger(mapping[field]) && mapping[field] >= 0;
}

export function mappingIsConfident(mapping) {
  const hasName = hasField(mapping, "name") || hasField(mapping, "first") || hasField(mapping, "last");
  const hasStreet = hasField(mapping, "street") || hasField(mapping, "poBox") || hasField(mapping, "formatted");
  const hasPlace = hasField(mapping, "city") || hasField(mapping, "state") || hasField(mapping, "zip") || hasField(mapping, "formatted");
  return hasName && hasStreet && hasPlace;
}

function valueAt(row, mapping, field) {
  if (!hasField(mapping, field)) return "";
  const value = row[mapping[field]];
  return value == null ? "" : String(value).trim();
}

function absorbFormatted(fields) {
  if (fields.street || !fields.formatted) return fields;
  const text = fields.formatted.trim();
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 2 && !fields.city && !fields.zip) {
    const block = parseBlock(lines);
    return { ...fields, ...block, name: fields.name || block.name };
  }
  const pieces = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (pieces.length >= 3 && !fields.city && !fields.state && !fields.zip) {
    const tail = parseCityStateZip(`${pieces[pieces.length - 2]}, ${pieces[pieces.length - 1]}`)
      || parseCityStateZip(pieces[pieces.length - 1]);
    if (tail && tail.zip) {
      const streetCount = pieces.length - (tail.city ? 2 : 1);
      return {
        ...fields,
        street: pieces.slice(0, Math.max(streetCount, 1)).join(", "),
        city: fields.city || tail.city,
        state: fields.state || tail.state,
        zip: fields.zip || tail.zip,
      };
    }
  }
  const firstLine = lines[0] || text;
  return { ...fields, street: firstLine };
}

function fieldsFromRow(row, mapping) {
  const fields = {
    name: valueAt(row, mapping, "name"),
    first: valueAt(row, mapping, "first"),
    middle: valueAt(row, mapping, "middle"),
    last: valueAt(row, mapping, "last"),
    prefix: valueAt(row, mapping, "prefix"),
    suffix: valueAt(row, mapping, "suffix"),
    street: valueAt(row, mapping, "street"),
    street2: valueAt(row, mapping, "street2"),
    poBox: valueAt(row, mapping, "poBox"),
    city: valueAt(row, mapping, "city"),
    state: valueAt(row, mapping, "state"),
    zip: valueAt(row, mapping, "zip"),
    country: valueAt(row, mapping, "country"),
    formatted: valueAt(row, mapping, "formatted"),
  };
  if (!fields.street && fields.poBox) {
    fields.street = /box/i.test(fields.poBox) ? fields.poBox : `PO Box ${fields.poBox}`;
  }
  const absorbed = absorbFormatted(fields);
  if (!absorbed.name) {
    absorbed.name = [absorbed.prefix, absorbed.first, absorbed.middle, absorbed.last, absorbed.suffix].filter(Boolean).join(" ");
  }
  return absorbed;
}

function isPresent(row) {
  return ["name", "street", "street2", "city", "state", "zip", "country"].some((key) => String(row[key] || "").trim());
}

function blankResult(format, warning) {
  return {
    format,
    needsMapping: false,
    headers: [],
    hasHeader: false,
    mapping: {},
    rows: [],
    sample: [],
    warnings: warning ? [warning] : [],
  };
}

function parseBlocks(text) {
  const blocks = String(text || "").replace(/^\uFEFF/, "").split(/\n\s*\n/);
  const rows = [];
  blocks.forEach((block) => {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return;
    const row = cleanRecord(parseBlock(lines));
    if (isPresent(row)) rows.push(row);
  });
  return {
    format: "blocks",
    needsMapping: false,
    headers: [],
    hasHeader: false,
    mapping: {},
    rows,
    sample: [],
    warnings: rows.length ? [] : ["No addresses were found. Put a blank line between each address."],
  };
}

function parseSpreadsheet(text, options) {
  const delimiter = detectDelimiter(text);
  const table = parseCsvTable(text, delimiter);
  if (!table.length) return blankResult("csv", "No rows were found in that file.");
  const auto = inferMapping(table[0]);
  const headerLooksReal = mappingIsConfident(auto) || Object.keys(auto).length >= 2;
  const hasHeader = options.hasHeader == null ? headerLooksReal : !!options.hasHeader;
  const headers = hasHeader
    ? table[0].map((cell) => String(cell || "").trim())
    : table[0].map((_, index) => `Column ${index + 1}`);
  const mapping = options.mapping || (hasHeader ? auto : {});
  const data = hasHeader ? table.slice(1) : table;
  const sample = (hasHeader ? data : table).slice(0, 3);
  const confident = options.mapping ? Object.keys(options.mapping).length > 0 : (hasHeader && mappingIsConfident(auto));
  if (!confident) {
    return {
      format: "csv",
      needsMapping: true,
      headers,
      hasHeader,
      mapping: hasHeader ? auto : {},
      rows: [],
      sample,
      warnings: ["Choose which column is the name, street, city, state, and ZIP."],
    };
  }
  const rows = data.map((row) => cleanRecord(fieldsFromRow(row, mapping))).filter(isPresent);
  return {
    format: "csv",
    needsMapping: false,
    headers,
    hasHeader,
    mapping,
    rows,
    sample,
    warnings: rows.length ? [] : ["No addresses were found in that file."],
  };
}

export function detectFormat(text) {
  const source = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!source) return "empty";
  const delimiter = detectDelimiter(source);
  const table = parseCsvTable(source, delimiter);
  const auto = inferMapping(table[0] || []);
  if (table.length >= 2 && mappingIsConfident(auto)) return "csv";
  const width = (table[0] || []).length;
  const rectangular = table.length >= 2 && width >= 3 && table.every((row) => Math.abs(row.length - width) <= 1);
  const blocks = source.split(/\n\s*\n/).filter((block) => block.trim()).length;
  if (rectangular && blocks < 2) return "csv";
  return "blocks";
}

export function parseAddresses(text, options = {}) {
  const chosen = options.format && options.format !== "auto" ? options.format : detectFormat(text);
  if (chosen === "empty") return blankResult("empty", "Paste addresses or choose a CSV.");
  if (chosen === "blocks") return parseBlocks(text);
  return parseSpreadsheet(text, options);
}

export function normalizeStreet(street, street2) {
  let text = `${street || ""} ${street2 || ""}`.toLowerCase();
  text = text.replace(/\./g, " ").replace(/#/g, " ");
  text = text.replace(/\bpost office box\b/g, "po box");
  text = text.replace(/\bp o box\b/g, "po box");
  text = text.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return text.split(" ").map((word) => STREET_ABBREV[word] || word).filter((word) => word && !["apt", "apartment", "unit", "ste", "suite", "no"].includes(word)).join(" ");
}

export function householdKey(row) {
  const street = normalizeStreet(row.street, row.street2);
  if (!street) return "";
  const zip = String(row.zip || "").trim();
  const five = zip.match(/^(\d{5})/);
  const zipKey = five ? five[1] : zip.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!zipKey) return "";
  return `${street}|${zipKey}`;
}

export function duplicateGroups(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.included) return;
    const key = householdKey(row);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

function joinAnd(items) {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} & ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

export function householdLabel(rows, style) {
  const people = rows.map(personParts);
  if (style === "first") return rows[0] ? rows[0].name : "";
  const lasts = new Map();
  people.forEach((person) => {
    if (person.last) lasts.set(person.last.toLowerCase(), person.last);
  });
  const unique = [...lasts.values()];
  if (style === "family") {
    if (unique.length === 1) return `The ${unique[0]} Family`;
    if (unique.length > 1) return `The ${joinAnd(unique)} Family`;
    return rows[0] ? rows[0].name : "Household";
  }
  if (unique.length === 1 && people.every((person) => person.last)) {
    const firsts = people.map((person) => person.first).filter(Boolean);
    if (firsts.length >= 2) return `${joinAnd(firsts)} ${unique[0]}`;
    if (firsts.length === 1) return `${firsts[0]} ${unique[0]}`;
    return `The ${unique[0]} Family`;
  }
  return joinAnd(rows.map((row) => row.name).filter(Boolean));
}

function completeness(row) {
  return ["street", "street2", "city", "state", "zip", "country"].reduce((sum, key) => sum + (String(row[key] || "").trim() ? 1 : 0), 0);
}

function snapshotRow(row) {
  return {
    ...row,
    flags: row.flags.slice(),
    undo: row.undo ? row.undo.map(snapshotRow) : null,
  };
}

export function mergeRows(rows, ids, style) {
  const wanted = new Set(ids);
  const group = rows.filter((row) => wanted.has(row.id));
  if (group.length < 2) return rows;
  const best = group.slice().sort((a, b) => completeness(b) - completeness(a))[0];
  const merged = {
    ...best,
    id: group[0].id,
    name: householdLabel(group, style),
    included: group.some((row) => row.included),
    mergedCount: group.reduce((sum, row) => sum + 1 + (row.mergedCount || 0), 0) - 1,
    mergeId: group[0].mergeId || `m-${group[0].id}`,
    undo: group.map(snapshotRow),
    changed: true,
  };
  const person = personParts(merged);
  merged.first = person.first;
  merged.last = person.last;
  merged.flags = flagsFor(merged);
  const out = [];
  let placed = false;
  rows.forEach((row) => {
    if (!wanted.has(row.id)) out.push(row);
    else if (!placed) {
      out.push(merged);
      placed = true;
    }
  });
  return out;
}

export function undoMerge(rows, id) {
  const out = [];
  let changed = false;
  rows.forEach((row) => {
    if (row.id === id && row.undo && row.undo.length) {
      row.undo.forEach((saved) => out.push(snapshotRow(saved)));
      changed = true;
    } else out.push(row);
  });
  return changed ? out : rows.slice();
}

export function summarizeRows(rows) {
  return {
    total: rows.length,
    cleaned: rows.filter((row) => row.changed).length,
    flagged: rows.filter((row) => row.flags.length).length,
    merged: rows.reduce((sum, row) => sum + (row.mergedCount || 0), 0),
  };
}

export function takeFreeLimit(rows, pro) {
  if (pro) return { rows: rows.slice(), omitted: 0 };
  return {
    rows: rows.slice(0, FREE_ADDRESS_LIMIT),
    omitted: Math.max(0, rows.length - FREE_ADDRESS_LIMIT),
  };
}

export function labelLines(row) {
  const lines = [];
  if (row.name) lines.push(row.name);
  if (row.street) lines.push(row.street);
  if (row.street2) lines.push(row.street2);
  let place = "";
  if (row.city && row.state) place = `${row.city}, ${row.state}`;
  else place = row.city || row.state || "";
  if (row.zip) place = place ? `${place} ${row.zip}` : row.zip;
  if (place) lines.push(place);
  if (row.country && countryKey(row.country) && !US_COUNTRIES.has(countryKey(row.country))) lines.push(row.country);
  return lines;
}

export function paginate(items, perSheet) {
  const size = Math.max(1, perSheet);
  const pages = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export function labelPages(rows, formatId) {
  const format = LABEL_FORMATS[formatId] || LABEL_FORMATS["5160"];
  const labels = rows.filter((row) => row.included).map(labelLines);
  return { format, pages: paginate(labels, format.perSheet) };
}

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[=+@\t]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function mailMergeAoa(rows) {
  const data = [["Name", "Street", "Street 2", "City", "State", "ZIP", "Country"]];
  rows.filter((row) => row.included).forEach((row) => {
    data.push([row.name, row.street, row.street2, row.city, row.state, row.zip, row.country].map((value) => (typeof value === "string" && /^[=+@\t]/.test(value) ? `'${value}` : value)));
  });
  return data;
}

export function flaggedAoa(rows) {
  const data = [["Name", "Street", "Street 2", "City", "State", "ZIP", "Country", "Included", "Flags", "Merged"]];
  rows.forEach((row) => {
    data.push([
      safeExport(row.name),
      safeExport(row.street),
      safeExport(row.street2),
      safeExport(row.city),
      safeExport(row.state),
      safeExport(row.zip),
      safeExport(row.country),
      row.included ? "yes" : "no",
      row.flags.join("; "),
      String(row.mergedCount || 0),
    ]);
  });
  return data;
}

function safeExport(value) {
  const text = value == null ? "" : String(value);
  return /^[=+@\t]/.test(text) ? `'${text}` : text;
}

export function aoaToCsv(data) {
  return `\uFEFF${data.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function toMailMergeCsv(rows) {
  return aoaToCsv(mailMergeAoa(rows));
}

export function toFlaggedCsv(rows) {
  return aoaToCsv(flaggedAoa(rows));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function printSheetsHtml(pages, formatId) {
  const cls = formatId === "5163" ? "sheet sheet-5163" : "sheet sheet-5160";
  return pages.map((page) => {
    const labels = page.map((lines) => {
      const body = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
      return `<div class="label"><div class="label-inner">${body}</div></div>`;
    }).join("");
    return `<section class="${cls}">${labels}</section>`;
  }).join("");
}

export const SAMPLE_NOTE = "Sample data. These people and addresses are fictional.";

export const SAMPLE_CSV = `Name,Street,Street 2,City,State,ZIP,Country
JOHN SMITH,123 MAIN STREET,,BOSTON,MASSACHUSETTS,2134,USA
jane smith,123 main st,,boston,ma,02134,
"DOE, ALEX","456 OAK AVE, APT 2",,springfield,illinois,62704,
PAT NG,PO BOX 12,,AUSTIN,TX,78701,
casey ng,9 elm street,,portland,oregon,97201,
RILEY CHO,10 PINE RD,,DENVER,Colorado,,
"CHEN, WEI",88 NANJING ROAD,,SHANGHAI,,200000,China
THE RIVERA FAMILY,400 SUNSET BLVD,,LOS ANGELES,California,90028,
sam rivera,400 sunset boulevard,,los angeles,ca,90028,
"O'BRIEN, PAT",15 NE 3RD ST,,SEATTLE,WASHINGTON,98101,
JOHN SMITH III,1 GRANT CIR,,AMES,IOWA,50010,
`;
