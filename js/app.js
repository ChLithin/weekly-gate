// app.js — wires the UI to storage.js / upi.js / scanner.js.
// paymentApps.js is loaded in index.html
// No import needed if you are not using ES modules

let currentParsed = null;
let currentTxnId = null;

const $ = (id) => document.getElementById(id);

function formatRupee(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function showToast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------------- Gauge ----------------

function renderGauge() {
  const cfg = getConfig();
  const spent = getSpentThisWeek();
  const remaining = getRemaining();
  const over = spent > cfg.weeklyLimit;
  const pct = cfg.weeklyLimit > 0 ? Math.min(100, (spent / cfg.weeklyLimit) * 100) : 0;

  $("gaugeAmount").textContent = formatRupee(remaining);
  $("gaugeAmount").classList.toggle("over", over);
  $("gaugeOf").textContent = `left of ${formatRupee(cfg.weeklyLimit)}`;
  $("gaugeFill").style.width = pct + "%";
  $("gaugeFill").classList.toggle("over", over);

  const days = daysUntilReset();
  $("gaugeReset").textContent = days <= 0 ? "resets today" : `resets in ${days} day${days === 1 ? "" : "s"}`;
}

// ---------------- Tabs ----------------

function setActiveView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $("view-" + name).classList.add("active");
  document.querySelectorAll("nav.tabbar button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  if (name !== "scan") {
    stopScanner();
    resetScanFlow();
  }
  if (name === "history") {
    renderMerchantList();
    renderTxnList();
  }
}

document.querySelectorAll("nav.tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => setActiveView(btn.dataset.view));
});

// ---------------- Scan flow ----------------

function resetScanFlow() {
  $("scanIdle").hidden = false;
  $("scanLive").hidden = true;
  $("btnCancelScan").hidden = true;
  $("scanConfirm").hidden = true;
  $("scanFollowup").hidden = true;
  currentParsed = null;
}

$("btnStartScan").addEventListener("click", async () => {
  $("scanIdle").hidden = true;
  $("scanLive").hidden = false;
  $("btnCancelScan").hidden = false;
  await startScanner($("scanVideo"), $("scanCanvas"), onDecoded, onScanError);
});

$("btnCancelScan").addEventListener("click", () => {
  stopScanner();
  resetScanFlow();
});

function onScanError(err) {
  console.error(err);
  showToast("Camera access denied — enable it in iPhone Settings > Safari > Camera");
  resetScanFlow();
}

function onDecoded(raw) {
  $("scanLive").hidden = true;
  $("btnCancelScan").hidden = true;

  const parsed = parseUpiString(raw);
  if (!parsed) {
    showToast("That QR isn't a UPI payment code");
    resetScanFlow();
    return;
  }

  currentParsed = parsed;
  $("scanConfirm").hidden = false;
  $("confirmMerchant").textContent = parsed.pn || "Unknown merchant";
  $("confirmVpa").textContent = parsed.pa || "";

  if (parsed.am && Number(parsed.am) > 0) {
    $("amountInput").hidden = true;
    $("confirmAmount").hidden = false;
    $("confirmAmount").textContent = formatRupee(Number(parsed.am));
    updatePayState(Number(parsed.am));
  } else {
    $("confirmAmount").hidden = true;
    $("amountInput").hidden = false;
    $("amountInput").value = "";
    updatePayState(0);
  }
}

$("amountInput").addEventListener("input", () => {
  updatePayState(Number($("amountInput").value) || 0);
});

function updatePayState(amount) {
  const remaining = getRemaining();
  const payBtn = $("btnPay");
  const pill = $("confirmPill");
  const note = $("confirmRemainingNote");

  if (amount <= 0) {
    payBtn.disabled = true;
    payBtn.className = "btn btn-block-disabled";
    pill.className = "status-pill";
    pill.textContent = "Enter an amount";
    note.style.display = "none";
    return;
  }

  if (amount <= remaining) {
    payBtn.disabled = false;
    payBtn.className = "btn btn-primary";
    pill.className = "status-pill ok";
    pill.textContent = "Within budget";
    note.style.display = "none";
  } else {
    payBtn.disabled = true;
    payBtn.className = "btn btn-block-disabled";
    pill.className = "status-pill blocked";
    pill.textContent = "Over weekly limit";
    const days = daysUntilReset();
    note.style.display = "block";
    note.textContent = `You have ${formatRupee(remaining)} left this week — that's ${formatRupee(
      amount - remaining
    )} over. Resets in ${days} day${days === 1 ? "" : "s"}.`;
  }
}

$("btnRescan").addEventListener("click", () => {
  resetScanFlow();
});

