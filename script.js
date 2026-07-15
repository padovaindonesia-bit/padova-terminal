const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyr_lFf_Asv8TkYkCP8E8hRyh3WFYX6N-LxTG0X1d8S_Az_wx_6Qv0bVLBsj9AMSr4/exec";
const ADMIN_PIN = "1234";


const STAFF_MEMBERS = {
    "PDV-S001": {
        id: "PDV-S001",
        name: "OLE"
    },
    "PDV-S002": {
        id: "PDV-S002",
        name: "OTOI"
    },
    "PDV-S003": {
        id: "PDV-S003",
        name: "MARWAN"
    },
    "PDV-S004": {
        id: "PDV-S004",
        name: "BAKOS"
    },
    "PDV-S005": {
        id: "PDV-S005",
        name: "TETIM"
    },
    "PDV-S006": {
        id: "PDV-S006",
        name: "SANTUNG"
    }
};


const ATTENDANCE_STORAGE_KEY = "padovaAttendanceDrafts";
const QR_SCAN_DELAY_MS = 500;
const DUPLICATE_SCAN_DELAY_MS = 1500;
const MESSAGE_DISPLAY_DELAY_MS = 4500;
const COUNTDOWN_DELAY_MS = 1000;
const SUCCESS_RETURN_DELAY_MS = 4500;
const SHEETS_REQUEST_TIMEOUT_MS = 10000;
const SHEETS_WRITE_FALLBACK_TIMEOUT_MS = 5000;


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
let adminLogoTapCount = 0;
let adminLogoTapTimeoutId = null;
let generatedQrFileName = "";


setupAdminPinInput();


function showAttendance() {


    attendanceIsOpen = true;
    workflowInProgress = false;
    workflowRunId += 1;
    clearAutoReturnTimer();
    showPage("attendance");
    resetAttendanceScreen();
    startCamera(true);


}


function goHome() {


    attendanceIsOpen = false;
    workflowInProgress = false;
    workflowRunId += 1;
    clearAutoReturnTimer();
    closeAdminPinDialog();
    stopCamera();
    showPage("home");


}


function showPage(pageId) {


    document.querySelectorAll(".page").forEach(function(page) {
        page.classList.remove("active");
    });


    document.getElementById(pageId).classList.add("active");


}


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


function generateStaffQr() {


    const staffId = normalizeQrValue(document.getElementById("staffQrId").value);
    const staffName = document.getElementById("staffQrName").value.trim();


    if (!staffName || !staffId) {
        updateQrGeneratorStatus("Isi nama dan Staff ID terlebih dahulu.", true);
        return;
    }


    generateQrCode(staffId, staffId + ".png");


}


function generateInventoryQr() {


    const sku = normalizeQrValue(document.getElementById("inventoryQrSku").value);
    const itemName = document.getElementById("inventoryQrName").value.trim();


    if (!itemName || !sku) {
        updateQrGeneratorStatus("Isi nama barang dan SKU terlebih dahulu.", true);
        return;
    }


    generateQrCode(sku, sku + ".png");


}


function generateQrCode(qrContent, fileName) {


    const qrPreviewCanvas = document.getElementById("qrPreviewCanvas");


    if (!window.QRCode || !window.QRCode.toCanvas) {
        updateQrGeneratorStatus("Generator QR belum siap. Coba muat ulang halaman.", true);
        return;
    }


    window.QRCode.toCanvas(qrPreviewCanvas, qrContent, {
        errorCorrectionLevel: "H",
        margin: 4,
        width: 1024,
        color: {
            dark: "#000000",
            light: "#FFFFFF"
        }
    }, function(error) {
        if (error) {
            updateQrGeneratorStatus("QR belum bisa dibuat. Coba lagi.", true);
            return;
        }


        generatedQrFileName = sanitizeFileName(fileName);
        document.getElementById("qrPreviewLabel").textContent = qrContent;
        document.getElementById("qrPreviewPanel").hidden = false;
        updateQrGeneratorStatus("QR berhasil dibuat.");
    });


}


function downloadGeneratedQr() {


    const qrPreviewCanvas = document.getElementById("qrPreviewCanvas");


    if (!generatedQrFileName) {
        updateQrGeneratorStatus("Generate QR terlebih dahulu.", true);
        return;
    }


    const downloadLink = document.createElement("a");
    downloadLink.href = qrPreviewCanvas.toDataURL("image/png");
    downloadLink.download = generatedQrFileName;
    downloadLink.click();


}


function resetQrGeneratorResult() {


    generatedQrFileName = "";
    document.getElementById("qrGeneratorStatus").textContent = "";
    document.getElementById("qrGeneratorStatus").classList.remove("error");
    document.getElementById("qrPreviewPanel").hidden = true;
    document.getElementById("qrPreviewLabel").textContent = "";


}


function updateQrGeneratorStatus(message, isError) {


    const qrGeneratorStatus = document.getElementById("qrGeneratorStatus");


    qrGeneratorStatus.textContent = message;
    qrGeneratorStatus.classList.toggle("error", Boolean(isError));


}


function normalizeQrValue(value) {


    return value.trim().toUpperCase().replace(/\s+/g, "");


}


