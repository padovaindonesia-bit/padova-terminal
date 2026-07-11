let cameraStream = null;
let attendanceIsOpen = false;


function showAttendance() {


    attendanceIsOpen = true;
    document.getElementById("home").classList.remove("active");
    document.getElementById("attendance").classList.add("active");
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
        updateCameraStatus("Kamera siap. Tunjukkan kartu karyawan kamu ke kamera.");
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
