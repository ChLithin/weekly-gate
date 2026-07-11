// app.js — Weekly Gate main controller

const $ = id => document.getElementById(id);
const fmt = n => "₹" + Math.round(n).toLocaleString("en-IN");
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let currentTxn = null;        // full txn record being processed
let currentContact = null;
let saveContactPending = null;

// ── Toast ──
function toast(msg, dur = 2200) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), dur);
}

// ── Rolling money odometer ──────────────────────────────────────
// Digits roll vertically (Apple-style ticker); symbols/commas fade in.
// Slots are aligned from the RIGHT so the units digit stays the units digit.
function createRoller(el) {
  let slots = []; // right-aligned: slots[0] = rightmost char. {char, node, strip}

  function makeDigitSlot() {
    const slot = document.createElement("span"); slot.className = "slot";
    const strip = document.createElement("span"); strip.className = "strip";
    for (let d = 0; d <= 9; d++) {
      const s = document.createElement("span"); s.textContent = d; strip.appendChild(s);
    }
    slot.appendChild(strip);
    return { node: slot, strip };
  }
  function makeStaticSlot(ch) {
    const s = document.createElement("span");
    s.className = "static"; s.textContent = ch;
    return { node: s, strip: null };
  }
  function rollTo(slotObj, digit, instant) {
    const y = -digit * 100 / 10; // strip is 10em tall; each digit is 10% of strip
    if (instant) slotObj.strip.style.transition = "none";
    slotObj.strip.style.transform = `translateY(${y}%)`;
    if (instant) { void slotObj.strip.offsetHeight; slotObj.strip.style.transition = ""; }
  }

  return {
    set(str) {
      const chars = [...str].reverse(); // right-aligned
      const next = [];
      const fresh = [];
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        const isDigit = ch >= "0" && ch <= "9";
        const old = slots[i];
        if (old && isDigit && old.strip) {
          next.push({ ...old, char: ch }); // reuse — will roll
        } else if (old && !isDigit && !old.strip && old.char === ch) {
          next.push(old);                  // unchanged symbol
        } else {
          const made = isDigit ? makeDigitSlot() : makeStaticSlot(ch);
          made.char = ch;
          if (isDigit) rollTo(made, Number(ch), true); // new digits appear in place…
          next.push(made); fresh.push(made);           // …with an enter animation
        }
      }
      slots = next;
      el.replaceChildren(...[...next].reverse().map(s => s.node));
      if (!REDUCED_MOTION) fresh.forEach(s => {
        s.node.classList.remove("enter"); void s.node.offsetWidth; s.node.classList.add("enter");
      });
      requestAnimationFrame(() => {
        next.forEach(s => { if (s.strip) rollTo(s, Number(s.char), REDUCED_MOTION); });
      });
    }
  };
}
const gaugeRoller = createRoller($("gaugeAmount"));

// ── Gauge ──
function renderGauge() {
  const cfg = getConfig();
  const spent = getSpentThisWeek();
  const remaining = getRemaining();
  const pct = getPctUsed();
  const over = spent > cfg.weeklyLimit;
  const days = daysUntilReset();

  // Ring: r=92 → circumference ≈ 578. Ring shows what's LEFT, draining as you spend.
  const C = 578;
  const fill = $("gaugeFill");
  fill.style.strokeDashoffset = C * (pct / 100);
  const tier = pct < 60 ? "ok" : pct < 85 ? "warn" : "danger";
  fill.setAttribute("stroke", tier === "ok" ? "url(#ringGrad)" : tier === "warn" ? "url(#ringGradWarn)" : "url(#ringGradDanger)");
  fill.className.baseVal = "gauge-fill" + (tier !== "ok" ? " " + tier : "");

  gaugeRoller.set(fmt(remaining));
  $("gaugeAmount").className = "roller" + (tier === "warn" ? " warn" : tier === "danger" ? " danger" : "");
  $("gaugeOf").textContent = `of ${fmt(cfg.weeklyLimit)}`;
  const pctEl = $("gaugePct");
  pctEl.textContent = over ? "Over budget" : `${Math.round(pct)}% used`;
  pctEl.className = "gauge-pct" + (over ? " over" : "");

  const wbFill = $("weekBarFill");
  wbFill.style.width = Math.min(100, pct) + "%";
  wbFill.className = "week-bar-fill" + (tier !== "ok" ? " " + tier : "");
  $("wbSpent").textContent = fmt(spent) + " spent";
  $("wbReset").textContent = days <= 0 ? "resets today" : `resets in ${days}d`;

  const streak = getStreak();
  const sh = $("headerStreak");
  if (streak > 0) { sh.textContent = `🔥 ${streak} wk${streak > 1 ? "s" : ""}`; sh.hidden = false; }
  else sh.hidden = true;
  $("headerReset").textContent = days <= 0 ? "resets today" : `${days}d left`;

  const payBtn = $("btnPay");
  const blocked = remaining <= 0;
  payBtn.className = blocked ? "pay-btn disabled" : "pay-btn";
  payBtn.disabled = blocked;
  payBtn.textContent = blocked ? "Over weekly limit" : "Pay";
}

