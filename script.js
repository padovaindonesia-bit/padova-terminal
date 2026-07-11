const STAFF_MEMBERS = {
    "PDV-S001": {
        id: "PDV-S001",
        name: "PDV-S001"
    }
};


const ATTENDANCE_STORAGE_KEY = "padovaAttendanceDrafts";
const QR_SCAN_DELAY_MS = 500;
const DUPLICATE_SCAN_DELAY_MS = 1500;
const TRANSITION_DELAY_MS = 1000;
const COUNTDOWN_DELAY_MS = 1000;
const SUCCESS_RETURN_DELAY_MS = 3000;


let cameraStream = null;
let attendanceIsOpen = false;
let qrDetector = null;
let qrScanTimeoutId = null;
let qrScanPaused = false;
let workflowInProgress = false;
let workflowRunId = 0;
let autoReturnTimeoutId = null;
let lastQrValue = "";
let lastQrReadAt = 0;


function showAttendance() {


    attendanceIsOpen = true;
    workflowInProgress = false;
    workflowRunId += 1;
    clearAutoReturnTimer();
    document.getElementById("home").classList.remove("active");
    document.getElementById("attendance").classList.add("active");
    resetAttendanceScreen();
    startCamera(true);


}


function goHome() {


    attendanceIsOpen = false;
    workflowInProgress = false;
    workflowRunId += 1;
    clearAutoReturnTimer();
    stopCamera();
    document.getElementById("attendance").classList.remove("active");
    document.getElementById("home").classList.add("active");


}


async function startCamera(shouldStartScanner) {


    const cameraPreview = document.getElementById("cameraPreview");
    const cameraFallback = document.getElementById("cameraFallback");


    if (!window.isSecureContext && location.hostname !== "localhost") {
        updateCameraStatus("Kamera hanya bisa dibuka lewat HTTPS atau localhost.", true);
        return false;
    }


    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateCameraStatus("Browser ini belum bisa membuka kamera.", true);
        return false;
    }


    if (cameraStream) {
        cameraPreview.srcObject = cameraStream;
        cameraPreview.classList.add("active");
        cameraFallback.classList.add("hidden");


        if (shouldStartScanner) {
            updateCameraStatus("Kamera siap. Arahkan QR kartu karyawan kamu ke kamera.");
            startQrScanner();
        }


        return true;
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
            return false;
        }


        cameraPreview.srcObject = cameraStream;
        await cameraPreview.play();
        cameraPreview.classList.add("active");
        cameraFallback.classList.add("hidden");


        if (shouldStartScanner) {
            updateCameraStatus("Kamera siap. Arahkan QR kartu karyawan kamu ke kamera.");
            startQrScanner();
        }


        return true;
    } catch (error) {
        stopCameraTracks();
        cameraPreview.srcObject = null;
        cameraPreview.classList.remove("active");
        cameraFallback.classList.remove("hidden");
        updateCameraStatus(getCameraErrorMessage(error), true);
        return false;
    }


}


function stopCamera() {


    const cameraPreview = document.getElementById("cameraPreview");
    const cameraFallback = document.getElementById("cameraFallback");


    stopQrScanner();
    stopCameraTracks();
    cameraPreview.srcObject = null;
    cameraPreview.classList.remove("active");
    cameraFallback.classList.remove("hidden");
    updateCameraStatus("Kamera belum aktif.");


}


function stopCameraTracks() {


    if (cameraStream) {
        cameraStream.getTracks().forEach(function(track) {
            track.stop();
        });
        cameraStream = null;
    }


}


function startQrScanner() {


    if (workflowInProgress) {
        return;
    }


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


    if (!attendanceIsOpen || !cameraStream || qrScanPaused || workflowInProgress) {
        return;
    }


    clearQrScanTimer();
    qrScanTimeoutId = window.setTimeout(scanQrCode, QR_SCAN_DELAY_MS);


}


async function scanQrCode() {


    const cameraPreview = document.getElementById("cameraPreview");


    if (!attendanceIsOpen || !cameraStream || qrScanPaused || workflowInProgress) {
        return;
    }


    if (cameraPreview.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        scheduleQrScan();
        return;
    }


    try {
        const barcodes = await qrDetector.detect(cameraPreview);


        if (barcodes.length > 0) {
            const qrValue = barcodes[0].rawValue.trim();


            if (!isRapidDuplicateQr(qrValue)) {
                handleQrCode(qrValue);
                return;
            }
        }
    } catch (error) {
        updateCameraStatus("Scanner QR sedang mencoba membaca kartu kamu...");
    }


    scheduleQrScan();


}


