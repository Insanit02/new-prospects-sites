import assert from "node:assert/strict";
import { analyzeMessage, EXAMPLE_SCAM } from "./rules.js";

const benign = analyzeMessage("Hi Jordan, the fitting is Thursday at 4pm at the shop on Main Street. Please bring the shoes.");
assert.equal(benign.score, 0);
assert.equal(benign.level, "low");
assert.equal(benign.flags.length, 0);

const empty = analyzeMessage("  \n");
assert.equal(empty.empty, true);
assert.equal(empty.score, 0);

function ids(text) {
  return analyzeMessage(text).flags.map((flag) => flag.id);
}

assert.deepEqual(ids("This is urgent and your account will be closed within 24 hours."), ["urgency"]);
assert.deepEqual(ids("Pay with a gift card or Bitcoin, or refund the difference on the cashier's check."), ["payment"]);
assert.ok(ids("Please continue this on Telegram.").includes("off-platform"));
assert.ok(ids("An order has been placed. Please review the attached document.").includes("marketplace-phish"));
assert.ok(ids("Sign in at http://paypal.com.secure-login.example/invoice").includes("lookalike-link"));
assert.equal(ids("Your receipt is at https://www.paypal.com/activity").includes("lookalike-link"), false);
assert.ok(ids("The site is http://paypa1.com/login").includes("lookalike-link"));
assert.ok(ids("Photos: https://bit.ly/abc123").includes("short-link"));
assert.equal(ids("Photos: https://bit.ly/abc123").includes("lookalike-link"), false);
assert.ok(ids("Reply with the one-time code and your password.").includes("credentials"));
assert.ok(ids("This online job pays you to rate apps.").includes("job-task"));
assert.ok(ids("No experience needed. Earn $500 a day.").includes("too-good"));

const example = analyzeMessage(EXAMPLE_SCAM);
assert.equal(example.level, "high");
assert.ok(example.score >= 40);
assert.ok(example.score <= 100);
for (const id of ["urgency", "payment", "off-platform", "marketplace-phish", "lookalike-link", "credentials", "job-task", "too-good"]) {
  assert.ok(example.flags.some((flag) => flag.id === id), id);
}
assert.ok(example.whatToDo.some((step) => /do not send money/i.test(step)));
assert.ok(example.flags.every((flag) => flag.explanation && flag.excerpt));

const stacked = analyzeMessage(`${EXAMPLE_SCAM}\n${EXAMPLE_SCAM}\nAlso visit https://bit.ly/x and http://192.168.1.20/login`);
assert.equal(stacked.score, 100);
assert.equal(stacked.flags.filter((flag) => flag.id === "urgency").length, 1);