// ── Tabs ──
document.querySelectorAll("nav.tabbar button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll("nav.tabbar button").forEach(b => b.classList.remove("active"));
    $("view-" + btn.dataset.view).classList.add("active");
    btn.classList.add("active");
    if (btn.dataset.view === "analytics") renderAnalytics();
  });
});

// ── Payment sheet ──
function presentSheet() {
  $("sheetOverlay").classList.add("show");
  $("paySheet").classList.add("show");
  $("app").classList.add("presented");
}
function openSheet() {
  presentSheet();
  setSheetState("input");
  $("amountField").value = "";
  fitAmount();
  $("contactInput").value = "";
  $("budgetStatus").hidden = true;
  $("btnConfirmPay").disabled = true;
  currentTxn = null;
  currentContact = null;
  saveContactPending = null;
  setTimeout(() => $("amountField").focus(), 350);
}
function closeSheet() {
  $("sheetOverlay").classList.remove("show");
  $("paySheet").classList.remove("show");
  $("app").classList.remove("presented");
}
function setSheetState(state) {
  ["input", "waiting", "success", "fail"].forEach(s => {
    $("state" + s.charAt(0).toUpperCase() + s.slice(1)).classList.toggle("active", s === state);
  });
}

$("btnPay").addEventListener("click", openSheet);
$("sheetOverlay").addEventListener("click", () => {
  if ($("stateInput").classList.contains("active")) closeSheet();
});
$("btnCancelSheet").addEventListener("click", closeSheet);

// ── Amount field: Apple Cash-style grow/shrink ──
function fitAmount() {
  const f = $("amountField");
  const len = Math.max(1, f.value.length);
  f.style.width = (len * 0.62 + 0.5) + "ch";
  f.style.fontSize = len <= 5 ? "58px" : len <= 7 ? "46px" : "38px";
  $("amountRow").classList.toggle("filled", f.value.length > 0);
}

// ── Budget check ──
function checkBudget() {
  const amount = Number($("amountField").value) || 0;
  const contact = $("contactInput").value.trim();
  const remaining = getRemaining();
  const st = $("budgetStatus");

  if (amount <= 0 || !contact) { st.hidden = true; $("btnConfirmPay").disabled = true; return; }

  st.hidden = false;
  if (amount <= remaining * 0.5) {
    st.className = "budget-status ok";
    st.textContent = `✓ ${fmt(remaining - amount)} will remain after this`;
  } else if (amount <= remaining) {
    st.className = "budget-status warn";
    st.textContent = `⚠ Only ${fmt(remaining - amount)} will be left — spend carefully`;
  } else {
    st.className = "budget-status over";
    st.textContent = `✗ ${fmt(amount)} exceeds your ${fmt(remaining)} left`;
    $("btnConfirmPay").disabled = true; return;
  }
  $("btnConfirmPay").disabled = false;
}

$("amountField").addEventListener("input", () => { fitAmount(); checkBudget(); });
$("contactInput").addEventListener("input", () => { checkBudget(); renderContactDropdown(); });