function handleQrCode(qrValue) {


    const staff = STAFF_MEMBERS[qrValue];


    if (!staff) {
        updateCameraStatus("QR tidak valid. Gunakan kartu karyawan PADOVA.", true);
        scheduleQrScan();
        return;
    }


    workflowInProgress = true;
    qrScanPaused = true;
    stopQrScanner();


    const attendanceStatus = getAttendanceStatus(staff.id);


    if (attendanceStatus === "complete") {
        stopCamera();
        showAttendanceComplete(staff);
        scheduleReturnHome();
        return;
    }


    runSelfieWorkflow(staff, attendanceStatus);


}


async function runSelfieWorkflow(staff, attendanceStatus) {


    const currentRunId = workflowRunId;


    showTransitionMessage(staff);
    await delay(TRANSITION_DELAY_MS);


    if (!isCurrentWorkflow(currentRunId)) {
        return;
    }


    showSelfieScreen();


    const cameraReady = await startCamera(false);


    if (!cameraReady) {
        handleSelfieFailure("Kamera selfie belum bisa dibuka. Coba scan ulang.");
        return;
    }


    try {
        await runCountdown(currentRunId);


        if (!isCurrentWorkflow(currentRunId)) {
            return;
        }


        const selfieDataUrl = captureSelfie();
        const saveResult = saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl);


        if (!saveResult.saved) {
            handleSelfieFailure("Absensi belum bisa disimpan. Coba scan ulang.");
            return;
        }


        showAttendanceSuccess(staff, attendanceStatus);
        scheduleReturnHome();
    } catch (error) {
        handleSelfieFailure("Foto belum berhasil diambil. Coba scan ulang.");
    }


}


async function runCountdown(currentRunId) {


    const countdownOverlay = document.getElementById("countdownOverlay");


    countdownOverlay.hidden = false;


    for (let count = 3; count >= 1; count -= 1) {
        if (!isCurrentWorkflow(currentRunId)) {
            countdownOverlay.hidden = true;
            return;
        }


        countdownOverlay.textContent = count + "...";
        updateCameraStatus("Tetap diam. Foto otomatis segera diambil.");
        await delay(COUNTDOWN_DELAY_MS);
    }


    countdownOverlay.hidden = true;


}


function captureSelfie() {


    const cameraPreview = document.getElementById("cameraPreview");
    const selfieCanvas = document.getElementById("selfieCanvas");


    if (!cameraStream || !cameraPreview.videoWidth || !cameraPreview.videoHeight) {
        throw new Error("Selfie camera is not ready.");
    }


    const maxWidth = 640;
    const scale = Math.min(1, maxWidth / cameraPreview.videoWidth);
    selfieCanvas.width = Math.round(cameraPreview.videoWidth * scale);
    selfieCanvas.height = Math.round(cameraPreview.videoHeight * scale);


    const canvasContext = selfieCanvas.getContext("2d");
    canvasContext.drawImage(cameraPreview, 0, 0, selfieCanvas.width, selfieCanvas.height);


    const selfieDataUrl = selfieCanvas.toDataURL("image/jpeg", 0.8);


    if (!selfieDataUrl || selfieDataUrl === "data:,") {
        throw new Error("Selfie capture failed.");
    }


    return selfieDataUrl;


}


