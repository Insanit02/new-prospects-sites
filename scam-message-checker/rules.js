const BRANDS = [
  { name: "PayPal", token: "paypal", domains: ["paypal.com"] },
  { name: "Amazon", token: "amazon", domains: ["amazon.com"] },
  { name: "Apple", token: "apple", domains: ["apple.com", "icloud.com"] },
  { name: "Microsoft", token: "microsoft", domains: ["microsoft.com", "office.com", "live.com"] },
  { name: "Google", token: "google", domains: ["google.com", "gmail.com"] },
  { name: "Chase", token: "chase", domains: ["chase.com"] },
  { name: "Wells Fargo", token: "wellsfargo", domains: ["wellsfargo.com"] },
  { name: "Bank of America", token: "bankofamerica", domains: ["bankofamerica.com", "bofa.com"] },
  { name: "IRS", token: "irs", domains: ["irs.gov"] },
  { name: "Netflix", token: "netflix", domains: ["netflix.com"] },
  { name: "DHL", token: "dhl", domains: ["dhl.com"] },
  { name: "FedEx", token: "fedex", domains: ["fedex.com"] },
  { name: "USPS", token: "usps", domains: ["usps.com"] },
];

const SHORTENERS = new Set(["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "cutt.ly", "rb.gy", "is.gd", "buff.ly"]);

export const EXAMPLE_SCAM = [
  "URGENT: Your account will be closed within 24 hours unless you act now.",
  "An order has been placed. Please review the attached document: http://paypal.com.secure-login.example/invoice",
  "Pay the fee with a $200 Amazon gift card or Bitcoin, or send a wire transfer.",
  "We also sent a one-time code. Reply with the verification code and your password.",
  "Message me on Telegram to start the online job. No experience needed, earn $500 a day.",
].join("\n");

function firstMatch(text, regex) {
  const match = regex.exec(text);
  if (!match) return null;
  return { excerpt: match[0].slice(0, 160) };
}

function extractUrls(text) {
  const found = [];
  const regex = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  let match = regex.exec(text);
  while (match) {
    found.push(match[0].replace(/[),.;:!?]+$/g, ""));
    match = regex.exec(text);
  }
  return found;
}

function foldLabel(label) {
  return label.toLowerCase().replace(/0/g, "o").replace(/1/g, "l").replace(/3/g, "e").replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t");
}

function mentionsBrand(host, token) {
  const labels = host.toLowerCase().split(".").flatMap((label) => label.split("-"));
  return labels.some((label) => {
    const folded = foldLabel(label);
    return folded === token || (folded.startsWith(token) && folded.length <= token.length + 4);
  });
}

function isOfficial(host, domains) {
  const name = host.toLowerCase().replace(/\.$/, "");
  return domains.some((domain) => name === domain || name.endsWith(`.${domain}`));
}

function inspectUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!host) return null;
  if (SHORTENERS.has(host) || SHORTENERS.has(host.replace(/^www\./, ""))) {
    return { kind: "shortener", excerpt: raw.slice(0, 180), detail: "The link is shortened, so the destination is hidden." };
  }
  if (url.username || url.password) {
    return { kind: "lookalike", excerpt: raw.slice(0, 180), detail: "The link hides the real site behind an @ sign." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("xn--") || host.includes(".xn--")) {
    return { kind: "lookalike", excerpt: raw.slice(0, 180), detail: "The link uses a numeric address or punycode, which is a common lookalike trick." };
  }
  for (const brand of BRANDS) {
    if (mentionsBrand(host, brand.token) && !isOfficial(host, brand.domains)) {
      return { kind: "lookalike", excerpt: raw.slice(0, 180), detail: `The link mentions ${brand.name} but is not on the real ${brand.name} domain.` };
    }
  }
  return null;
}

function scanLinks(text, kind) {
  const hits = [];
  for (const raw of extractUrls(text)) {
    const hit = inspectUrl(raw);
    if (hit && hit.kind === kind) hits.push(hit);
  }
  if (!hits.length) return null;
  return { excerpt: hits.map((hit) => hit.excerpt).join(" "), detail: hits[0].detail };
}

