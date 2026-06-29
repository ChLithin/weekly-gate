// js/paymentApps.js

export function getPaymentLinks(upiLink) {

    const query = upiLink.replace("upi://pay?", "");

    return {
        bhim: "bhim://pay?" + query,

        gpay: "gpay://upi/pay?" + query,

        phonepe: "phonepe://pay?" + query,

        paytm: "paytm://pay?" + query,

        whatsapp: "whatsapp://pay?" + query,

        any: upiLink
    };
}

export function launchPayment(app, upiLink) {

    const links = getPaymentLinks(upiLink);

    const url = links[app] || links.any;

    window.location.href = url;
}
