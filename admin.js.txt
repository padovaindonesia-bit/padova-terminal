let adminLogoTapCount = 0;
let adminLogoTapTimeoutId = null;
function setupAdminPinInput() {




    const pinInput = document.getElementById("adminPinInput");




    if (!pinInput) {
        return;
    }




    pinInput.addEventListener("keydown", function(event) {
        if (event.key === "Enter") {
            submitAdminPin();
        }




        if (event.key === "Escape") {
            closeAdminPinDialog();
        }
    });




}




function handleLogoTap() {




    adminLogoTapCount += 1;




    if (adminLogoTapTimeoutId) {
        window.clearTimeout(adminLogoTapTimeoutId);
    }




    adminLogoTapTimeoutId = window.setTimeout(function() {
        adminLogoTapCount = 0;
        adminLogoTapTimeoutId = null;
    }, 2500);




    if (adminLogoTapCount >= 5) {
        adminLogoTapCount = 0;
        openAdminPinDialog();
    }




}




function openAdminPinDialog() {




    const pinInput = document.getElementById("adminPinInput");




    document.getElementById("adminPinError").hidden = true;
    document.getElementById("adminPinModal").hidden = false;
    pinInput.value = "";
    pinInput.focus();




}




function closeAdminPinDialog() {




    const pinModal = document.getElementById("adminPinModal");




    if (pinModal) {
        pinModal.hidden = true;
    }




}




function submitAdminPin() {




    const pinInput = document.getElementById("adminPinInput");
    const pinError = document.getElementById("adminPinError");




    if (pinInput.value === ADMIN_PIN) {
        closeAdminPinDialog();
        showAdminDashboard();
        return;
    }




    pinError.hidden = false;
    pinInput.value = "";
    pinInput.focus();




}




function showAdminDashboard() {




    stopCamera();
    showPage("adminDashboard");




}




function showQrGenerator() {




    showPage("qrGenerator");
    showQrTypeMenu();




}




function showQrTypeMenu() {




    document.getElementById("qrTypeMenu").hidden = false;
    document.getElementById("qrFormPanel").hidden = true;
    document.getElementById("staffQrFields").hidden = true;
    document.getElementById("inventoryQrFields").hidden = true;
    resetQrGeneratorResult();




}




function showQrForm(qrType) {




    document.getElementById("qrTypeMenu").hidden = true;
    document.getElementById("qrFormPanel").hidden = false;
    document.getElementById("staffQrFields").hidden = qrType !== "staff";
    document.getElementById("inventoryQrFields").hidden = qrType !== "inventory";
    resetQrGeneratorResult();




}




