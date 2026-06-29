// upi.js — reading a scanned UPI QR string, and building a upi://pay link to hand off to BHIM etc.
// This file deliberately does NOT and cannot choose UPI Lite vs regular UPI, or skip the PIN —
// that decision is made entirely inside whichever UPI app the user's phone opens. See README.

function isUpiString(raw) {
  return typeof raw === "string" && raw.trim().toLowerCase().startsWith("upi://pay");
}

// Parses a "upi://pay?pa=...&pn=...&am=...&tr=...&mc=...&cu=INR" string.
function parseUpiString(raw) {
  if (!isUpiString(raw)) return null;
  const queryString = raw.split("?")[1] || "";
  const params = new URLSearchParams(queryString);
  return {
    pa: params.get("pa") || "",
    pn: decodeMerchantName(params.get("pn") || ""),
    am: params.get("am") || "",
    tr: params.get("tr") || "",
    mc: params.get("mc") || "",
    cu: params.get("cu") || "INR",
  };
}

function decodeMerchantName(pn) {
  try {
    return decodeURIComponent(pn.replace(/\+/g, " ")).trim() || "Unknown merchant";
  } catch {
    return pn || "Unknown merchant";
  }
}

// Builds a fresh UPI deep link from the parsed fields + a possibly user-edited amount.
// upi.js — Fixed deep-linking format targeting BHIM safely

// js/upi.js

function buildUpiLink({ pa, pn, am, tr, cu }) {
  const params = new URLSearchParams();
  
  // 1. Mandatory Parameters (Must use standard 'upi' scheme so BHIM reads it perfectly)
  if (pa) params.set("pa", pa.trim());
  if (pn) params.set("pn", pn.trim());
  
  // 2. Format amount to strict decimal values (e.g. 10.00) to keep BHIM happy
  if (am && parseFloat(am) > 0) {
    params.set("am", parseFloat(am).toFixed(2));
  }
  
  params.set("cu", cu || "INR");
  if (tr) params.set("tr", tr.trim());

  // Return the official standard string format
  return "upi://pay?" + params.toString();
}

