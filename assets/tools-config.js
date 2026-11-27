// Paid browser tools sold by New Prospects.
// productId is the value Gumroad's license API expects as product_id.
// It is not the permalink in the checkout URL.
// Checkout URLs are the public Gumroad product pages.

export const GUMROAD_VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

export const SITE = {
  name: "New Prospects",
  origin: "https://insanit02.github.io/new-prospects-sites",
  email: "newestprospects@gmail.com",
};

export const MORE_PRODUCTS = [
  {
    name: "1099 vendor totals template",
    priceLabel: "$12",
    url: "https://prospectify0.gumroad.com/l/1099-vendor-totals",
    description: "A spreadsheet template for 1099 vendor totals.",
  },
  {
    name: "Small-town brand expansion dataset",
    priceLabel: "$19",
    url: "https://prospectify0.gumroad.com/l/small-town-brand-expansion",
    description: "A dataset for small-town brand expansion.",
  },
];

export const TOOLS = {
  "bank-statement-budget": {
    id: "bank-statement-budget",
    name: "Bank Statement Budget",
    priceUsd: 9,
    priceLabel: "$9 one-time",
    productId: "7b88MYfSEWRkfYEzZCmDvg==",
    checkoutUrl: "https://prospectify0.gumroad.com/l/bank-statement-budget-pro",
    perEvent: false,
    freeSummary: "The first 50 transactions, plus the on-screen summary, chart, and repeating-charge list.",
    proSummary: "Unlimited rows, custom categories saved on this device, and CSV or Excel export.",
  },
  "wedding-seating-chart": {
    id: "wedding-seating-chart",
    name: "Wedding Seating Chart",
    priceUsd: 5,
    priceLabel: "$5 per event, one-time",
    productId: "e_jffjVOzqBYN7LBbZN0OA==",
    checkoutUrl: "https://prospectify0.gumroad.com/l/wedding-seating-chart-pro",
    perEvent: true,
    freeSummary: "Up to 40 guests, on-screen seating, and drag to adjust.",
    proSummary: "Unlimited guests for one event, print or save as PDF, and CSV export.",
  },
  "holiday-card-addresses": {
    id: "holiday-card-addresses",
    name: "Holiday Card Address Labels",
    priceUsd: 5,
    priceLabel: "$5 one-time",
    productId: "Ss5btifrQmWB9vONScShFA==",
    checkoutUrl: "https://prospectify0.gumroad.com/l/holiday-address-labels-pro",
    perEvent: false,
    freeSummary: "Clean, de-duplicate and preview up to 25 addresses.",
    proSummary: "Unlimited addresses, printable Avery 5160/8160 and 5163 label sheets, return-address labels, and CSV export for mail merge.",
  },
};

export function getTool(id) {
  return TOOLS[id] || null;
}

export function isPlaceholder(value) {
  if (value == null) return true;
  const text = String(value).trim();
  return text.length === 0 || text.includes("REPLACE_");
}
