// app.js — Weekly Gate main controller

const $ = id => document.getElementById(id);
const fmt = n => "₹" + Math.round(n).toLocaleString("en-IN");

let currentTxnId = null;
let currentAmount = 0;
let currentContact = null;
let saveContactPending = null;

// ── Toast ──
function toast(msg, dur = 2200) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), dur);
}

// ── Gauge ──
function renderGauge() {
  const cfg = getConfig();
  const spent = getSpentThisWeek();
  const remaining = getRemaining();
  const pct = getPctUsed();
  const over = spent > cfg.weeklyLimit;
  const days = daysUntilReset();

  // Circumference for r=90 is 2π×90 ≈ 565
  const C = 565;
  const offset = C - (pct / 100) * C;
  const fill = $("gaugeFill");
  fill.style.strokeDashoffset = offset;
  const color = pct < 60 ? "var(--accent)" : pct < 85 ? "var(--warning)" : "var(--danger)";
  fill.style.stroke = color;

  const amEl = $("gaugeAmount");
  amEl.textContent = fmt(remaining);
  amEl.className = "gauge-amount" + (pct >= 85 ? " danger" : pct >= 60 ? " warn" : "");
  $("gaugeOf").textContent = `of ${fmt(cfg.weeklyLimit)}`;
  $("gaugePct").textContent = over ? "Over budget!" : `${Math.round(pct)}% used`;

  const wbFill = $("weekBarFill");
  wbFill.style.width = Math.min(100, pct) + "%";
  wbFill.className = "week-bar-fill" + (pct >= 85 ? " danger" : pct >= 60 ? " warn" : "");
  $("wbSpent").textContent = fmt(spent) + " spent";
  $("wbReset").textContent = days <= 0 ? "resets today" : `resets in ${days}d`;

  const streak = getStreak();
  const sh = $("headerStreak");
  if (streak > 0) { sh.textContent = `🔥 ${streak} week${streak>1?"s":""}`; sh.hidden = false; }
  else sh.hidden = true;
  $("headerReset").textContent = days <= 0 ? "resets today" : `${days}d left`;

  const payBtn = $("btnPay");
  payBtn.className = over ? "pay-btn disabled" : "pay-btn";
  payBtn.disabled = over;
  payBtn.textContent = over ? "Over weekly limit" : "Pay →";
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
function openSheet() {
  $("sheetOverlay").classList.add("show");
  $("paySheet").classList.add("show");
  setSheetState("input");
  $("amountField").value = "";
  $("contactInput").value = "";
  $("budgetStatus").hidden = true;
  $("btnConfirmPay").disabled = true;
  currentContact = null;
  saveContactPending = null;
  setTimeout(() => $("amountField").focus(), 300);
}
function closeSheet() {
  $("sheetOverlay").classList.remove("show");
  $("paySheet").classList.remove("show");
}
function setSheetState(state) {
  ["input","waiting","success","fail"].forEach(s => {
    $("state" + s.charAt(0).toUpperCase() + s.slice(1)).classList.toggle("active", s === state);
  });
}

$("btnPay").addEventListener("click", openSheet);
$("sheetOverlay").addEventListener("click", () => {
  if ($("stateInput").classList.contains("active")) closeSheet();
});
$("btnCancelSheet").addEventListener("click", closeSheet);

// ── Amount + budget check ──
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

$("amountField").addEventListener("input", checkBudget);
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

  // Save contact if requested
  if (saveContactPending && !currentContact) currentContact = saveContact(saveContactPending);
  else if (!currentContact && contactName) {
    const existing = searchContacts(contactName).find(c => c.name.toLowerCase() === contactName.toLowerCase());
    if (existing) currentContact = existing;
  }

  currentAmount = amount;
  const record = addTxn({ contactName, contactId: currentContact?.id || null, amount, status: "pending" });
  currentTxnId = record.id;
  renderGauge();

  $("waitingAmount").textContent = fmt(amount);
  $("waitingContact").textContent = contactName;
  setSheetState("waiting");
});

// ── Mark paid / cancelled ──
$("btnMarkPaid").addEventListener("click", () => {
  if (currentTxnId) updateTxnStatus(currentTxnId, "paid");
  if (currentContact) updateContactStats(currentContact.id, currentAmount);
  showSuccess();
  renderGauge();
});

$("btnMarkCancelled").addEventListener("click", () => {
  if (currentTxnId) updateTxnStatus(currentTxnId, "cancelled");
  $("failAmount").textContent = fmt(currentAmount);
  $("failAmountReturn").textContent = fmt(currentAmount);
  setSheetState("fail");
  renderGauge();
});

