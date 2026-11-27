# New Prospects: website
Public site for New Prospects (websites, quick fixes, spreadsheet help). Contact: newestprospects@gmail.com
- `index.html` home page; `privacy.html`, `terms.html`; `assets/site.css` shared styles
- `free-pdf-to-excel/`: free browser-only PDF to CSV/Excel tool (file is not uploaded).
- `tools/`: index of the browser tools.
- `bank-statement-budget/`: categorize a CSV or text PDF in the browser. Free for 50 rows. Pro is $9 once (Gumroad).
- `wedding-seating-chart/`: seat guests in the browser. Free up to 40. Pro is $5 per event (Gumroad). One key is for one event; Finish event clears it on the device. There is no server counting events.
- `scam-message-checker/`: free rule check for pasted messages. An aid, not a guarantee.
- `holiday-card-addresses/`: clean a holiday-card mailing list in the browser. Free for 25 addresses. Pro is $5 once (Gumroad) for Avery 5160/8160 and 5163 sheets, return-address labels, and CSV export. Addresses are not uploaded.
- License settings live in `assets/tools-config.js`. `assets/unlock.js` checks a key with Gumroad's public license API from the browser (`increment_uses_count` is false).
- Tests: `npm test` (or the `node …/*.test.mjs` commands in package.json). No install is required.
- `landscaper/`, `cleaning/`, `detailer/`: SAMPLE sites for fictional businesses (noindex)
- `web-design-for-*/`: industry landing pages
Deployed to GitHub Pages by `.github/workflows/pages.yml` on push to main.
