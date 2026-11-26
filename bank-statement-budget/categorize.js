export const FREE_TRANSACTION_LIMIT = 50;

export const DEFAULT_CATEGORIES = [
  { id: "income", name: "Income", keywords: ["payroll", "direct dep", "salary", "paycheck", "interest paid", "dividend", "refund"] },
  { id: "rent", name: "Rent", keywords: ["rent", "landlord", "apartment", "mortgage"] },
  { id: "utilities", name: "Utilities", keywords: ["electric", "power & light", "water bill", "utility", "comcast", "xfinity", "spectrum", "verizon", "t-mobile", "at&t", "internet", "natural gas", "gas bill"] },
  { id: "groceries", name: "Groceries", keywords: ["grocery", "groceries", "kroger", "safeway", "whole foods", "trader joe", "aldi", "publix", "costco", "food lion", "wegmans"] },
  { id: "dining", name: "Dining", keywords: ["restaurant", "cafe", "coffee", "starbucks", "mcdonald", "doordash", "uber eats", "grubhub", "chipotle", "dining", "pizza"] },
  { id: "gas", name: "Gas", keywords: ["shell", "chevron", "exxon", "fuel", "gas station", "gasoline", "circle k", "bp"] },
  { id: "subscriptions", name: "Subscriptions", keywords: ["netflix", "spotify", "hulu", "disney+", "disney plus", "icloud", "adobe", "youtube premium", "subscription", "amazon prime", "apple.com/bill", "hbo", "prime video"] },
  { id: "transfers", name: "Transfers", keywords: ["transfer", "zelle", "venmo", "paypal", "cash app", "wire transfer"] },
  { id: "shopping", name: "Shopping", keywords: ["amazon", "target", "ebay", "etsy", "best buy", "walmart"] },
  { id: "uncategorized", name: "Uncategorized", keywords: [] },
];

export function cloneCategories(categories = DEFAULT_CATEGORIES) {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    keywords: category.keywords.slice(),
  }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function keywordMatches(description, keyword) {
  const haystack = String(description || "");
  const needle = String(keyword || "").trim().toLowerCase();
  if (!needle) return false;
  if (needle.length <= 4) {
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
    return pattern.test(haystack);
  }
  return haystack.toLowerCase().includes(needle);
}

export function suggestCategory(description, categories = DEFAULT_CATEGORIES) {
  let best = null;
  categories.forEach((category, order) => {
    for (const keyword of category.keywords || []) {
      if (!keywordMatches(description, keyword)) continue;
      const len = String(keyword).trim().length;
      if (!best || len > best.len || (len === best.len && order < best.order)) {
        best = { id: category.id, len, order };
      }
    }
  });
  return best ? best.id : "uncategorized";
}

export function applyCategories(transactions, categories = DEFAULT_CATEGORIES) {
  return transactions.map((tx) => {
    if (tx.manual && tx.category) return { ...tx };
    return { ...tx, category: suggestCategory(tx.description, categories), manual: false };
  });
}

export function visibleTransactions(transactions, pro) {
  if (pro) return transactions.slice();
  return transactions.slice(0, FREE_TRANSACTION_LIMIT);
}

function cents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function summarize(transactions, categories = DEFAULT_CATEGORIES) {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  let moneyIn = 0;
  let moneyOut = 0;
  let transfers = 0;
  const byCat = new Map();
  const byMonth = new Map();

  for (const tx of transactions) {
    const amount = cents(tx.amount);
    const category = tx.category || "uncategorized";
    const month = tx.date && /^\d{4}-\d{2}/.test(tx.date) ? tx.date.slice(0, 7) : "Unknown";
    if (!byMonth.has(month)) {
      byMonth.set(month, { month, moneyIn: 0, moneyOut: 0, transfers: 0, net: 0, count: 0 });
    }
    const bucket = byMonth.get(month);
    bucket.count += 1;
    bucket.net = cents(bucket.net + amount);
    if (category === "transfers") {
      transfers = cents(transfers + amount);
      bucket.transfers = cents(bucket.transfers + amount);
    } else if (amount >= 0) {
      moneyIn = cents(moneyIn + amount);
      bucket.moneyIn = cents(bucket.moneyIn + amount);
    } else {
      moneyOut = cents(moneyOut + amount);
      bucket.moneyOut = cents(bucket.moneyOut + amount);
    }
    if (!byCat.has(category)) {
      byCat.set(category, {
        id: category,
        name: names.get(category) || category,
        moneyIn: 0,
        moneyOut: 0,
        count: 0,
      });
    }
    const row = byCat.get(category);
    row.count += 1;
    if (amount >= 0) row.moneyIn = cents(row.moneyIn + amount);
    else row.moneyOut = cents(row.moneyOut + amount);
  }

  const categoryRows = [];
  const seen = new Set();
  for (const category of categories) {
    if (!byCat.has(category.id)) continue;
    categoryRows.push(byCat.get(category.id));
    seen.add(category.id);
  }
  for (const row of byCat.values()) {
    if (!seen.has(row.id)) categoryRows.push(row);
  }

  return {
    count: transactions.length,
    moneyIn,
    moneyOut,
    transfers,
    net: cents(moneyIn + moneyOut + transfers),
    categories: categoryRows,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export function spendingSlices(transactions, categories = DEFAULT_CATEGORIES) {
  const totals = new Map();
  for (const tx of transactions) {
    if (!(tx.amount < 0)) continue;
    if (tx.category === "transfers" || tx.category === "income") continue;
    const id = tx.category || "uncategorized";
    totals.set(id, cents((totals.get(id) || 0) + Math.abs(tx.amount)));
  }
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return [...totals.entries()]
    .map(([id, value]) => ({ id, label: names.get(id) || id, value }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function positiveAmountWarning(transactions) {
  if (!transactions.length) return "";
  if (transactions.every((tx) => tx.amount > 0)) {
    return "Every amount is positive. If those numbers are charges, turn on “Positive amounts are spending.” Money in would then be the negative amounts.";
  }
  return "";
}

export function flipAmountSign(transactions) {
  return transactions.map((tx) => ({ ...tx, amount: cents(-tx.amount) }));
}
