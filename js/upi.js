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

function buildUpiLink({ pa, pn, am, tr, cu }) {
  const params = new URLSearchParams();
  
  // 1. CRITICAL: Only append parameters if they actually contain data. 
  // BHIM errors out if it encounters empty fields like &tr=&mc=
  if (pa && pa.trim() !== "") {
    params.set("pa", pa.trim());
  }
  
  if (pn && pn.trim() !== "") {
    // BHIM requires clean spaces rather than technical encoded sets like '+'
    params.set("pn", pn.trim()); 
  }
  
  if (am && am !== "" && parseFloat(am) > 0) {
    // Force format values strictly to 2 decimal places (e.g. 10.00 instead of 10)
    params.set("am", parseFloat(am).toFixed(2));
  }
  
  // Default fallback asset string parameters mapping
  params.set("cu", cu || "INR");

  // Only include transactional reference tracking keys if they are valid merchant nodes
  if (tr && tr.trim() !== "") {
    params.set("tr", tr.trim());
  }

  // Enforce the direct BHIM target router path clean string
  return "bhim://pay?" + params.toString();
}

