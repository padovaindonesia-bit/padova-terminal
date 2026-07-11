const EXPECTED_EMPLOYEE_ID = "PDV-S001";


let cameraStream = null;
let attendanceIsOpen = false;
let qrDetector = null;
let qrScanTimeoutId = null;
let qrScanPaused = false;


function showAttendance() {


    attendanceIsOpen = true;
    document.getElementById("home").classList.remove("active");
    document.getElementById("attendance").classList.add("active");
    resetQrResult();
    startCamera();


}


function goHome() {


    attendanceIsOpen = false;
    stopCamera();
    document.getElementById("attendance").classList.remove("active");
    document.getElementById("home").classList.add("active");


}


async function startCamera() {


    const cameraPreview = document.getElementById("cameraPreview");
    const cameraFallback = document.getElementById("cameraFallback");


    if (!window.isSecureContext && location.hostname !== "localhost") {
        updateCameraStatus("Kamera hanya bisa dibuka lewat HTTPS atau localhost.", true);
        return;
    }


    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateCameraStatus("Browser ini belum bisa membuka kamera.", true);
        return;
    }


    if (cameraStream) {
        return;
    }


    updateCameraStatus("Menyiapkan kamera...");


    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });


        if (!attendanceIsOpen) {
            stopCamera();
            return;
        }


        cameraPreview.srcObject = cameraStream;
        await cameraPreview.play();
        cameraPreview.classList.add("active");
        cameraFallback.classList.add("hidden");
        updateCameraStatus("Kamera siap. Arahkan QR kartu karyawan kamu ke kamera.");
        startQrScanner();
    } catch (error) {
        if (cameraStream) {
            cameraStream.getTracks().forEach(function(track) {
                track.stop();
            });
        }


        cameraStream = null;
        cameraPreview.srcObject = null;
        cameraPreview.classList.remove("active");
        cameraFallback.classList.remove("hidden");
        updateCameraStatus(getCameraErrorMessage(error), true);
    }


}


function stopCamera() {


    const cameraPreview = document.getElementById("cameraPreview");
    const cameraFallback = document.getElementById("cameraFallback");


    stopQrScanner();


    if (cameraStream) {
        cameraStream.getTracks().forEach(function(track) {
            track.stop();
        });
        cameraStream = null;
    }


    cameraPreview.srcObject = null;
    cameraPreview.classList.remove("active");
    cameraFallback.classList.remove("hidden");
    updateCameraStatus("Kamera belum aktif.");


}


function startQrScanner() {


    if (!("BarcodeDetector" in window)) {
        updateCameraStatus("Kamera siap, tapi scanner QR belum tersedia. Coba update Chrome di tablet ini.", true);
        return;
    }


    try {
        if (!qrDetector) {
            qrDetector = new BarcodeDetector({ formats: ["qr_code"] });
        }
    } catch (error) {
        updateCameraStatus("Scanner QR belum bisa disiapkan di browser ini.", true);
        return;
    }


    qrScanPaused = false;
    scheduleQrScan();


}


function scheduleQrScan() {


    if (!attendanceIsOpen || !cameraStream || qrScanPaused) {
        return;
    }


    clearQrScanTimer();
    qrScanTimeoutId = window.setTimeout(scanQrCode, 500);


}


async function scanQrCode() {


    const cameraPreview = document.getElementById("cameraPreview");


    if (!attendanceIsOpen || !cameraStream || qrScanPaused) {
        return;
    }


    if (cameraPreview.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        scheduleQrScan();
        return;
    }


    try {
        const barcodes = await qrDetector.detect(cameraPreview);


        if (barcodes.length > 0) {
            handleQrCode(barcodes[0].rawValue.trim());
            return;
        }
    } catch (error) {
        updateCameraStatus("Scanner QR sedang mencoba membaca kartu kamu...");
    }


    scheduleQrScan();


}


function handleQrCode(qrValue) {


    if (qrValue === EXPECTED_EMPLOYEE_ID) {
        qrScanPaused = true;
        clearQrScanTimer();
        document.getElementById("qrEmployeeId").textContent = qrValue;
        document.getElementById("qrResult").hidden = false;
        updateCameraStatus("QR berhasil terbaca. ID karyawan cocok.");
        return;
    }


    updateCameraStatus("QR belum cocok. Untuk tes ini gunakan kartu PDV-S001.", true);
    scheduleQrScan();


}


function stopQrScanner() {


    qrScanPaused = true;
    clearQrScanTimer();


}


function clearQrScanTimer() {


    if (qrScanTimeoutId) {
        window.clearTimeout(qrScanTimeoutId);
        qrScanTimeoutId = null;
    }


}


function resetQrResult() {


    qrScanPaused = false;
    document.getElementById("qrEmployeeId").textContent = "-";
    document.getElementById("qrResult").hidden = true;


}


function updateCameraStatus(message, isError) {


    const cameraStatus = document.getElementById("cameraStatus");


    cameraStatus.textContent = message;
    cameraStatus.classList.toggle("error", Boolean(isError));


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
