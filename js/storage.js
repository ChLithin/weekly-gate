// storage.js — everything about persisting and computing the weekly budget.
// Uses localStorage only. No network, no backend: your spend data never leaves the phone.

const STORE = {
  CONFIG: "wg_config",
  TXNS: "wg_txns",
};

const DEFAULT_CONFIG = {
  weeklyLimit: 1000,
  weekStartDay: 1, // 0=Sun ... 6=Sat. 1 = Monday.
};

function getConfig() {
  try {
    const raw = localStorage.getItem(STORE.CONFIG);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function setConfig(cfg) {
  localStorage.setItem(STORE.CONFIG, JSON.stringify(cfg));
}

function getTxns() {
  try {
    const raw = localStorage.getItem(STORE.TXNS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setTxns(txns) {
  localStorage.setItem(STORE.TXNS, JSON.stringify(txns));
}

function addTxn(txn) {
  const txns = getTxns();
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    merchant: txn.merchant || "Unknown",
    vpa: txn.vpa || "",
    amount: Number(txn.amount) || 0,
    status: txn.status || "pending", // pending | paid | failed | blocked
    date: txn.date || new Date().toISOString(),
  };
  txns.unshift(record);
  setTxns(txns);
  return record;
}

function updateTxnStatus(id, status) {
  const txns = getTxns();
  const idx = txns.findIndex((t) => t.id === id);
  if (idx !== -1) {
    txns[idx].status = status;
    setTxns(txns);
  }
  return txns[idx];
}

// ---- Week math ----
// Returns the Date (local, midnight) for the start of the current week window,
// given a weekStartDay (0=Sun..6=Sat).
function getWeekStart(now, weekStartDay) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - weekStartDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7);
  return d;
}

function getSpentThisWeek() {
  const cfg = getConfig();
  const now = new Date();
  const start = getWeekStart(now, cfg.weekStartDay);
  const end = getWeekEnd(start);
  const txns = getTxns();
  return txns
    .filter((t) => {
      if (t.status !== "paid" && t.status !== "pending") return false;
      const d = new Date(t.date);
      return d >= start && d < end;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

function getRemaining() {
  const cfg = getConfig();
  return Math.max(0, cfg.weeklyLimit - getSpentThisWeek());
}

function daysUntilReset() {
  const cfg = getConfig();
  const now = new Date();
  const start = getWeekStart(now, cfg.weekStartDay);
  const end = getWeekEnd(start);
  const ms = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

// ---- Merchant analysis ----
function getMerchantTotals() {
  const txns = getTxns().filter((t) => t.status === "paid");
  const totals = {};
  for (const t of txns) {
    totals[t.merchant] = (totals[t.merchant] || 0) + t.amount;
  }
  return Object.entries(totals)
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount);
}

// ---- Backup ----
function exportData() {
  return JSON.stringify(
    { config: getConfig(), txns: getTxns(), exportedAt: new Date().toISOString() },
    null,
    2
  );
}

function importData(jsonString) {
  const parsed = JSON.parse(jsonString);
  if (parsed.config) setConfig({ ...DEFAULT_CONFIG, ...parsed.config });
  if (Array.isArray(parsed.txns)) setTxns(parsed.txns);
}

function resetAllData() {
  localStorage.removeItem(STORE.CONFIG);
  localStorage.removeItem(STORE.TXNS);
}