export const RULES = [
  {
    id: "urgency",
    title: "Urgency or a threat",
    weight: 18,
    explanation: "Scam messages push you to act before you can check. A deadline or a threat to close an account is a common hook. Urgency by itself is not proof.",
    action: "Pause. A real bill or account notice can wait long enough for you to look it up yourself.",
    scan: (text) => firstMatch(text, /\b(act now|immediately|within 24 hours|urgent|final notice|account will be closed|limited time|expires today|last warning|suspend(?:ed)? your)\b/i),
  },
  {
    id: "payment",
    title: "Gift card, crypto, wire, Zelle, or check overpayment",
    weight: 28,
    explanation: "Gift cards, crypto, wires, and cashier's-check overpayments are common ways scammers ask to be paid. People you know do use Zelle. The risk is a stranger steering you to it, especially with urgency or a refund of the difference.",
    action: "Do not buy a gift card, send crypto, wire money, or refund an overpayment because of this message.",
    scan: (text) => firstMatch(text, /\b(gift cards?|itunes|google play card|bitcoin|crypto(?:currency)?|btc|eth|wire transfer|western union|moneygram|zelle|cashier'?s check|overpayment|refund the difference)\b/i),
  },
  {
    id: "off-platform",
    title: "Move the chat to Telegram, WhatsApp, or text",
    weight: 22,
    explanation: "Scammers try to leave the site that can ban them. A marketplace buyer or a stranger who insists on Telegram, WhatsApp, or a personal text is a red flag.",
    action: "Keep the conversation on the original site. Do not move it to another app because the message says to.",
    scan: (text) => firstMatch(text, /\b(telegram|whatsapp|signal messenger|text me at|move (?:this|our) (?:chat|conversation)|contact me on)\b/i),
  },
  {
    id: "marketplace-phish",
    title: "Fake order or “review this document”",
    weight: 26,
    explanation: "A common marketplace scam says an order was placed, or asks you to review an invoice or document. The file or link is the trap, not a real order.",
    action: "Do not open the document or the link. Check orders only by opening the marketplace yourself and signing in there.",
    scan: (text) => firstMatch(text, /\b(order (?:has been |was )?placed|please review (?:the |this )?(?:document|attachment|invoice)|invoice attached|kindly (?:review|find)|confirm your order|you have a new order|shipping label attached)\b/i),
  },
  {
    id: "lookalike-link",
    title: "Lookalike or disguised link",
    weight: 24,
    explanation: "The link looks related to a known company, but the site name is wrong, numeric, or hidden behind an @ sign.",
    action: "Do not open the link. Type the company's address yourself if you need to check an account.",
    scan: (text) => scanLinks(text, "lookalike"),
  },
  {
    id: "short-link",
    title: "Short link hides the destination",
    weight: 12,
    explanation: "A shortened link can point anywhere. That is not always a scam, but you cannot see the destination from the message.",
    action: "Do not open a shortened link from an unexpected message.",
    scan: (text) => scanLinks(text, "shortener"),
  },
  {
    id: "credentials",
    title: "Password, one-time code, or identity request",
    weight: 28,
    explanation: "A real company will not ask you to send a password, a one-time code, a Social Security number, or a seed phrase by email, text, or a marketplace chat.",
    action: "Do not reply with a code, password, or ID number. If you already did, change that password from the company's real site and contact the company or your bank.",
    scan: (text) => firstMatch(text, /\b(one[- ]time (?:code|passcode|password)|verification code|otp|password|passcode|social security|ssn|seed phrase|routing number)\b/i),
  },
  {
    id: "job-task",
    title: "Job or task scam",
    weight: 22,
    explanation: "Offers to rate apps, optimize products, or do simple tasks for daily pay, often over Telegram, are a common scam. They may send a small payment and then ask you to pay it back.",
    action: "Do not pay a fee to start a job, and do not move a job interview or task list onto Telegram.",
    scan(text) {
      const direct = firstMatch(text, /\b(paid tasks?|rate apps|rate products|data entry|optimize products|product optimization|work from home|online job|job offer|telegram tasks)\b/i);
      if (direct) return direct;
      if (/\btelegram\b/i.test(text) && /\b(job|tasks?|earn|paid|hiring)\b/i.test(text)) {
        return firstMatch(text, /\btelegram\b/i);
      }
      return null;
    },
  },
  {
    id: "too-good",
    title: "Pay that sounds too good to be true",
    weight: 22,
    explanation: "Guaranteed daily pay, large earnings with no experience, or a promise to double your money is a classic hook.",
    action: "Treat guaranteed easy money as a scam until you can verify the company independently.",
    scan: (text) => firstMatch(text, /\$\s?\d[\d,]*(?:\.\d+)?\s*(?:a|per)\s*(?:day|week)|\bguaranteed (?:income|pay|returns|profit)\b|\bearn \$\s?\d|\bmake \$\s?\d|\bno experience (?:needed|required)\b|\beasy money\b|\bdouble your (?:money|crypto|bitcoin)\b/i),
  },
];

export function analyzeMessage(text) {
  const source = String(text || "");
  if (!source.trim()) {
    return {
      empty: true,
      score: 0,
      level: "low",
      levelLabel: "Nothing to check",
      flags: [],
      whatToDo: ["Paste a message first. The check runs in this browser and does not upload the text."],
    };
  }
  const flags = [];
  for (const rule of RULES) {
    const hit = rule.scan(source);
    if (!hit) continue;
    flags.push({
      id: rule.id,
      title: rule.title,
      weight: rule.weight,
      excerpt: hit.excerpt,
      detail: hit.detail || "",
      explanation: rule.explanation,
      action: rule.action,
    });
  }
  const score = Math.min(100, flags.reduce((sum, flag) => sum + flag.weight, 0));
  const level = score === 0 ? "low" : score < 40 ? "medium" : "high";
  const levelLabel = score === 0 ? "No common red flags" : score < 40 ? "Some red flags" : "High risk pattern";
  const whatToDo = [];
  const seen = new Set();
  function add(step) {
    if (!step || seen.has(step)) return;
    seen.add(step);
    whatToDo.push(step);
  }
  add("Do not send money, codes, or passwords in reply, and do not open links or attachments from the message.");
  flags.forEach((flag) => add(flag.action));
  add("If it claims to be a company, type that company's web address yourself. Do not use a link or a phone number from the message.");
  if (score > 0) add("You can report it at reportfraud.ftc.gov or ic3.gov, and to the marketplace or carrier the message came through.");
  add("A low score does not mean the message is safe. This is a pattern check, not a verdict.");
  return { empty: false, score, level, levelLabel, flags, whatToDo };
}
