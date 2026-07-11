// upi.js — UPI link building only (no deep-link magic, just correct URL construction)

function isUpiString(raw) {
  return typeof raw === "string" && raw.trim().toLowerCase().startsWith("upi://pay");
}

function parseUpiString(raw) {
  if (!isUpiString(raw)) return null;
  const rawParams = new URLSearchParams(raw.split("?")[1] || "");
  return {
    pa: rawParams.get("pa") || "", pn: decodeMerchantName(rawParams.get("pn") || ""),
    am: rawParams.get("am") || "", tr: rawParams.get("tr") || "",
    mc: rawParams.get("mc") || "", cu: rawParams.get("cu") || "INR", rawParams,
  };
}
function decodeMerchantName(pn) {
  try { return decodeURIComponent(pn.replace(/\+/g," ")).trim() || "Unknown"; } catch { return pn || "Unknown"; }
}

const APP_SCHEMES = { default:"upi://pay?", phonepe:"phonepe://pay?", gpay:"gpay://pay?", paytm:"paytm://pay?" };

function generateTr() { return "WG" + Date.now().toString(36).toUpperCase(); }

// If QR has a `sign` param, the signature covers the full URL — do NOT modify
// any params or the signature check fails silently in PhonePe. Just swap prefix.
function buildAppLink(appKey, rawParams, amount) {
  const prefix = APP_SCHEMES[appKey] || APP_SCHEMES.default;
  if (rawParams && rawParams.has("sign")) return prefix + rawParams.toString();
  const params = new URLSearchParams(rawParams ? rawParams.toString() : "");
  if (amount && Number(amount) > 0) params.set("am", String(amount));
  if (!params.has("cu")) params.set("cu", "INR");
  if (!params.get("tr")) params.set("tr", generateTr());
  return prefix + params.toString();
}
