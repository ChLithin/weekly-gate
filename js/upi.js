// upi.js — reading a scanned UPI QR string, and building app-specific deep
// links to hand off to a UPI app. This file deliberately does NOT and cannot
// choose UPI Lite vs regular UPI, or skip the PIN — that decision is made
// entirely inside whichever UPI app the link opens. See README.
//
// BHIM does not get its own button here: bhim://pay and bhim://upi/pay were
// both tried against a real BHIM install and returned two different
// undocumented errors ("invalid beneficiary ID", then "request type not
// supported"). That's consistent with BHIM's custom scheme not actually
// supporting third-party-initiated payments to an arbitrary VPA, rather than
// a fixable encoding issue — so we don't keep guessing at it.

function isUpiString(raw) {
  return typeof raw === "string" && raw.trim().toLowerCase().startsWith("upi://pay");
}

// Parses a "upi://pay?pa=...&pn=...&am=...&tr=...&mc=...&cu=INR" string.
// Keeps the original URLSearchParams (rawParams) too, so links we rebuild
// reuse the exact same encoding the QR code itself used, instead of risking
// a re-encode that some app's deep-link parser might mishandle.
function parseUpiString(raw) {
  if (!isUpiString(raw)) return null;

  const queryString = raw.split("?")[1] || "";
  const rawParams = new URLSearchParams(queryString);

  return {
    pa: rawParams.get("pa") || "",
    pn: decodeMerchantName(rawParams.get("pn") || ""),
    am: rawParams.get("am") || "",
    tr: rawParams.get("tr") || "",
    mc: rawParams.get("mc") || "",
    cu: rawParams.get("cu") || "INR",
    rawParams,
  };
}

function decodeMerchantName(pn) {
  try {
    return decodeURIComponent(pn.replace(/\+/g, " ")).trim() || "Unknown merchant";
  } catch {
    return pn || "Unknown merchant";
  }
}

// Apps that register their own scheme (separate from the shared upi:// one)
// and accept the same NPCI parameter set under it.
//
// phonepe: confirmed working on a real device with this exact format
// (phonepe://pay?...) — an earlier "phonepe://upi/pay?" guess, sourced from a
// payment gateway's docs, did NOT work in practice.
// gpay / paytm: NOT yet confirmed on a real device. Given the phonepe doc
// mismatch above, treat these as best guesses until tested — if either
// fails to open the right app, that's the first thing to suspect.
const APP_SCHEME_PREFIX = {
  default: "upi://pay?",
  phonepe: "phonepe://pay?",
  gpay: "gpay://pay?",
  paytm: "paytm://pay?",
};

// Rebuilds the link from the QR's original params (preserving their exact
// encoding), only overriding the amount if the person typed one in, and
// making sure `cu` is present. Then swaps in the target app's own scheme.
function buildAppLink(appKey, rawParams, amount) {
  const params = new URLSearchParams(rawParams.toString());
  if (amount && Number(amount) > 0) {
    params.set("am", String(amount));
  }
  if (!params.has("cu")) params.set("cu", "INR");

  const prefix = APP_SCHEME_PREFIX[appKey] || APP_SCHEME_PREFIX.default;
  return prefix + params.toString();
}