// ── Contact dropdown ──
function renderContactDropdown() {
  const q = $("contactInput").value.trim();
  const dd = $("contactDropdown");
  if (!q) { dd.hidden = true; return; }

  const matches = searchContacts(q);
  const exactMatch = matches.find(c => c.name.toLowerCase() === q.toLowerCase());
  let html = matches.slice(0, 5).map(c =>
    `<div class="contact-opt" data-id="${c.id}" data-name="${escHtml(c.name)}">
      <span>${escHtml(c.name)}</span>
      <span class="contact-opt-count">${c.payCount}× · ${fmt(c.totalPaid)}</span>
    </div>`
  ).join("");
  if (!exactMatch) html += `<div class="save-contact-row" id="saveContactOpt">+ Save "${escHtml(q)}"</div>`;

  dd.innerHTML = html; dd.hidden = false;

  dd.querySelectorAll(".contact-opt").forEach(el => {
    el.addEventListener("click", () => {
      const contacts = getContacts();
      currentContact = contacts.find(c => c.id === el.dataset.id) || null;
      $("contactInput").value = el.dataset.name;
      dd.hidden = true; saveContactPending = null; checkBudget();
    });
  });
  const saveOpt = $("saveContactOpt");
  if (saveOpt) saveOpt.addEventListener("click", () => {
    saveContactPending = q; dd.hidden = true; checkBudget();
    toast('Will save "' + q + '" after payment');
  });
}

document.addEventListener("click", e => {
  if (!$("contactDropdown").contains(e.target) && e.target !== $("contactInput"))
    $("contactDropdown").hidden = true;
});

// ── Confirm → waiting ──
$("btnConfirmPay").addEventListener("click", () => {
  const amount = Number($("amountField").value) || 0;
  const contactName = $("contactInput").value.trim();
  if (amount <= 0 || !contactName || amount > getRemaining()) return;

  if (saveContactPending && !currentContact) currentContact = saveContact(saveContactPending);
  else if (!currentContact && contactName) {
    const existing = searchContacts(contactName).find(c => c.name.toLowerCase() === contactName.toLowerCase());
    if (existing) currentContact = existing;
  }

  // Pending txns now count against the budget → the hold is real.
  currentTxn = addTxn({ contactName, contactId: currentContact?.id || null, amount, status: "pending" });
  renderGauge();
  showWaiting(currentTxn);
});

function showWaiting(txn) {
  $("waitingAmount").textContent = fmt(txn.amount);
  $("waitingContact").textContent = txn.contactName;
  setSheetState("waiting");
}

// ── Mark paid / cancelled ──
// Contact stats are updated inside updateTxnStatus (single source of truth —
// the old double call here was double-counting payee totals).
$("btnMarkPaid").addEventListener("click", () => {
  if (currentTxn) updateTxnStatus(currentTxn.id, "paid");
  showSuccess();
  renderGauge();
});

$("btnMarkCancelled").addEventListener("click", () => {
  if (currentTxn) updateTxnStatus(currentTxn.id, "cancelled");
  const amt = currentTxn ? currentTxn.amount : 0;
  $("failAmount").textContent = fmt(amt);
  $("failAmountReturn").textContent = fmt(amt);
  setSheetState("fail");
  renderGauge();
});

$("btnFailDone").addEventListener("click", closeSheet);
$("btnDone").addEventListener("click", closeSheet);

function showSuccess() {
  const pct = getPctUsed();
  const txn = currentTxn || { amount: 0, contactName: "" };
  $("successAmount").textContent = fmt(txn.amount);
  $("successContact").textContent = "→ " + txn.contactName;

  let msg;
  if (pct <= 50) msg = "You're doing great — " + fmt(getRemaining()) + " still left.";
  else if (pct <= 80) msg = fmt(getRemaining()) + " remaining. Pace yourself.";
  else msg = "Only " + fmt(getRemaining()) + " left. Make it count.";
  $("successMsg").textContent = msg;

  // Restart the check-draw + particle burst
  const wrap = $("successWrap");
  wrap.classList.remove("animate"); void wrap.offsetWidth;
  launchParticles();
  wrap.classList.add("animate");
  setSheetState("success");
}

function launchParticles() {
  if (REDUCED_MOTION) return;
  const c = $("particles"); c.innerHTML = "";
  for (let i = 0; i < 16; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 60 + Math.random() * 70;
    p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
    p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
    p.style.animationDelay = (0.4 + Math.random() * 0.25) + "s";
    if (i % 3 === 0) { p.style.background = "#63E6A0"; }
    if (i % 4 === 0) { p.style.width = p.style.height = "5px"; }
    c.appendChild(p);
  }
}

