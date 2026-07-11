// app.js — Weekly Gate main controller

const $ = id => document.getElementById(id);
const fmt = n => "₹" + Math.round(n).toLocaleString("en-IN");
const fmtShort = n => n >= 100000 ? (n / 100000).toFixed(1).replace(/\.0$/, "") + "L"
  : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k"
  : String(Math.round(n));
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let currentTxn = null;        // full txn record being processed
let currentContact = null;
let saveContactPending = null;
let payeePeriod = "week";     // week | month | all

// ── Toast ──
function toast(msg, dur = 2200) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), dur);
}

// ── Rolling money odometer ──────────────────────────────────────
// Digits roll vertically (Apple-style ticker); symbols/commas fade in.
// Slots are aligned from the RIGHT so the units digit stays the units digit.
function createRoller(el) {
  let slots = []; // right-aligned: slots[0] = rightmost char

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
    const y = -digit * 10; // strip holds 10 digits; each is 10% of strip height
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
          if (isDigit) rollTo(made, Number(ch), true);
          next.push(made); fresh.push(made);
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
  $("essentialCheck").checked = false;
  $("contactLabel").textContent = "Paying who?";
  $("contactInput").placeholder = "Name or search saved\u2026";
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

// ── Amount field: auto-size via a hidden mirror span ──
// (measures the real rendered width of the digits, so nothing ever clips)
const amtMirror = document.createElement("span");
amtMirror.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre";
document.body.appendChild(amtMirror);

function fitAmount() {
  const f = $("amountField");
  const v = f.value || f.placeholder || "0";
  const fs = v.length <= 5 ? 56 : v.length <= 8 ? 44 : 34;

  const cs = getComputedStyle(f);
  amtMirror.style.fontFamily = cs.fontFamily;
  amtMirror.style.fontWeight = cs.fontWeight;
  amtMirror.style.letterSpacing = cs.letterSpacing;
  amtMirror.style.fontVariantNumeric = cs.fontVariantNumeric;
  amtMirror.style.fontSize = fs + "px";
  amtMirror.textContent = v;

  f.style.fontSize = fs + "px";
  $("amountSymbol").style.fontSize = Math.round(fs * 0.58) + "px";
  const w = Math.min(amtMirror.offsetWidth + 6, window.innerWidth * 0.76);
  f.style.width = w + "px";
  $("amountRow").classList.toggle("filled", f.value.length > 0);
}

// ── Budget check ──
function isEssential() { return $("essentialCheck").checked; }

function checkBudget() {
  const amount = Number($("amountField").value) || 0;
  const contact = $("contactInput").value.trim();
  const st = $("budgetStatus");

  if (amount <= 0 || !contact) { st.hidden = true; $("btnConfirmPay").disabled = true; return; }

  // Essentials bypass the weekly budget entirely
  if (isEssential()) {
    st.hidden = false;
    st.className = "budget-status ok";
    st.textContent = "✓ Essential — won't count against your weekly budget";
    $("btnConfirmPay").disabled = false;
    return;
  }

  const remaining = getRemaining();
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

// Toggle essential: update label + recheck budget
$("essentialCheck").addEventListener("change", () => {
  const ess = isEssential();
  $("contactLabel").textContent = ess ? "What is it?" : "Paying who?";
  $("contactInput").placeholder = ess ? "e.g. Laundry, Facewash…" : "Name or search saved\u2026";
  checkBudget();
});

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
  const essential = isEssential();
  if (amount <= 0 || !contactName || (!essential && amount > getRemaining())) return;

  if (saveContactPending && !currentContact) currentContact = saveContact(saveContactPending);
  else if (!currentContact && contactName) {
    const existing = searchContacts(contactName).find(c => c.name.toLowerCase() === contactName.toLowerCase());
    if (existing) currentContact = existing;
  }

  // Essentials are logged as pending but excluded from budget math (isEssential flag).
  // Regular txns count against budget as a hold until confirmed or cancelled.
  currentTxn = addTxn({ contactName, contactId: currentContact?.id || null, amount, status: "pending", isEssential: essential });
  renderGauge();
  showWaiting(currentTxn);
});

function showWaiting(txn) {
  $("waitingAmount").textContent = fmt(txn.amount);
  $("waitingContact").textContent = txn.contactName;
  setSheetState("waiting");
}

// ── Mark paid / cancelled ──
// Contact stats are updated inside updateTxnStatus only (single source of truth).
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
    if (i % 3 === 0) p.style.background = "#7D7AFF";
    if (i % 4 === 0) p.style.width = p.style.height = "5px";
    c.appendChild(p);
  }
}

// ── Analytics ───────────────────────────────────────────────────

const AVATAR_COLORS = ["#5E5CE6", "#66D4CF", "#FF9F0A", "#FF453A", "#BF5AF2", "#FF375F", "#64D2FF", "#30D158"];
function avatarColor(name) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

function paidTxns() { return getTxns().filter(t => t.status === "paid"); }

