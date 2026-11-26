const NOISE = new Set([
  "com", "www", "pos", "debit", "card", "purchase", "payment", "ach", "checkcard",
  "visa", "mastercard", "web", "the", "and", "for",
]);

export function merchantKey(description) {
  const tokens = String(description || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !NOISE.has(token));
  return tokens.slice(0, 4).join(" ");
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function amountsSimilar(amounts) {
  const abs = amounts.map((amount) => Math.abs(amount)).sort((a, b) => a - b);
  const median = abs[Math.floor(abs.length / 2)];
  const tolerance = Math.max(1, median * 0.1);
  return abs[abs.length - 1] - abs[0] <= tolerance;
}

function daySpan(dates) {
  const times = dates
    .filter(Boolean)
    .map((date) => Date.parse(`${date}T00:00:00Z`))
    .filter((time) => !Number.isNaN(time));
  if (times.length < 2) return 0;
  return (Math.max(...times) - Math.min(...times)) / 86400000;
}

export function findRecurring(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!(tx.amount < 0) || !tx.date) continue;
    const key = merchantKey(tx.description);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  const found = [];
  for (const [key, rows] of groups) {
    if (rows.length < 2) continue;
    const dates = rows.map((tx) => tx.date);
    const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
    if (daySpan(dates) < 25 && months.length < 2) continue;
    const amounts = rows.map((tx) => tx.amount);
    if (!amountsSimilar(amounts)) continue;
    const label = rows.map((tx) => tx.description).sort((a, b) => a.length - b.length)[0];
    const abs = amounts.map((amount) => Math.abs(amount)).sort((a, b) => a - b);
    found.push({
      key,
      label,
      count: rows.length,
      typicalAmount: cents(abs[Math.floor(abs.length / 2)]),
      months,
      total: cents(amounts.reduce((sum, amount) => sum + amount, 0)),
    });
  }
  return found.sort((a, b) => a.total - b.total);
}