// ── Analytics ──
function renderAnalytics() {
  const streak = getStreak();
  const spent = getSpentThisWeek();
  const txns = getTxns().filter(t => t.status === "paid");
  const thisWeekTxns = txns.filter(t => {
    const ws = getWeekStart(new Date(), getConfig().weekStartDay);
    return new Date(t.date) >= ws;
  });
  const biggest = thisWeekTxns.reduce((m, t) => Math.max(m, t.amount), 0);

  $("statStreak").textContent = streak + " wk" + (streak !== 1 ? "s" : "");
  $("statSpent").textContent = fmt(spent);
  $("statCount").textContent = thisWeekTxns.length;
  $("statBiggest").textContent = biggest > 0 ? fmt(biggest) : "—";

  const weeks = getWeeklyHistory();
  const maxSpent = Math.max(...weeks.map(w => w.spent), 1);
  $("chartBars").innerHTML = weeks.map(w => {
    const h = Math.max(4, (w.spent / maxSpent) * 100);
    const cls = w.spent > w.limit ? "over" : "ok";
    return `<div class="chart-bar-wrap">
      <div class="chart-bar-track"><div class="chart-bar-fill ${cls}" style="height:${h}%"></div></div>
      <div class="chart-bar-label">${w.label.split(" ")[0]}</div>
    </div>`;
  }).join("");

  const top = getTopPayees();
  if (top.length === 0) {
    $("peopleList").innerHTML = '<div class="empty-state">No payments yet.</div>';
  } else {
    const avatarColor = (name) => {
      const colors = ["#30D158", "#0A84FF", "#FF9F0A", "#FF453A", "#BF5AF2", "#FF375F", "#64D2FF"];
      let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % colors.length;
      return colors[h];
    };
    $("peopleList").innerHTML = top.map(p => `
      <div class="person-row">
        <div class="person-avatar" style="background:${avatarColor(p.name)}">${escHtml(p.name[0].toUpperCase())}</div>
        <div class="person-info">
          <div class="person-name">${escHtml(p.name)}</div>
          <div class="person-count">${p.count} payment${p.count !== 1 ? "s" : ""}</div>
        </div>
        <div class="person-total">${fmt(p.amount)}</div>
      </div>`).join("");
  }

  const recent = getRecentTxns(15);
  if (recent.length === 0) { $("txnList").innerHTML = '<div class="empty-state">Nothing yet.</div>'; }
  else $("txnList").innerHTML = recent.map(t => {
    const d = new Date(t.date);
    const ds = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    return `<div class="txn-row">
      <div><div class="txn-name">${escHtml(t.contactName)}</div><div class="txn-date">${ds}</div></div>
      <div class="txn-right"><div class="txn-amount">${fmt(t.amount)}</div>
      <div class="txn-badge ${t.status}">${t.status}</div></div>
    </div>`;
  }).join("");
}

// ── Settings ──
function loadSettings() {
  const cfg = getConfig();
  $("inputLimit").value = cfg.weeklyLimit;
  $("inputWeekStart").value = String(cfg.weekStartDay);
}
$("btnSaveSettings").addEventListener("click", () => {
  setConfig({ weeklyLimit: Math.max(0, Number($("inputLimit").value) || 0), weekStartDay: Number($("inputWeekStart").value) });
  renderGauge(); toast("Saved ✓");
});
$("btnExport").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([exportData()], { type: "application/json" }));
  a.download = "weekly-gate-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click(); toast("Backup exported");
});
$("btnImport").addEventListener("click", () => $("fileImport").click());
$("fileImport").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try { importData(r.result); renderGauge(); renderAnalytics(); loadSettings(); toast("Restored ✓"); }
    catch { toast("Couldn't read that file"); }
  };
  r.readAsText(f); e.target.value = "";
});
$("btnResetData").addEventListener("click", () => {
  if (confirm("Erase all data? This can't be undone.")) {
    resetAllData(); renderGauge(); renderAnalytics(); loadSettings(); toast("Erased");
  }
});

// ── Utils ──
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ── Resume a pending payment ────────────────────────────────────
// iOS often reloads the PWA when you switch to your UPI app and back,
// which used to lose the "did you pay?" screen. On load (and on return
// to the app), re-open it for any recent unresolved payment.
function resumePendingIfAny() {
  expireStalePendings();
  const pending = getLatestPending();
  if (pending && (!currentTxn || currentTxn.id !== pending.id || !$("paySheet").classList.contains("show"))) {
    currentTxn = pending;
    currentContact = pending.contactId ? getContacts().find(c => c.id === pending.contactId) || null : null;
    presentSheet();
    showWaiting(pending);
  }
  renderGauge();
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") resumePendingIfAny();
});

// ── Init ──
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));

loadSettings();
fitAmount();
// First paint at 0, then animate the ring + odometer up to the real value.
requestAnimationFrame(() => resumePendingIfAny());
