// storage.js — budget config, transactions, contacts, analytics

const STORE = { CONFIG: "wg_config", TXNS: "wg_txns", CONTACTS: "wg_contacts" };
const DEFAULT_CONFIG = { weeklyLimit: 1000, weekStartDay: 1 };

function getConfig() {
  try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORE.CONFIG) || "{}") }; }
  catch { return { ...DEFAULT_CONFIG }; }
}
function setConfig(cfg) { localStorage.setItem(STORE.CONFIG, JSON.stringify(cfg)); }

function getTxns() {
  try { return JSON.parse(localStorage.getItem(STORE.TXNS) || "[]"); }
  catch { return []; }
}
function setTxns(t) { localStorage.setItem(STORE.TXNS, JSON.stringify(t)); }

function addTxn(txn) {
  const txns = getTxns();
  const record = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    contactName: txn.contactName || "Unknown", contactId: txn.contactId || null,
    amount: Number(txn.amount) || 0, status: txn.status || "pending",
    isEssential: txn.isEssential || false,
    date: txn.date || new Date().toISOString() };
  txns.unshift(record); setTxns(txns);
  if (record.contactId && record.status === "paid") updateContactStats(record.contactId, record.amount);
  return record;
}
function updateTxnStatus(id, status) {
  const txns = getTxns(); const i = txns.findIndex(t => t.id === id);
  if (i !== -1) { txns[i].status = status; setTxns(txns);
    if (status === "paid" && txns[i].contactId) updateContactStats(txns[i].contactId, txns[i].amount); }
  return txns[i];
}

// Week math
function getWeekStart(now, weekStartDay) {
  const d = new Date(now); d.setHours(0,0,0,0);
  d.setDate(d.getDate() - (d.getDay() - weekStartDay + 7) % 7); return d;
}
function getWeekEnd(ws) { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; }
function getWeekKey(date) { const ws = getWeekStart(date, getConfig().weekStartDay); return ws.toISOString().slice(0,10); }

function getSpentThisWeek() {
  // Pending payments count too — the "reserved" hold is real until you
  // confirm or cancel. Stale pendings are auto-cancelled on app load.
  const cfg = getConfig(); const now = new Date();
  const start = getWeekStart(now, cfg.weekStartDay); const end = getWeekEnd(start);
  return getTxns().filter(t => (t.status==="paid" || t.status==="pending") && !t.isEssential && new Date(t.date)>=start && new Date(t.date)<end)
    .reduce((s,t) => s + t.amount, 0);
}

// Pending-payment lifecycle (iOS reloads the PWA when you app-switch,
// so pending state must survive a reload)
const PENDING_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
function getLatestPending() {
  const now = Date.now();
  return getTxns().find(t => t.status === "pending" && (now - new Date(t.date).getTime()) < PENDING_TTL_MS) || null;
}
function expireStalePendings() {
  const now = Date.now(); let changed = false;
  const txns = getTxns();
  txns.forEach(t => {
    if (t.status === "pending" && (now - new Date(t.date).getTime()) >= PENDING_TTL_MS) {
      t.status = "cancelled"; changed = true;
    }
  });
  if (changed) setTxns(txns);
}
function getRemaining() { return Math.max(0, getConfig().weeklyLimit - getSpentThisWeek()); }
function daysUntilReset() {
  const cfg = getConfig(); const ws = getWeekStart(new Date(), cfg.weekStartDay);
  const end = getWeekEnd(ws); return Math.max(0, Math.ceil((end - new Date()) / 86400000));
}
function getPctUsed() {
  const cfg = getConfig(); const limit = cfg.weeklyLimit;
  return limit > 0 ? Math.min(100, (getSpentThisWeek() / limit) * 100) : 0;
}

// Weekly history for charts (last 8 weeks)
function getWeeklyHistory() {
  const cfg = getConfig(); const txns = getTxns();
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const refDate = new Date(); refDate.setDate(refDate.getDate() - i * 7);
    const ws = getWeekStart(refDate, cfg.weekStartDay); const we = getWeekEnd(ws);
    const spent = txns.filter(t => t.status==="paid" && new Date(t.date)>=ws && new Date(t.date)<we)
      .reduce((s,t) => s+t.amount, 0);
    weeks.push({ label: ws.toLocaleDateString("en-IN",{day:"numeric",month:"short"}), spent, limit: cfg.weeklyLimit });
  }
  return weeks;
}


// Contacts
function getContacts() {
  try { return JSON.parse(localStorage.getItem(STORE.CONTACTS) || "[]"); }
  catch { return []; }
}
function setContacts(c) { localStorage.setItem(STORE.CONTACTS, JSON.stringify(c)); }
function saveContact(name) {
  const contacts = getContacts();
  const existing = contacts.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const contact = { id: Date.now().toString(36), name: name.trim(), totalPaid: 0, payCount: 0,
    lastPaid: null, createdAt: new Date().toISOString() };
  contacts.unshift(contact); setContacts(contacts); return contact;
}
function updateContactStats(id, amount) {
  const contacts = getContacts(); const i = contacts.findIndex(c => c.id === id);
  if (i !== -1) { contacts[i].totalPaid += amount; contacts[i].payCount++; contacts[i].lastPaid = new Date().toISOString();
    setContacts(contacts); }
}
function getContactsByFrequency() {
  return [...getContacts()].sort((a,b) => b.payCount - a.payCount);
}
function searchContacts(query) {
  const q = query.toLowerCase();
  return getContacts().filter(c => c.name.toLowerCase().includes(q));
}

// Analytics
function getRecentTxns(n = 20) { return getTxns().slice(0, n); }

// Essentials analytics — monthly breakdown, not counted in weekly budget
function getEssentialStats(monthsBack = 3) {
  const txns = getTxns().filter(t => t.isEssential && t.status === "paid");
  const months = [];
  const now = new Date();
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const mt = txns.filter(t => { const d = new Date(t.date); return d >= start && d < end; });
    months.push({
      label: start.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
      spent: mt.reduce((s, t) => s + t.amount, 0),
      count: mt.length
    });
  }
  // by item name (contactName is used as item name for essentials)
  const byItem = {};
  txns.forEach(t => { byItem[t.contactName] = (byItem[t.contactName] || 0) + t.amount; });
  const items = Object.entries(byItem).map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount).slice(0, 10);
  return { months, items };
}

// Backup
function exportData() { return JSON.stringify({ config: getConfig(), txns: getTxns(), contacts: getContacts(), exportedAt: new Date().toISOString() }, null, 2); }
function importData(json) {
  const d = JSON.parse(json);
  if (d.config) setConfig({ ...DEFAULT_CONFIG, ...d.config });
  if (Array.isArray(d.txns)) setTxns(d.txns);
  if (Array.isArray(d.contacts)) setContacts(d.contacts);
}
function resetAllData() { Object.values(STORE).forEach(k => localStorage.removeItem(k)); }
