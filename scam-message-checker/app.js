import { analyzeMessage, EXAMPLE_SCAM } from "./rules.js";

const els = {
  text: document.getElementById("message"),
  check: document.getElementById("check"),
  sample: document.getElementById("sample"),
  clear: document.getElementById("clear"),
  status: document.getElementById("status"),
  result: document.getElementById("result"),
  heading: document.getElementById("result-heading"),
  mount: document.getElementById("result-mount"),
};

els.check.addEventListener("click", () => run(els.text.value));
els.sample.addEventListener("click", () => {
  els.text.value = EXAMPLE_SCAM;
  run(EXAMPLE_SCAM);
});
els.clear.addEventListener("click", () => {
  els.text.value = "";
  els.result.hidden = true;
  els.mount.replaceChildren();
  els.status.textContent = "Cleared. The message is no longer held in this tab.";
});
els.text.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run(els.text.value);
});

if (new URLSearchParams(location.search).get("demo") === "1") els.sample.click();

function run(text) {
  const report = analyzeMessage(text);
  const wrap = document.createElement("div");
  const score = document.createElement("p");
  score.className = `score ${report.level}`;
  score.textContent = report.empty ? "—" : String(report.score);
  const label = document.createElement("p");
  const strong = document.createElement("b");
  strong.textContent = report.levelLabel;
  label.appendChild(strong);
  if (!report.empty) label.appendChild(document.createTextNode(` out of 100. ${band(report.level)}`));
  wrap.append(score, label);

  if (!report.flags.length && !report.empty) {
    const none = document.createElement("p");
    none.textContent = "No common red flags in this text. That is not a promise that the message is safe.";
    wrap.appendChild(none);
  }
  report.flags.forEach((flag) => {
    const card = document.createElement("article");
    card.className = "flag";
    const title = document.createElement("h3");
    title.textContent = `${flag.title} (+${flag.weight})`;
    const quote = document.createElement("q");
    quote.textContent = flag.excerpt;
    const explanation = document.createElement("p");
    explanation.textContent = flag.detail ? `${flag.explanation} ${flag.detail}` : flag.explanation;
    card.append(title, quote, explanation);
    wrap.appendChild(card);
  });

  const next = document.createElement("h3");
  next.textContent = "What to do next";
  const list = document.createElement("ul");
  report.whatToDo.forEach((step) => {
    const li = document.createElement("li");
    li.textContent = step;
    list.appendChild(li);
  });
  wrap.append(next, list);
  els.mount.replaceChildren(wrap);
  els.result.hidden = false;
  els.status.textContent = "Checked in this browser. The message was not uploaded.";
  els.heading.focus();
}

function band(level) {
  if (level === "high") return "High risk pattern.";
  if (level === "medium") return "Some red flags.";
  return "No common red flags.";
}