function sanitizeFileName(fileName) {


    return fileName.replace(/[^a-z0-9._-]/gi, "_");


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


async function handleQrCode(qrValue) {


    const localStaff = STAFF_MEMBERS[qrValue];


    if (!localStaff) {
        updateCameraStatus("QR tidak valid. Gunakan kartu karyawan PADOVA.", true);
        scheduleQrScan();
        return;
    }


    workflowInProgress = true;
    qrScanPaused = true;
    stopQrScanner();
    updateCameraStatus("Memeriksa data absensi...");


    try {
        const attendanceDecision = await getAttendanceDecision(localStaff);


        if (!isCurrentWorkflow(workflowRunId)) {
            return;
        }


        if (attendanceDecision.status === "complete") {
            stopCamera();
            showAttendanceComplete(attendanceDecision.staff);
            scheduleReturnHome();
            return;
        }


        runSelfieWorkflow(attendanceDecision.staff, attendanceDecision.status);
    } catch (error) {
        workflowInProgress = false;
        updateCameraStatus("Data absensi belum bisa dicek. Coba scan ulang.", true);
        startQrScanner();
    }


}


async function runSelfieWorkflow(staff, attendanceStatus) {


    const currentRunId = workflowRunId;


    showTransitionMessage(staff);
    await waitForScreenRender();
    await delay(MESSAGE_DISPLAY_DELAY_MS);


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
        const saveResult = await saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl);


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


async function getAttendanceDecision(localStaff) {


    if (!isGoogleSheetsConfigured()) {
        return {
            staff: localStaff,
            status: getLocalAttendanceStatus(localStaff.id)
        };
    }


    let response;


    try {
        response = await callGoogleSheets({
            action: "status",
            staffId: localStaff.id
        });
    } catch (error) {
        return {
            staff: localStaff,
            status: getLocalAttendanceStatus(localStaff.id)
        };
    }


    if (!response.ok) {
        throw new Error(response.message || "Attendance status failed.");
    }


    return {
        staff: {
            id: response.staff.id,
            name: response.staff.name
        },
        status: response.nextStatus
    };


}


function getLocalAttendanceStatus(employeeId) {


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


async function saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl) {


    if (!selfieDataUrl) {
        return { saved: false };
    }


    if (isGoogleSheetsConfigured()) {
        const recordParams = {
            action: "record",
            staffId: staff.id,
            status: attendanceStatus,
            buktiAbsen: "Y",
            device: getDeviceLabel()
        };


        let response;


        try {
            response = await callGoogleSheets(recordParams);
        } catch (error) {
            response = await sendGoogleSheetsWriteFallback(recordParams);
        }


        if (!response.ok) {
            return { saved: false };
        }
    }


    return saveLocalAttendanceRecord(staff, attendanceStatus);


}


function saveLocalAttendanceRecord(staff, attendanceStatus) {


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


function sendGoogleSheetsWriteFallback(params) {


    return new Promise(function(resolve) {
        let isDone = false;
        const requestUrl = buildGoogleSheetsUrl(params);
        const timeoutId = window.setTimeout(function() {
            finish({ ok: false });
        }, SHEETS_WRITE_FALLBACK_TIMEOUT_MS);


        function finish(response) {
            if (isDone) {
                return;
            }


            isDone = true;
            window.clearTimeout(timeoutId);
            resolve(response);
        }


        if (window.fetch) {
            fetch(requestUrl, {
                method: "GET",
                mode: "no-cors",
                cache: "no-store"
            }).then(function() {
                finish({ ok: true });
            }).catch(function() {
                sendGoogleSheetsImageFallback(requestUrl, finish);
            });
            return;
        }


        sendGoogleSheetsImageFallback(requestUrl, finish);
    });


}


function sendGoogleSheetsImageFallback(requestUrl, finish) {


    const image = new Image();


    image.onload = function() {
        finish({ ok: true });
    };


    image.onerror = function() {
        finish({ ok: true });
    };


    image.src = requestUrl;


}


function callGoogleSheets(params) {


    return new Promise(function(resolve, reject) {
        const callbackName = "padovaSheetsCallback" + Date.now() + Math.floor(Math.random() * 10000);
        const script = document.createElement("script");
        const timeoutId = window.setTimeout(function() {
            cleanup();
            reject(new Error("Google Sheets request timed out."));
        }, SHEETS_REQUEST_TIMEOUT_MS);


        function cleanup() {
            window.clearTimeout(timeoutId);
            delete window[callbackName];


            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }


        window[callbackName] = function(response) {
            cleanup();
            resolve(response);
        };


        script.src = buildGoogleSheetsUrl(params, callbackName);
        script.onerror = function() {
            cleanup();
            reject(new Error("Google Sheets request failed."));
        };
        document.body.appendChild(script);
    });


}


function buildGoogleSheetsUrl(params, callbackName) {


    const searchParams = new URLSearchParams(params);


    if (callbackName) {
        searchParams.set("callback", callbackName);
    }


    searchParams.set("requestTime", String(Date.now()));


    return GOOGLE_APPS_SCRIPT_URL + "?" + searchParams.toString();


}


function isGoogleSheetsConfigured() {


    return GOOGLE_APPS_SCRIPT_URL.indexOf("https://script.google.com/") === 0;


}


function getDeviceLabel() {


    return "PADOVA Terminal";


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
