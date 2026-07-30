function normalizeQrValue(value) {




    return value.trim().toUpperCase().replace(/\s+/g, "");




}




function getCameraErrorMessage(error) {




    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        return "Izin kamera belum aktif. Izinkan kamera di Chrome lalu coba lagi.";
    }




    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        return "Kamera tidak ditemukan di tablet ini.";
    }




    if (location.protocol !== "https:" && location.hostname !== "localhost") {
        return "Kamera hanya bisa dibuka lewat HTTPS atau localhost.";
    }




    return "Kamera belum bisa dibuka. Coba muat ulang halaman ini.";




}




function waitForScreenRender() {




    return new Promise(function(resolve) {
        window.requestAnimationFrame(function() {
            window.requestAnimationFrame(resolve);
        });
    });




}




function delay(milliseconds) {




    return new Promise(function(resolve) {
        window.setTimeout(resolve, milliseconds);
    });




}
