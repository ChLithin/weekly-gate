// js/paymentApps.js

function getPaymentLinks(upiLink) {

    const query = upiLink.replace("upi://pay?", "");

    return {
        bhim: "bhim://pay?" + query,
        phonepe: "phonepe://pay?" + query,
        any: upiLink
    };
}

function launchPayment(app, upiLink){

    const links = getPaymentLinks(upiLink);

    switch(app){

        case "bhim":
            window.location.href = links.bhim;
            break;

        case "phonepe":
            window.location.href = links.phonepe;
            break;

        default:
            window.location.href = links.any;
    }

}