function txnsInRange(txns, start, end) {
  return txns.filter(t => { const d = new Date(t.date); return d >= start && (!end || d < end); });
}

function renderAnalytics() {
  const cfg = getConfig();
  const now = new Date();
  const weekStart = getWeekStart(now, cfg.weekStartDay);
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const all = paidTxns();
  const thisWeek = txnsInRange(all, weekStart, null);
  const lastWeek = txnsInRange(all, lastWeekStart, weekStart);

  // ── Stat cards ──
  const spent = thisWeek.reduce((s, t) => s + t.amount, 0);
  const lastSpent = lastWeek.reduce((s, t) => s + t.amount, 0);
  $("statSpent").textContent = fmt(spent);
  const deltaEl = $("statDelta");
  if (lastSpent > 0) {
    const diff = spent - lastSpent;
    const pctDiff = Math.round(Math.abs(diff) / lastSpent * 100);
    deltaEl.textContent = diff === 0 ? "same as last week" : `${diff > 0 ? "↑" : "↓"} ${pctDiff}% vs last week`;
    deltaEl.className = "stat-card-sub " + (diff > 0 ? "up" : diff < 0 ? "down" : "");
  } else { deltaEl.textContent = "no data last week"; deltaEl.className = "stat-card-sub"; }

  const daysElapsed = Math.min(7, Math.max(1, Math.floor((now - weekStart) / 86400000) + 1));
  $("statAvg").textContent = fmt(spent / daysElapsed);
  $("statAvgSub").textContent = `over ${daysElapsed} day${daysElapsed > 1 ? "s" : ""}`;

  $("statCount").textContent = thisWeek.length;
  $("statCountSub").textContent = "this week";

  const biggest = thisWeek.reduce((m, t) => t.amount > m.amount ? t : m, { amount: 0 });
  $("statBiggest").textContent = biggest.amount > 0 ? fmt(biggest.amount) : "—";
  $("statBiggestSub").textContent = biggest.amount > 0 ? "to " + biggest.contactName : "";

  renderDayBars(thisWeek, weekStart, now);
  renderTrend(cfg);
  renderPayees(all, weekStart, now);
  renderRecent();
  renderEssentials();
}

// ── Essentials analytics ──
function renderEssentials() {
  const { months, items } = getEssentialStats(3);
  const now = new Date();
  const thisMonth = months[months.length - 1];
  const allSpent = months.reduce((s, m) => s + m.spent, 0);
  const avg = Math.round(allSpent / months.length);

  $("essMonthSpent").textContent = fmt(thisMonth.spent);
  $("essMonthCount").textContent = thisMonth.count ? `${thisMonth.count} item${thisMonth.count !== 1 ? "s" : ""}` : "nothing this month";
  $("essAvg").textContent = fmt(avg);

  // Monthly bar chart (reuses day-bars style)
  const max = Math.max(...months.map(m => m.spent), 1);
  $("essMonthBars").innerHTML = months.map(m => {
    const h = Math.max(3, (m.spent / max) * 100);
    return `<div class="day-bar-wrap">
      <div class="day-val">${m.spent > 0 ? "₹" + fmtShort(m.spent) : ""}</div>
      <div class="day-bar-track"><div class="day-bar-fill" style="height:${m.spent > 0 ? h : 0}%"></div></div>
      <div class="day-label">${m.label}</div>
    </div>`;
  }).join("");

  // By item list
  if (items.length === 0) {
    $("essItemList").innerHTML = '<div class="empty-state">No essentials tracked yet.</div>';
    return;
  }
  const maxAmt = items[0].amount;
  $("essItemList").innerHTML = `<div class="card-pad">` + items.map(it => `
    <div class="payee-row">
      <div class="payee-top">
        <div class="payee-avatar" style="background:${avatarColor(it.name)}">${escHtml(it.name[0].toUpperCase())}</div>
        <div class="payee-name">${escHtml(it.name)}</div>
        <div class="payee-amount">${fmt(it.amount)}</div>
      </div>
      <div class="payee-bar-track"><div class="payee-bar-fill" style="width:${Math.max(3, it.amount / maxAmt * 100)}%"></div></div>
    </div>`).join("") + `</div>`;
}

// ── Spend per day (current week) ──
function renderDayBars(thisWeek, weekStart, now) {
  const perDay = Array(7).fill(0);
  thisWeek.forEach(t => {
    const i = Math.floor((new Date(t.date) - weekStart) / 86400000);
    if (i >= 0 && i < 7) perDay[i] += t.amount;
  });
  const todayIdx = Math.floor((now - weekStart) / 86400000);
  const max = Math.max(...perDay, 1);
  const DOW = ["S", "M", "T", "W", "T", "F", "S"];

  const endLabel = new Date(weekStart); endLabel.setDate(endLabel.getDate() + 6);
  const fd = d => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  $("dayRange").textContent = `${fd(weekStart)} – ${fd(endLabel)}`;

  $("dayBars").innerHTML = perDay.map((amt, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    const h = Math.max(3, (amt / max) * 100);
    const cls = "day-bar-wrap" + (i === todayIdx ? " today" : "") + (i > todayIdx ? " future" : "");
    return `<div class="${cls}">
      <div class="day-val">${amt > 0 ? "₹" + fmtShort(amt) : ""}</div>
      <div class="day-bar-track"><div class="day-bar-fill" style="height:${amt > 0 ? h : 0}%"></div></div>
      <div class="day-label">${DOW[d.getDay()]}</div>
    </div>`;
  }).join("");
}

