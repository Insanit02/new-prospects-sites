import { GUMROAD_VERIFY_URL, getTool, isPlaceholder } from "./tools-config.js";

// Checked 2026-11-26 from a browser-like POST with an Origin header:
// https://api.gumroad.com/v2/licenses/verify responds with
// Access-Control-Allow-Origin: * and Access-Control-Allow-Methods including POST.
// The page can read the JSON. No server and no secret are used.
// increment_uses_count is always false. Wedding seating is sold per event;
// this page does not ask Gumroad to count events. Finish event clears the
// saved key on this device. Entering a still-valid key again will unlock
// again (an honor system).
// If the browser cannot complete the request, a key that matches Gumroad's
// usual format is saved and labeled as not confirmed.

const KEY_RE = /^[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}-[A-Z0-9]{8}$/;

export function storageKey(toolId) {
  return `np-unlock:${toolId}`;
}

export function normalizeLicenseKey(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

export function licenseKeyFormatOk(value) {
  return KEY_RE.test(normalizeLicenseKey(value));
}

export function interpretLicenseCheck({ productId, licenseKey, outcome }) {
  const key = normalizeLicenseKey(licenseKey);
  if (!licenseKeyFormatOk(key)) {
    return {
      unlock: false,
      message: "That doesn't look like a Gumroad license key. A key is four groups of 8 letters or numbers, separated by hyphens.",
    };
  }
  if (isPlaceholder(productId) || !outcome || outcome.kind === "unconfigured") {
    return {
      unlock: false,
      message: "This tool is not connected to a Gumroad product id yet, so the key cannot be checked or accepted.",
    };
  }
  if (outcome.kind === "network") {
    return {
      unlock: true,
      verifiedWithGumroad: false,
      source: "format-fallback",
      licenseKey: key,
      message: "The browser could not complete Gumroad's license check (the request was blocked or this device is offline). The key matches Gumroad's usual format and is saved on this device only. Gumroad did not confirm it. Pro is on here with that limitation.",
    };
  }
  const body = outcome.body;
  if (!body || typeof body !== "object") {
    return {
      unlock: false,
      message: "Gumroad did not return a license result. Nothing was saved.",
    };
  }
  if (body.success !== true) {
    const detail = typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : "Gumroad did not accept that key for this product.";
    return { unlock: false, message: detail };
  }
  const purchase = body.purchase || {};
  if (purchase.refunded === true || purchase.chargebacked === true) {
    return {
      unlock: false,
      message: "Gumroad says this purchase was refunded or charged back, so it does not unlock Pro.",
    };
  }
  if (purchase.disputed === true && purchase.dispute_won !== true) {
    return {
      unlock: false,
      message: "Gumroad says this purchase is disputed, so it does not unlock Pro.",
    };
  }
  if (purchase.subscription_ended_at || purchase.subscription_cancelled_at || purchase.subscription_failed_at) {
    return {
      unlock: false,
      message: "Gumroad says this subscription is no longer active, so it does not unlock Pro.",
    };
  }
  const quantity = Number(purchase.quantity);
  return {
    unlock: true,
    verifiedWithGumroad: true,
    source: "gumroad",
    licenseKey: key,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    message: "Gumroad confirmed this license key. Pro is on for this tool in this browser. The key stays on this device only.",
  };
}

function defaultStore() {
  try {
    if (typeof localStorage === "undefined") return null;
    const probe = "__np_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function readUnlock(toolId, store = defaultStore()) {
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(toolId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    const tool = getTool(toolId);
    if (!data || data.unlocked !== true || typeof data.licenseKey !== "string") return null;
    if (tool && data.productId && data.productId !== tool.productId) return null;
    return data;
  } catch {
    return null;
  }
}

export function isUnlocked(toolId, store = defaultStore()) {
  return !!readUnlock(toolId, store);
}

export function clearUnlock(toolId, store = defaultStore()) {
  if (store) store.removeItem(storageKey(toolId));
}

export async function verifyLicense(toolId, licenseKey, deps = {}) {
  const tool = getTool(toolId);
  const productId = tool ? tool.productId : "";
  const key = normalizeLicenseKey(licenseKey);
  const store = deps.store || defaultStore();
  let outcome;
  if (!tool || isPlaceholder(productId)) {
    outcome = { kind: "unconfigured" };
  } else if (!licenseKeyFormatOk(key)) {
    outcome = { kind: "skip" };
  } else {
    const fetchImpl = deps.fetch || globalThis.fetch;
    try {
      const response = await fetchImpl(GUMROAD_VERIFY_URL, {
        method: "POST",
        credentials: "omit",
        headers: { Accept: "application/json" },
        body: new URLSearchParams({
          product_id: productId,
          license_key: key,
          increment_uses_count: "false",
        }),
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      outcome = { kind: "result", body, status: response.status };
    } catch (error) {
      outcome = { kind: "network", message: error && error.message ? String(error.message) : "network" };
    }
  }
  const decision = interpretLicenseCheck({ productId, licenseKey: key, outcome });
  if (decision.unlock) {
    if (!store) {
      return {
        ...decision,
        unlock: false,
        message: "This browser is not storing site data, so the key cannot be saved here. Pro was not turned on. Nothing was sent to New Prospects.",
      };
    }
    const record = {
      unlocked: true,
      licenseKey: decision.licenseKey,
      verifiedWithGumroad: decision.verifiedWithGumroad === true,
      source: decision.source,
      productId,
      savedAt: new Date().toISOString(),
    };
    if (decision.quantity) record.quantity = decision.quantity;
    store.setItem(storageKey(toolId), JSON.stringify(record));
  }
  return decision;
}

function maskKey(key) {
  const text = String(key || "");
  if (text.length < 4) return "";
  return `Key ending in ${text.slice(-4)}`;
}

function standingMessage(record, tool) {
  if (!record) return "";
  const parts = [];
  if (record.verifiedWithGumroad) {
    parts.push("Gumroad confirmed the saved license key. Pro is on in this browser.");
  } else {
    parts.push("Pro is on in this browser, but Gumroad did not confirm the saved key. It matched the usual key format and was kept because the license check could not be completed.");
  }
  if (record.quantity && record.quantity > 1) {
    parts.push(`Gumroad reported a quantity of ${record.quantity} on this purchase.`);
  }
  if (tool && tool.perEvent) {
    parts.push("One purchase is for one event. This page does not count events. When the event is over, finish it to clear Pro on this device. Entering a valid key again will unlock the next event; that limit is an honor system.");
  }
  parts.push(maskKey(record.licenseKey));
  return parts.join(" ");
}

export function mountLicenseBox(container, { toolId, onChange } = {}) {
  const tool = getTool(toolId);
  if (!container || !tool) return { refresh() {}, isPro: () => false };
  let busy = false;

  function emit() {
    if (typeof onChange === "function") onChange(isUnlocked(toolId));
  }

  function render() {
    const record = readUnlock(toolId);
    const pro = !!record;
    container.replaceChildren();
    const box = document.createElement("div");
    box.className = "unlock";
    box.dataset.tool = toolId;
    box.dataset.pro = pro ? "yes" : "no";

    const heading = document.createElement("h2");
    heading.textContent = pro ? "Pro is on" : "Free and Pro";
    box.appendChild(heading);

    const free = document.createElement("p");
    free.appendChild(document.createTextNode("Free: "));
    const freeStrong = document.createElement("b");
    freeStrong.textContent = tool.freeSummary;
    free.appendChild(freeStrong);
    box.appendChild(free);

    const paid = document.createElement("p");
    paid.appendChild(document.createTextNode(`Pro (${tool.priceLabel}): `));
    const paidStrong = document.createElement("b");
    paidStrong.textContent = tool.proSummary;
    paid.appendChild(paidStrong);
    box.appendChild(paid);

    if (tool.perEvent) {
      const honor = document.createElement("p");
      honor.className = "note";
      honor.textContent = "Sold per event. One license key unlocks Pro for one event on this device. Quantity at checkout is how you pay for more than one event. This page has no server, so it does not mark a key as used up. Finish the event when you are done.";
      box.appendChild(honor);
    }

    const link = document.createElement("a");
    link.className = "btn";
    link.href = tool.checkoutUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `Unlock Pro on Gumroad (${tool.priceLabel})`;
    box.appendChild(link);
    const linkNote = document.createElement("p");
    linkNote.className = "note";
    linkNote.textContent = "Opens Gumroad in a new tab. Your work stays in this tab. New Prospects never sees your card.";
    box.appendChild(linkNote);

    const label = document.createElement("label");
    label.htmlFor = `${toolId}-license`;
    label.textContent = "Already bought it? Paste the license key from your Gumroad receipt.";
    const input = document.createElement("input");
    input.id = `${toolId}-license`;
    input.name = "license";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX";
    input.setAttribute("aria-describedby", `${toolId}-license-status`);
    const field = document.createElement("div");
    field.className = "field";
    field.append(label, input);
    box.appendChild(field);

    const actions = document.createElement("div");
    actions.className = "actions";
    const check = document.createElement("button");
    check.type = "button";
    check.className = "btn";
    check.textContent = "Check key";
    check.disabled = busy;
    actions.appendChild(check);
    if (pro) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn line";
      remove.textContent = tool.perEvent
        ? "Finish this event and clear Pro on this device"
        : "Remove saved key from this browser";
      remove.addEventListener("click", () => {
        const prompt = tool.perEvent
          ? "Clear the seating-chart license on this device? The chart stays on this tab until you reload. Print and CSV turn off. The next event needs a license."
          : "Remove the saved license key for this tool from this browser?";
        if (!window.confirm(prompt)) return;
        clearUnlock(toolId);
        render();
        emit();
      });
      actions.appendChild(remove);
    }
    box.appendChild(actions);

    const status = document.createElement("p");
    status.id = `${toolId}-license-status`;
    status.role = "status";
    status.setAttribute("aria-live", "polite");
    status.textContent = standingMessage(record, tool);
    if (record && !record.verifiedWithGumroad) status.className = "warn";
    else if (record) status.className = "guarantee";
    box.appendChild(status);

    const privacy = document.createElement("p");
    privacy.className = "note";
    privacy.textContent = "Checking a key sends it to Gumroad from this browser, along with the product id. New Prospects does not receive it. A saved key stays in local storage on this device.";
    box.appendChild(privacy);

    container.appendChild(box);

    async function checkKey() {
      if (busy) return;
      busy = true;
      check.disabled = true;
      status.className = "";
      status.textContent = "Checking this key with Gumroad. It is not sent to New Prospects.";
      try {
        const decision = await verifyLicense(toolId, input.value);
        input.value = "";
        render();
        const next = document.getElementById(`${toolId}-license-status`);
        if (next) {
          next.textContent = decision.message || "";
          next.className = decision.unlock && decision.verifiedWithGumroad === false ? "warn" : decision.unlock ? "guarantee" : "warn";
        }
        emit();
      } finally {
        busy = false;
        const button = container.querySelector("button.btn");
        if (button) button.disabled = false;
      }
    }

    check.addEventListener("click", checkKey);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        checkKey();
      }
    });
  }

  render();
  return { refresh: render, isPro: () => isUnlocked(toolId) };
}