$("btnFailDone").addEventListener("click", closeSheet);
$("btnDone").addEventListener("click", closeSheet);

function showSuccess() {
  const cfg = getConfig(); const spent = getSpentThisWeek(); const pct = getPctUsed();
  $("successAmount").textContent = fmt(currentAmount);
  const txns = getTxns(); const today = txns.filter(t => {
    const d = new Date(t.date); const now = new Date();
    return t.status==="paid" && d.toDateString()===now.toDateString();
  });
  const name = $("contactInput").value.trim();
  $("successContact").textContent = "→ " + name;

  let msg = "";
  if (pct <= 50) msg = "You're doing great — " + fmt(getRemaining()) + " still left!";
  else if (pct <= 80) msg = fmt(getRemaining()) + " remaining. Pace yourself.";
  else msg = "Only " + fmt(getRemaining()) + " left. Make it count.";
  $("successMsg").textContent = msg;

  launchCoins();
  setSheetState("success");
}

function launchCoins() {
  const c = $("coinsContainer"); c.innerHTML = "";
  for (let i = 0; i < 12; i++) {
    const coin = document.createElement("div");
    coin.className = "coin"; coin.textContent = "₹";
    const x = 20 + Math.random() * 60;
    const delay = Math.random() * 0.5;
    coin.style.cssText = `left:${x}%;bottom:0;animation-delay:${delay}s;animation-duration:${0.9+Math.random()*0.6}s`;
    c.appendChild(coin);
  }
}

// ── Analytics ──
function renderAnalytics() {
  const streak = getStreak();
  const spent = getSpentThisWeek();
  const txns = getTxns().filter(t => t.status==="paid");
  const thisWeekTxns = txns.filter(t => {
    const ws = getWeekStart(new Date(), getConfig().weekStartDay);
    return new Date(t.date) >= ws;
  });
  const biggest = thisWeekTxns.reduce((m,t) => Math.max(m, t.amount), 0);

  $("statStreak").textContent = streak + " wk" + (streak!==1?"s":"");
  $("statSpent").textContent = fmt(spent);
  $("statCount").textContent = thisWeekTxns.length;
  $("statBiggest").textContent = biggest > 0 ? fmt(biggest) : "—";

  // Weekly chart
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

  // People
  const top = getTopPayees();
  if (top.length === 0) {
    $("peopleList").innerHTML = '<div class="empty-state">No payments yet.</div>';
  } else {
    const avatarColor = (name) => {
      const colors = ["#7C6FF7","#10B981","#F59E0B","#F43F5E","#3B82F6","#EC4899","#14B8A6"];
      let h = 0; for (const c of name) h = (h*31 + c.charCodeAt(0)) % colors.length;
      return colors[h];
    };
    $("peopleList").innerHTML = top.map(p => `
      <div class="person-row">
        <div class="person-avatar" style="background:${avatarColor(p.name)}">${p.name[0].toUpperCase()}</div>
        <div class="person-info">
          <div class="person-name">${escHtml(p.name)}</div>
          <div class="person-count">${p.count} payment${p.count!==1?"s":""}</div>
        </div>
        <div class="person-total">${fmt(p.amount)}</div>
      </div>`).join("");
  }

  // Recent txns
  const recent = getRecentTxns(15);
  if (recent.length === 0) { $("txnList").innerHTML = '<div class="empty-state">Nothing yet.</div>'; }
  else $("txnList").innerHTML = recent.map(t => {
    const d = new Date(t.date);
    const ds = d.toLocaleDateString("en-IN",{day:"numeric",month:"short"}) + " · " +
      d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
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
  setConfig({ weeklyLimit: Math.max(0, Number($("inputLimit").value)||0), weekStartDay: Number($("inputWeekStart").value) });
  renderGauge(); toast("Saved ✓");
});
$("btnExport").addEventListener("click", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([exportData()],{type:"application/json"}));
  a.download = "weekly-gate-" + new Date().toISOString().slice(0,10) + ".json";
  a.click(); toast("Backup exported");
});
$("btnImport").addEventListener("click", () => $("fileImport").click());
$("fileImport").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { importData(r.result); renderGauge(); renderAnalytics(); loadSettings(); toast("Restored ✓"); }
    catch { toast("Couldn't read that file"); } };
  r.readAsText(f); e.target.value = "";
});
$("btnResetData").addEventListener("click", () => {
  if (confirm("Erase all data? This can't be undone.")) {
    resetAllData(); renderGauge(); renderAnalytics(); loadSettings(); toast("Erased");
  }
});

// ── Utils ──
function escHtml(s) { return String(s).replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c])); }

// ── Init ──
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(()=>{}));

renderGauge();
loadSettings();
