// js/paymentApps.js

function getPaymentLinks(upiLink) {

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
