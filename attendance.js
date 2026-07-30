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
let pendingEarlyCheckoutStaff = null;

function showAttendance() {




    attendanceIsOpen = true;
    workflowInProgress = false;
    workflowRunId += 1;
    pendingEarlyCheckoutStaff = null;
    clearAutoReturnTimer();
    showPage("attendance");
    resetAttendanceScreen();
    startCamera(true);




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




        if (attendanceDecision.action === "already_checked_in" || attendanceDecision.action === "check_in_recorded") {
            stopCamera();
            showAttendanceCheckInRecorded(attendanceDecision);
            scheduleReturnHome();
            return;
        }




        if (attendanceDecision.action === "confirm_early_checkout") {
            showEarlyCheckoutConfirmation(attendanceDecision.staff);
            return;
        }




        if (attendanceDecision.action === "attendance_complete") {
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




async function runSelfieWorkflow(staff, attendanceStatus, saveOptions) {




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
        const saveResult = await saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl, saveOptions);




        if (!saveResult.saved) {
            const verifiedSave = await verifyAttendanceSaveResult(staff, attendanceStatus);




            if (verifiedSave.saved) {
                showAttendanceSuccess(verifiedSave.staff, attendanceStatus);
                scheduleReturnHome();
                return;
            }




            if (verifiedSave.uncertain) {
                showAttendanceSaveUncertain(staff);
                return;
            }




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




async function verifyAttendanceSaveResult(staff, attendanceStatus) {




    if (!isGoogleSheetsConfigured("attendance")) {
        return {
            saved: false,
            uncertain: false,
            staff: staff
        };
    }




    try {
        const response = await callGoogleSheets("attendance", {
            action: "status",
            staffId: staff.id
        });




        if (!response.ok) {
            return {
                saved: false,
                uncertain: true,
                staff: staff
            };
        }




        const verifiedStaff = {
            id: response.staff.id,
            name: response.staff.name
        };




        return {
            saved: hasAttendanceStatusAdvanced(attendanceStatus, response.nextStatus, response.action),
            uncertain: false,
            staff: verifiedStaff
        };
    } catch (error) {
        return {
            saved: false,
            uncertain: true,
            staff: staff
        };
    }




}




function hasAttendanceStatusAdvanced(attendanceStatus, nextStatus, action) {




    if (attendanceStatus === "check-in") {
        return action === "already_checked_in" || action === "check_in_recorded" || action === "attendance_complete" || action === "complete" || nextStatus === "check-out" || nextStatus === "complete";
    }




    if (attendanceStatus === "check-out") {
        return action === "attendance_complete" || action === "complete" || nextStatus === "complete";
    }




    return false;




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




    hideAttendanceConfirmActions();
    document.getElementById("workflowName").textContent = name;
    document.getElementById("workflowTitle").textContent = title;
    document.getElementById("workflowText").textContent = text;
    document.getElementById("workflowPanel").hidden = false;




}




function hideWorkflowPanel() {




    hideAttendanceConfirmActions();
    document.getElementById("workflowPanel").hidden = true;




}




function hideAttendanceConfirmActions() {




    const attendanceConfirmActions = document.getElementById("attendanceConfirmActions");




    if (attendanceConfirmActions) {
        attendanceConfirmActions.hidden = true;
    }




}




function getAttendanceConfirmActions() {




    let attendanceConfirmActions = document.getElementById("attendanceConfirmActions");




    if (!attendanceConfirmActions) {
        attendanceConfirmActions = document.createElement("div");
        attendanceConfirmActions.id = "attendanceConfirmActions";
        attendanceConfirmActions.hidden = true;
        attendanceConfirmActions.innerHTML = '<button type="button" class="primaryButton" onclick="confirmEarlyCheckout()">Ya</button><button type="button" class="secondaryButton" onclick="cancelEarlyCheckout()">Batalkan</button>';
        document.getElementById("workflowPanel").appendChild(attendanceConfirmActions);
    }




    return attendanceConfirmActions;




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




function showAttendanceCheckInRecorded(attendanceDecision) {




    hideScanningScreen();
    showWorkflowPanel(
        "",
        "Check-in sudah tercatat.",
        attendanceDecision.message || ("Check-in kamu sudah berhasil tercatat pada pukul " + attendanceDecision.checkInTime + ".")
    );




}




function showEarlyCheckoutConfirmation(staff) {




    pendingEarlyCheckoutStaff = staff;
    stopCamera();
    hideScanningScreen();
    showWorkflowPanel(
        "",
        "Kamu sudah check-in hari ini.",
        "Apakah kamu yakin ingin melakukan CHECK-OUT sekarang?"
    );
    getAttendanceConfirmActions().hidden = false;




}




function confirmEarlyCheckout() {




    if (!attendanceIsOpen || !pendingEarlyCheckoutStaff) {
        return;
    }




    const staff = pendingEarlyCheckoutStaff;
    pendingEarlyCheckoutStaff = null;
    hideAttendanceConfirmActions();
    runSelfieWorkflow(staff, "check-out", {
        confirmedEarlyCheckout: true
    });




}




function cancelEarlyCheckout() {




    pendingEarlyCheckoutStaff = null;
    goHome();




}




function showAttendanceSaveUncertain(staff) {




    stopCamera();
    hideScanningScreen();
    showWorkflowPanel(
        "",
        "Absensi belum bisa dipastikan.",
        "Jangan scan ulang dulu.\n\nHubungi Admin untuk cek absensi kamu, " + staff.name + "."
    );




}




function scheduleReturnHome() {




    clearAutoReturnTimer();
    autoReturnTimeoutId = window.setTimeout(function() {
        if (attendanceIsOpen) {
            goHome();
        }
    }, SUCCESS_MESSAGE_DURATION_MS);




}




function clearAutoReturnTimer() {




    if (autoReturnTimeoutId) {
        window.clearTimeout(autoReturnTimeoutId);
        autoReturnTimeoutId = null;
    }




}




async function getAttendanceDecision(localStaff) {




    if (!isGoogleSheetsConfigured("attendance")) {
        throw new Error("Attendance backend belum tersedia.");
    }




    let response;




    try {
        response = await callGoogleSheets("attendance", {
            action: "status",
            staffId: localStaff.id
        });
    } catch (error) {
        throw error;
    }




    if (!response || !response.ok || !response.staff || !response.action) {
        throw new Error((response && response.message) || "Attendance status failed.");
    }




    return {
        staff: {
            id: response.staff.id,
            name: response.staff.name
        },
        status: response.status || response.nextStatus,
        action: response.action,
        message: response.message || "",
        checkInTime: response.checkInTime || "",
        requiresConfirmation: response.requiresConfirmation === true
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




async function saveAttendanceRecord(staff, attendanceStatus, selfieDataUrl, saveOptions) {




    if (!selfieDataUrl) {
        return { saved: false };
    }




    if (isGoogleSheetsConfigured("attendance")) {
        const recordParams = {
            action: "record",
            staffId: staff.id,
            status: attendanceStatus,
            buktiAbsen: "Y",
            device: getDeviceLabel()
        };




        if (saveOptions && saveOptions.confirmedEarlyCheckout) {
            recordParams.confirmedEarlyCheckout = "Y";
        }




        let response;




        try {
            response = await callGoogleSheets("attendance", recordParams);
        } catch (error) {
            response = await sendGoogleSheetsWriteFallback("attendance", recordParams);
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




function updateCameraStatus(message, isError) {




    const cameraStatus = document.getElementById("cameraStatus");




    cameraStatus.textContent = message;
    cameraStatus.classList.toggle("error", Boolean(isError));




}




function isCurrentWorkflow(currentRunId) {




    return attendanceIsOpen && workflowInProgress && workflowRunId === currentRunId;




}