// ── 8-week trend (smooth SVG line + limit guide) ──
function renderTrend(cfg) {
  const weeks = getWeeklyHistory();
  const W = 320, H = 130, padL = 8, padR = 30, padT = 16, padB = 20;
  const max = Math.max(...weeks.map(w => w.spent), cfg.weeklyLimit, 1) * 1.08;
  const x = i => padL + i * (W - padL - padR) / (weeks.length - 1);
  const y = v => padT + (1 - v / max) * (H - padT - padB);

  const pts = weeks.map((w, i) => [x(i), y(w.spent)]);
  let line = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += `C${c1x.toFixed(1)},${c1y.toFixed(1)},${c2x.toFixed(1)},${c2y.toFixed(1)},${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  const base = H - padB;
  const area = line + `L${pts[pts.length - 1][0]},${base}L${pts[0][0]},${base}Z`;
  const yLimit = y(cfg.weeklyLimit);

  const dots = pts.map(([px, py], i) =>
    `<circle class="trend-dot${i === pts.length - 1 ? " last" : ""}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}"/>`
  ).join("");
  const labels = weeks.map((w, i) =>
    i % 2 === 1 ? `<text class="trend-x-label" x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle">${w.label.split(" ")[0]} ${w.label.split(" ")[1] || ""}</text>` : ""
  ).join("");

  $("trendChart").innerHTML = `
  <svg class="trend-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7D7AFF" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#7D7AFF" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line class="trend-limit" x1="${padL}" y1="${yLimit.toFixed(1)}" x2="${W - padR}" y2="${yLimit.toFixed(1)}"/>
    <text class="trend-limit-label" x="${W - padR + 4}" y="${(yLimit + 3).toFixed(1)}">limit</text>
    <path class="trend-area" d="${area}" fill="url(#trendFill)"/>
    <path class="trend-line" d="${line}" pathLength="1"/>
    ${dots}${labels}
  </svg>`;
}

// ── By payee: grouped from actual transactions, sorted by amount ──
function renderPayees(all, weekStart, now) {
  let txns;
  if (payeePeriod === "week") txns = txnsInRange(all, weekStart, null);
  else if (payeePeriod === "month") {
    const from = new Date(now); from.setDate(from.getDate() - 30);
    txns = txnsInRange(all, from, null);
  } else txns = all;

  const groups = new Map();
  txns.forEach(t => {
    const key = t.contactName.trim().toLowerCase();
    const g = groups.get(key) || { name: t.contactName.trim(), amount: 0, count: 0 };
    g.amount += t.amount; g.count++;
    groups.set(key, g);
  });
  const payees = [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, 8);
  const total = payees.reduce((s, p) => s + p.amount, 0);
  const maxAmt = payees.length ? payees[0].amount : 1;

  if (payees.length === 0) {
    $("payeeList").innerHTML = `<div class="empty-state">No payments ${payeePeriod === "all" ? "yet" : "in this period"}.</div>`;
    return;
  }
  $("payeeList").innerHTML = payees.map(p => `
    <div class="payee-row">
      <div class="payee-top">
        <div class="payee-avatar" style="background:${avatarColor(p.name)}">${escHtml(p.name[0].toUpperCase())}</div>
        <div class="payee-name">${escHtml(p.name)}</div>
        <div class="payee-amount">${fmt(p.amount)}</div>
      </div>
      <div class="payee-bar-track"><div class="payee-bar-fill" style="width:${Math.max(3, p.amount / maxAmt * 100)}%"></div></div>
      <div class="payee-meta">
        <span>${p.count} payment${p.count !== 1 ? "s" : ""}</span>
        <span>${Math.round(p.amount / total * 100)}% of spend</span>
      </div>
    </div>`).join("");
}

$("payeeSeg").querySelectorAll("button").forEach(b => {
  b.addEventListener("click", () => {
    payeePeriod = b.dataset.period;
    $("payeeSeg").querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    const cfg = getConfig();
    renderPayees(paidTxns(), getWeekStart(new Date(), cfg.weekStartDay), new Date());
  });
});

// ── Recent ──
function renderRecent() {
  const recent = getRecentTxns(15);
  if (recent.length === 0) { $("txnList").innerHTML = '<div class="empty-state">Nothing yet.</div>'; return; }
  $("txnList").innerHTML = recent.map(t => {
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
// iOS often reloads the PWA when you switch to your UPI app and back;
// re-open the "did you pay?" screen for any recent unresolved payment.
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
requestAnimationFrame(() => resumePendingIfAny());