$("btnCopyVpa").addEventListener("click", async () => {
  const amount = currentParsed.am || $("amountInput").value || "0";
  const text = `${currentParsed.pa}  ·  ${currentParsed.pn}  ·  ${formatRupee(Number(amount))}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Copied UPI details");
  } catch {
    showToast(text);
  }
});

$("btnPay").addEventListener("click", () => {

  if (!currentParsed) return;

  const amount =
    currentParsed.am && Number(currentParsed.am) > 0
      ? Number(currentParsed.am)
      : Number($("amountInput").value) || 0;

  if (amount <= 0 || amount > getRemaining()) return;

  const record = addTxn({
    merchant: currentParsed.pn,
    vpa: currentParsed.pa,
    amount,
    status: "pending",
  });

  currentTxnId = record.id;

  renderGauge();

  const upiLink = buildUpiLink({
    pa: currentParsed.pa,
    pn: currentParsed.pn,
    am: String(amount),
    tr: currentParsed.tr,
    cu: currentParsed.cu,
  });

  $("scanConfirm").hidden = true;
  $("scanFollowup").hidden = false;

  showPaymentChooser(upiLink);

});

$("btnMarkPaid").addEventListener("click", () => {
  if (currentTxnId) updateTxnStatus(currentTxnId, "paid");
  finishFollowup("Logged to this week's spend");
});

$("btnMarkFailed").addEventListener("click", () => {
  if (currentTxnId) updateTxnStatus(currentTxnId, "failed");
  finishFollowup("Not counted against your budget");
});

function finishFollowup(message) {
  currentTxnId = null;
  resetScanFlow();
  renderGauge();
  showToast(message);
}

// On load, if there's a very recent pending payment (e.g. the app reloaded after
// switching to BHIM), resume the follow-up question instead of losing it.
function resumePendingIfAny() {
  const txns = getTxns();
  const recentPending = txns.find(
    (t) => t.status === "pending" && Date.now() - new Date(t.date).getTime() < 30 * 60 * 1000
  );
  if (recentPending) {
    currentTxnId = recentPending.id;
    setActiveView("scan");
    $("scanIdle").hidden = true;
    $("scanFollowup").hidden = false;
  }
}

// ---------------- History ----------------

function renderMerchantList() {
  const totals = getMerchantTotals();
  const container = $("merchantList");
  if (totals.length === 0) {
    container.innerHTML = '<div class="empty-state">No payments yet.</div>';
    return;
  }
  const max = totals[0].amount;
  container.innerHTML = totals
    .map(
      (t) => `
      <div class="merchant-row">
        <div class="merchant-name">${escapeHtml(t.merchant)}</div>
        <div class="merchant-bar-track">
          <div class="merchant-bar-fill" style="width:${Math.max(4, (t.amount / max) * 100)}%"></div>
        </div>
        <div class="merchant-amount">${formatRupee(t.amount)}</div>
      </div>`
    )
    .join("");
}

function renderTxnList() {
  const txns = getTxns();
  const container = $("txnList");
  if (txns.length === 0) {
    container.innerHTML = '<div class="empty-state">Nothing logged yet.</div>';
    return;
  }
  container.innerHTML = txns
    .slice(0, 50)
    .map((t) => {
      const d = new Date(t.date);
      const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) +
        " · " + d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      return `
      <div class="txn-row">
        <div class="txn-main">
          <span class="txn-merchant">${escapeHtml(t.merchant)}</span>
          <span class="txn-date">${dateStr}</span>
        </div>
        <div class="txn-amount-col">
          <div class="txn-amount">${formatRupee(t.amount)}</div>
          <div class="txn-badge ${t.status}">${t.status}</div>
        </div>
      </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------------- Settings ----------------

function loadSettingsForm() {
  const cfg = getConfig();
  $("inputLimit").value = cfg.weeklyLimit;
  $("inputWeekStart").value = String(cfg.weekStartDay);
}

$("btnSaveSettings").addEventListener("click", () => {
  const weeklyLimit = Math.max(0, Number($("inputLimit").value) || 0);
  const weekStartDay = Number($("inputWeekStart").value);
  setConfig({ weeklyLimit, weekStartDay });
  renderGauge();
  showToast("Saved");
});

$("btnExport").addEventListener("click", () => {
  const blob = new Blob([exportData()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `weekly-gate-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Backup downloaded");
});

$("btnImport").addEventListener("click", () => $("fileImport").click());

$("fileImport").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importData(reader.result);
      renderGauge();
      renderMerchantList();
      renderTxnList();
      loadSettingsForm();
      showToast("Backup restored");
    } catch {
      showToast("That file couldn't be read");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

$("btnResetData").addEventListener("click", () => {
  if (confirm("Erase the weekly limit and all logged payments on this phone? This can't be undone.")) {
    resetAllData();
    renderGauge();
    renderMerchantList();
    renderTxnList();
    loadSettingsForm();
    showToast("All data erased");
  }
});

function showPaymentChooser(upiLink) {

    const links = getPaymentLinks(upiLink);

    const choice = prompt(
`Choose Payment App

1 - BHIM

2 - Google Pay

3 - PhonePe

4 - Paytm

5 - WhatsApp

6 - Any UPI`
    );

    switch(choice){

        case "1":
            window.location.href = links.bhim;
            break;

        case "2":
            window.location.href = links.gpay;
            break;

        case "3":
            window.location.href = links.phonepe;
            break;

        case "4":
            window.location.href = links.paytm;
            break;

        case "5":
            window.location.href = links.whatsapp;
            break;

        default:
            window.location.href = links.any;
    }

}
// ---------------- Init ----------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

renderGauge();
loadSettingsForm();
resumePendingIfAny();
