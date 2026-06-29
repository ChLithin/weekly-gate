function getPaymentLinks(upiLink) {

    const query = upiLink.replace("upi://pay?", "");

    return {

        bhim: "bhim://pay?" + query,

        phonepe: "phonepe://pay?" + query,

        any: upiLink

    };

}