function handleSelfieFailure(message) {


    if (!attendanceIsOpen) {
        return;
    }


    workflowInProgress = false;
    workflowRunId += 1;
    resetQrResult();
    showScanningScreen();
    updateCameraStatus(message, true);
    startCamera(true);


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


function isRapidDuplicateQr(qrValue) {


    const now = Date.now();


    if (qrValue === lastQrValue && now - lastQrReadAt < DUPLICATE_SCAN_DELAY_MS) {
        return true;
    }


    lastQrValue = qrValue;
    lastQrReadAt = now;
    return false;


}


function resetAttendanceScreen() {


    resetQrResult();
    hideWorkflowPanel();
    document.getElementById("countdownOverlay").hidden = true;
    showScanningScreen();
    updateCameraStatus("Kamera belum aktif.");


}


function showScanningScreen() {


    document.getElementById("attendanceInstruction").hidden = false;
    document.getElementById("attendanceHint").hidden = false;
    document.getElementById("cameraBox").hidden = false;
    document.getElementById("cameraStatus").hidden = false;
    hideWorkflowPanel();


}


function showTransitionMessage(staff) {


    hideScanningScreen();
    showWorkflowPanel(
        staff.name,
        "QR berhasil di-scan.",
        "Mohon lihat ke kamera.\n\nTetap diam sebentar.\nFoto akan diambil secara otomatis."
    );


}


function showSelfieScreen() {


    document.getElementById("attendanceInstruction").hidden = true;
    document.getElementById("attendanceHint").hidden = true;
    document.getElementById("cameraBox").hidden = false;
    document.getElementById("cameraStatus").hidden = false;
    document.getElementById("qrResult").hidden = true;
    hideWorkflowPanel();
    updateCameraStatus("Mohon lihat ke kamera.");


}


function hideScanningScreen() {


    document.getElementById("attendanceInstruction").hidden = true;
    document.getElementById("attendanceHint").hidden = true;
    document.getElementById("cameraBox").hidden = true;
    document.getElementById("cameraStatus").hidden = true;
    document.getElementById("qrResult").hidden = true;
    document.getElementById("countdownOverlay").hidden = true;


}


function showWorkflowPanel(name, title, text) {


    document.getElementById("workflowName").textContent = name;
    document.getElementById("workflowTitle").textContent = title;
    document.getElementById("workflowText").textContent = text;
    document.getElementById("workflowPanel").hidden = false;


}


function hideWorkflowPanel() {


    document.getElementById("workflowPanel").hidden = true;


}


function resetQrResult() {


    qrScanPaused = false;
    document.getElementById("qrEmployeeId").textContent = "-";
    document.getElementById("attendanceAction").textContent = "-";
    document.getElementById("attendanceNote").textContent = "-";
    document.getElementById("qrResult").hidden = true;


}


function showAttendanceSuccess(staff, attendanceStatus) {


    stopCamera();
    hideScanningScreen();


    if (attendanceStatus === "check-in") {
        showWorkflowPanel(
            "",
            "✅ Check-in berhasil",
            "Selamat bekerja, " + staff.name + "!"
        );
        return;
    }


    showWorkflowPanel(
        "",
        "✅ Check-out berhasil",
        "Terima kasih untuk hari ini.\n\nSampai jumpa besok, " + staff.name + "!"
    );


}


function showAttendanceComplete(staff) {


    hideScanningScreen();
    showWorkflowPanel(
        "",
        "✅ Absensi hari ini sudah lengkap.",
        "Kamu sudah melakukan check-in dan check-out hari ini.\n\nSampai jumpa besok, " + staff.name + "!"
    );


}


function scheduleReturnHome() {


    clearAutoReturnTimer();
    autoReturnTimeoutId = window.setTimeout(function() {
        if (attendanceIsOpen) {
            goHome();
        }
    }, SUCCESS_RETURN_DELAY_MS);


}


function clearAutoReturnTimer() {


    if (autoReturnTimeoutId) {
        window.clearTimeout(autoReturnTimeoutId);
        autoReturnTimeoutId = null;
    }


}


function getAttendanceStatus(employeeId) {


    const todayKey = getTodayKey();
    const attendanceDrafts = getAttendanceDrafts();
    const employeeRecord = attendanceDrafts[todayKey] && attendanceDrafts[todayKey][employeeId];


    if (!employeeRecord || !employeeRecord.checkInAt) {
        return "check-in";
    }


    if (!employeeRecord.checkOutAt) {
        return "check-out";
    }


    return "complete";


}


function saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl) {


    if (!selfieDataUrl) {
        return { saved: false };
    }


    const todayKey = getTodayKey();
    const attendanceDrafts = getAttendanceDrafts();


    if (!attendanceDrafts[todayKey]) {
        attendanceDrafts[todayKey] = {};
    }


    const employeeRecord = attendanceDrafts[todayKey][staff.id] || {};
    const now = new Date().toISOString();


    if (attendanceStatus === "check-in") {
        if (employeeRecord.checkInAt) {
            return { saved: false };
        }


        employeeRecord.staffName = staff.name;
        employeeRecord.checkInAt = now;
        employeeRecord.checkInSelfieCapturedAt = now;
    }


    if (attendanceStatus === "check-out") {
        if (!employeeRecord.checkInAt || employeeRecord.checkOutAt) {
            return { saved: false };
        }


        employeeRecord.staffName = staff.name;
        employeeRecord.checkOutAt = now;
        employeeRecord.checkOutSelfieCapturedAt = now;
    }


    attendanceDrafts[todayKey][staff.id] = employeeRecord;


    return saveAttendanceDrafts(attendanceDrafts);


}


function getTodayKey() {


    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");


    return year + "-" + month + "-" + day;


}


function getAttendanceDrafts() {


    try {
        return JSON.parse(localStorage.getItem(ATTENDANCE_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }


}


function saveAttendanceDrafts(attendanceDrafts) {


    try {
        localStorage.setItem(ATTENDANCE_STORAGE_KEY, JSON.stringify(attendanceDrafts));
        return { saved: true };
    } catch (error) {
        return { saved: false };
    }


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


function isCurrentWorkflow(currentRunId) {


    return attendanceIsOpen && workflowInProgress && workflowRunId === currentRunId;


}


function delay(milliseconds) {


    return new Promise(function(resolve) {
        window.setTimeout(resolve, milliseconds);
    });


}
