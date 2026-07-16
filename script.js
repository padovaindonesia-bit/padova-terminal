const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyebliy1LZWyuNMl_ZiY52M9JHUxO7dY_cmIeNzN41Vxgk3rsGXPh3xn9io75m73eEI/exec";
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


const STOCK_ITEMS = {
    "BP1W": {
        sku: "BP1W",
        name: "Bantal PADOVA (classic - white)",
        stock: 0
    },
    "PDV-BTL-001": {
        sku: "PDV-BTL-001",
        name: "BANTAL HOTEL 50x70",
        stock: 125
    }
};


const ATTENDANCE_STORAGE_KEY = "padovaAttendanceDrafts";
const STOCK_CACHE_STORAGE_KEY = "padovaStockCache";
const STOCK_QUEUE_STORAGE_KEY = "padovaStockPendingQueue";
const STOCK_TRANSACTION_COUNTER_KEY = "padovaStockTransactionCounter";
const QR_SCAN_DELAY_MS = 500;
const STOCK_INVALID_QR_DELAY_MS = 3000;
const DUPLICATE_SCAN_DELAY_MS = 1500;
const MESSAGE_DISPLAY_DELAY_MS = 4500;
const COUNTDOWN_DELAY_MS = 1000;
const SUCCESS_RETURN_DELAY_MS = 4500;
const STOCK_SUCCESS_RETURN_DELAY_MS = 5000;
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
let stockCameraStream = null;
let stockQrDetector = null;
let stockScanTimeoutId = null;
let stockInvalidQrTimeoutId = null;
let stockScanPaused = false;
let stockIsOpen = false;
let stockScanMode = "item";
let selectedStockItem = null;
let pendingStockMovement = null;
let stockQuantity = 0;
let stockQuantityHoldIntervalId = null;
let stockReturnTimeoutId = null;
let stockSyncInProgress = false;


setupAdminPinInput();
setupStockAutoSync();


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
    clearStockReturnTimer();
    closeAdminPinDialog();
    stopCamera();
    stopStockCamera();
    showPage("home");


}


function showPage(pageId) {


    document.querySelectorAll(".page").forEach(function(page) {
        page.classList.remove("active");
    });


    document.getElementById(pageId).classList.add("active");


}


function showStock() {


    stockIsOpen = true;
    clearStockReturnTimer();
    stopCamera();
    showPage("stock");
    resetStockScreen();
    startStockCamera();


}


function resetStockScreen() {


    selectedStockItem = null;
    pendingStockMovement = null;
    stockQuantity = 0;
    stockScanMode = "item";
    stockScanPaused = false;
    clearStockInvalidQrTimer();
    document.getElementById("stockInstruction").hidden = false;
    document.getElementById("stockInstruction").textContent = "Scan QR barang untuk mulai update stock.";
    document.getElementById("stockCameraBox").hidden = false;
    document.getElementById("stockStatus").hidden = false;
    document.getElementById("stockItemPanel").hidden = true;
    document.getElementById("stockSuccessPanel").hidden = true;
    document.getElementById("stockSuccessName").textContent = "";
    document.getElementById("stockQuantityValue").textContent = "0";
    updateStockStatus("Menyiapkan kamera...");


}


async function startStockCamera() {


    const stockCameraPreview = document.getElementById("stockCameraPreview");
    const stockCameraFallback = document.getElementById("stockCameraFallback");


    if (!window.isSecureContext && location.hostname !== "localhost") {
        updateStockStatus("Kamera hanya bisa dibuka lewat HTTPS atau localhost.", true);
        return;
    }


    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        updateStockStatus("Browser ini belum bisa membuka kamera.", true);
        return;
    }


    try {
        stockCameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: false
        });


        if (!stockIsOpen) {
            stopStockCamera();
            return;
        }


        stockCameraPreview.srcObject = stockCameraStream;
        await stockCameraPreview.play();
        stockCameraPreview.classList.add("active");
        stockCameraFallback.classList.add("hidden");
        updateStockStatus(stockScanMode === "staff" ?
            "Scan QR Staff untuk menyimpan stock." :
            "Kamera siap. Scan QR barang.");
        startStockQrScanner();
    } catch (error) {
        stockCameraPreview.srcObject = null;
        stockCameraPreview.classList.remove("active");
        stockCameraFallback.classList.remove("hidden");
        updateStockStatus(getCameraErrorMessage(error), true);
    }


}


function stopStockCamera() {


    stopStockQrScanner();
    stopStockQuantityHold();
    clearStockInvalidQrTimer();
    pendingStockMovement = null;
    stockIsOpen = false;


    if (stockCameraStream) {
        stockCameraStream.getTracks().forEach(function(track) {
            track.stop();
        });
        stockCameraStream = null;
    }


    const stockCameraPreview = document.getElementById("stockCameraPreview");
    const stockCameraFallback = document.getElementById("stockCameraFallback");


    if (stockCameraPreview && stockCameraFallback) {
        stockCameraPreview.srcObject = null;
        stockCameraPreview.classList.remove("active");
        stockCameraFallback.classList.remove("hidden");
    }


}


function startStockQrScanner() {


    if (!("BarcodeDetector" in window)) {
        updateStockStatus("Scanner QR belum tersedia. Coba update browser tablet ini.", true);
        return;
    }


    try {
        if (!stockQrDetector) {
            stockQrDetector = new BarcodeDetector({ formats: ["qr_code"] });
        }
    } catch (error) {
        updateStockStatus("Scanner QR belum bisa disiapkan.", true);
        return;
    }


    stockScanPaused = false;
    scheduleStockQrScan();


}


function scheduleStockQrScan() {


    if (!stockIsOpen || !stockCameraStream || stockScanPaused) {
        return;
    }


    clearStockScanTimer();
    stockScanTimeoutId = window.setTimeout(scanStockQrCode, QR_SCAN_DELAY_MS);


}


async function scanStockQrCode() {


    const stockCameraPreview = document.getElementById("stockCameraPreview");


    if (!stockIsOpen || !stockCameraStream || stockScanPaused) {
        return;
    }


    if (stockCameraPreview.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
        scheduleStockQrScan();
        return;
    }


    try {
        const barcodes = await stockQrDetector.detect(stockCameraPreview);


        if (barcodes.length > 0) {
            handleStockQrCode(barcodes[0].rawValue.trim()).catch(function() {
                showStockItemLookupError({ code: "offline" });
            });
            return;
        }
    } catch (error) {
        updateStockStatus(stockScanMode === "staff" ?
            "Scanner QR sedang mencoba membaca Staff..." :
            "Scanner QR sedang mencoba membaca barang...");
    }


    scheduleStockQrScan();


}


async function handleStockQrCode(qrValue) {


    if (stockScanMode === "staff") {
        handleStockStaffQrCode(qrValue);
        return;
    }


    const itemCode = normalizeQrValue(qrValue);


    stockScanPaused = true;
    stopStockQrScanner();
    updateStockStatus("Mencari data barang...");


    let item;


    try {
        item = await getStockItemFromSheets(itemCode);
    } catch (error) {
        showStockItemLookupError(error);
        return;
    }


    if (!item) {
        showStockItemLookupError({ code: "not-found" });
        return;
    }


    selectedStockItem = item;
    showStockItemScreen(selectedStockItem);


}


function handleStockStaffQrCode(qrValue) {


    const staff = STAFF_MEMBERS[normalizeQrValue(qrValue)];


    if (!staff) {
        showInvalidStockStaffQrMessage();
        return;
    }


    stockScanPaused = true;
    stopStockQrScanner();
    finalizeStockMovement(staff).catch(function() {
        updateStockStatus("Stock belum bisa diperbarui. Coba lagi.", true);
    });


}


async function getStockItemFromSheets(itemCode) {


    if (!isGoogleSheetsConfigured()) {
        const cachedItem = getCachedStockItem(itemCode);


        if (cachedItem) {
            return cachedItem;
        }


        return getLocalStockItem(itemCode);
    }


    try {
        const response = await callGoogleSheets({
            action: "stockItem",
            itemCode: itemCode
        });


        if (!response.ok) {
            throw { code: response.code || "not-found" };
        }


        const item = {
            code: response.item.code,
            name: response.item.name,
            itemType: response.item.itemType || "",
            status: response.item.status || "Active",
            productionUnit: response.item.productionUnit || "pcs",
            stock: Number(response.item.currentStock),
            stockAvailable: response.item.stockAvailable === true
        };


        if (!item.stockAvailable || !Number.isFinite(item.stock)) {
            item.stock = null;
            item.stockAvailable = false;
        }


        cacheStockItem(item);
        return item;
    } catch (error) {
        const cachedItem = getCachedStockItem(itemCode);


        if (cachedItem) {
            return cachedItem;
        }


        throw error.code ? error : { code: "offline" };
    }


}


function showStockItemLookupError(error) {


    const code = error && error.code;
    let message = "❌ Barang tidak ditemukan.\n\nSilakan scan QR yang valid.";


    if (code === "inactive") {
        message = "❌ Barang ini sudah tidak aktif.\n\nHubungi Admin apabila diperlukan.";
    }


    if (code === "offline") {
        message = "❌ Data barang belum tersedia.\n\nCoba sambungkan internet lalu scan ulang.";
    }


    showStockScanError(message);


}


function showStockScanError(message) {


    stockScanPaused = true;
    clearStockScanTimer();
    clearStockInvalidQrTimer();
    updateStockStatus(message, true);


    stockInvalidQrTimeoutId = window.setTimeout(function() {
        stockInvalidQrTimeoutId = null;


        if (!stockIsOpen || !stockCameraStream || selectedStockItem) {
            return;
        }


        stockScanPaused = false;
        updateStockStatus("Kamera siap. Scan QR barang.");
        scheduleStockQrScan();
    }, STOCK_INVALID_QR_DELAY_MS);


}


function showInvalidStockQrMessage() {


    showStockScanError("❌ QR tidak dikenali.\n\nSilakan scan QR barang yang valid.");


}


function showInvalidStockStaffQrMessage() {


    stockScanPaused = true;
    clearStockScanTimer();
    clearStockInvalidQrTimer();
    updateStockStatus("❌ QR Staff tidak dikenali.\n\nSilakan scan QR Staff yang valid.", true);


    stockInvalidQrTimeoutId = window.setTimeout(function() {
        stockInvalidQrTimeoutId = null;


        if (!stockIsOpen || !stockCameraStream || stockScanMode !== "staff") {
            return;
        }


        stockScanPaused = false;
        updateStockStatus("Scan QR Staff untuk menyimpan stock.");
        scheduleStockQrScan();
    }, STOCK_INVALID_QR_DELAY_MS);


}


function showStockItemScreen(item) {


    document.getElementById("stockInstruction").hidden = true;
    document.getElementById("stockCameraBox").hidden = true;
    document.getElementById("stockStatus").hidden = false;
    document.getElementById("stockItemPanel").hidden = false;
    document.getElementById("stockSuccessPanel").hidden = true;
    document.getElementById("stockItemName").textContent = item.name;
    document.getElementById("stockItemSku").textContent = item.code;
    document.getElementById("stockCurrentQty").textContent = item.stockAvailable ?
        item.stock + " pcs" :
        "Stock tidak tersedia (Offline)";
    setStockQuantity(0);
    updateStockStatus("");


}


function startStockQuantityHold(amount) {


    changeStockQuantity(amount);
    stopStockQuantityHold();
    stockQuantityHoldIntervalId = window.setInterval(function() {
        changeStockQuantity(amount);
    }, 180);


}


function stopStockQuantityHold() {


    if (stockQuantityHoldIntervalId) {
        window.clearInterval(stockQuantityHoldIntervalId);
        stockQuantityHoldIntervalId = null;
    }


}


function changeStockQuantity(amount) {


    const nextQuantity = stockQuantity + amount;


    if (nextQuantity < 0) {
        updateStockStatus("❌ Jumlah tidak dapat lebih kecil dari 0.", true);
        setStockQuantity(0);
        return;
    }


    updateStockStatus("");
    setStockQuantity(nextQuantity);


}


function setStockQuantity(quantity) {


    stockQuantity = Math.max(0, quantity);
    document.getElementById("stockQuantityValue").textContent = String(stockQuantity);


}


async function handleStockAction(actionType) {


    if (!selectedStockItem) {
        updateStockStatus("Scan QR barang terlebih dahulu.", true);
        return;
    }


    if (actionType === "keluar" && selectedStockItem.stockAvailable && selectedStockItem.stock <= 0) {
        updateStockStatus("❌ Stock tidak mencukupi.\n\nTidak ada stock yang dapat dikeluarkan.", true);
        return;
    }


    if (stockQuantity <= 0) {
        updateStockStatus("Pilih jumlah terlebih dahulu.", true);
        return;
    }


    if (actionType === "keluar" && selectedStockItem.stockAvailable && stockQuantity > selectedStockItem.stock) {
        setStockQuantity(selectedStockItem.stock);
        updateStockStatus("❌ Jumlah melebihi stock yang tersedia.", true);
        return;
    }


    pendingStockMovement = {
        item: selectedStockItem,
        actionType: actionType,
        quantity: stockQuantity
    };


    showStockStaffScanner();


}


function showStockStaffScanner() {


    stockScanMode = "staff";
    stockScanPaused = false;
    clearStockInvalidQrTimer();
    document.getElementById("stockInstruction").hidden = false;
    document.getElementById("stockInstruction").textContent = "Scan QR Staff untuk menyimpan stock.";
    document.getElementById("stockCameraBox").hidden = false;
    document.getElementById("stockStatus").hidden = false;
    document.getElementById("stockItemPanel").hidden = true;
    document.getElementById("stockSuccessPanel").hidden = true;
    updateStockStatus("Scan QR Staff untuk menyimpan stock.");


    if (stockCameraStream) {
        startStockQrScanner();
        return;
    }


    startStockCamera();


}


async function finalizeStockMovement(staff) {


    if (!pendingStockMovement) {
        updateStockStatus("Transaksi stock belum siap. Coba scan barang lagi.", true);
        return;
    }


    const result = await saveStockMovement(
        pendingStockMovement.item,
        pendingStockMovement.actionType,
        pendingStockMovement.quantity,
        staff
    );


    if (!result.saved) {
        updateStockStatus("Stock belum bisa diperbarui. Coba lagi.", true);
        return;
    }


    selectedStockItem = updateCachedStockAfterMovement(pendingStockMovement.item, result.stockAfter);


    if (result.pendingSync) {
        showStockOfflineSuccess();
        return;
    }


    showStockSuccess(
        pendingStockMovement.actionType,
        pendingStockMovement.quantity,
        result.stockAfter,
        staff
    );


}


async function saveStockMovement(item, actionType, quantity, staff) {


    const stockBefore = item.stockAvailable ? item.stock : "";
    const stockAfter = item.stockAvailable ?
        calculateStockAfter(item.stock, actionType, quantity) :
        "";


    if (item.stockAvailable && actionType === "keluar" && stockAfter < 0) {
        return { saved: false };
    }


    const transaction = createStockMovementTransaction(item, actionType, quantity, staff, stockBefore, stockAfter);


    if (!isGoogleSheetsConfigured() || !navigator.onLine) {
        return queueStockMovement(transaction);
    }


    try {
        const response = await callGoogleSheets(Object.assign({
            action: "stockRecord"
        }, transaction));


        if (!response.ok) {
            return { saved: false };
        }


        return {
            saved: true,
            pendingSync: false,
            stockAfter: transaction.stockAfter,
            transactionId: transaction.transactionId
        };
    } catch (error) {
        return queueStockMovement(transaction);
    }


}


function showStockSuccess(actionType, quantity, stockAfter, staff) {


    const stockAfterText = stockAfter === "" ?
        "Stock tidak tersedia (Offline)" :
        stockAfter + " pcs";


    document.getElementById("stockInstruction").hidden = true;
    document.getElementById("stockCameraBox").hidden = true;
    document.getElementById("stockStatus").hidden = true;
    document.getElementById("stockItemPanel").hidden = true;
    document.getElementById("stockSuccessPanel").hidden = false;
    document.getElementById("stockSuccessName").textContent = staff.name;
    document.getElementById("stockSuccessTitle").textContent = "✅ Stock berhasil diperbarui.";
    document.getElementById("stockSuccessText").textContent = actionType === "masuk" ?
        quantity + " pcs berhasil ditambahkan.\n\nStock sekarang\n\n" + stockAfterText :
        quantity + " pcs berhasil dikeluarkan.\n\nStock sekarang\n\n" + stockAfterText;
    waitForScreenRender().then(function() {
        stockReturnTimeoutId = window.setTimeout(function() {
            if (stockIsOpen) {
                resetStockScreen();
                goHome();
            }
        }, STOCK_SUCCESS_RETURN_DELAY_MS);
    });


}


function showStockOfflineSuccess() {


    document.getElementById("stockInstruction").hidden = true;
    document.getElementById("stockCameraBox").hidden = true;
    document.getElementById("stockStatus").hidden = true;
    document.getElementById("stockItemPanel").hidden = true;
    document.getElementById("stockSuccessPanel").hidden = false;
    document.getElementById("stockSuccessName").textContent = "";
    document.getElementById("stockSuccessTitle").textContent = "✅ Transaksi berhasil disimpan.";
    document.getElementById("stockSuccessText").textContent =
        "Tidak ada koneksi internet.\n\nTransaksi akan otomatis disinkronkan saat koneksi tersedia.";
    waitForScreenRender().then(function() {
        stockReturnTimeoutId = window.setTimeout(function() {
            if (stockIsOpen) {
                resetStockScreen();
                goHome();
            }
        }, MESSAGE_DISPLAY_DELAY_MS);
    });


}


function createStockMovementTransaction(item, actionType, quantity, staff, stockBefore, stockAfter) {


    const now = new Date();


    return {
        transactionId: generateStockTransactionId(),
        date: formatDateValue(now),
        time: formatTimeValue(now),
        staffId: staff.id,
        staffName: staff.name,
        itemCode: item.code,
        itemName: item.name,
        movement: actionType === "masuk" ? "Adjustment (+)" : "Adjustment (-)",
        qty: String(quantity),
        stockBefore: String(stockBefore),
        stockAfter: String(stockAfter)
    };


}


function calculateStockAfter(stockBefore, actionType, quantity) {


    return actionType === "masuk" ?
        stockBefore + quantity :
        stockBefore - quantity;


}


function generateStockTransactionId() {


    const nextNumber = Number(localStorage.getItem(STOCK_TRANSACTION_COUNTER_KEY) || "0") + 1;
    localStorage.setItem(STOCK_TRANSACTION_COUNTER_KEY, String(nextNumber));
    return "STK-" + String(nextNumber).padStart(6, "0");


}


function formatDateValue(date) {


    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");


    return year + "-" + month + "-" + day;


}


function formatTimeValue(date) {


    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");


    return hour + ":" + minute + ":" + second;


}


function queueStockMovement(transaction) {


    const queue = getStockPendingQueue();
    const isDuplicate = queue.some(function(item) {
        return item.transactionId === transaction.transactionId;
    });


    if (!isDuplicate) {
        queue.push(transaction);
        saveStockPendingQueue(queue);
    }


    return {
        saved: true,
        pendingSync: true,
        stockAfter: transaction.stockAfter,
        transactionId: transaction.transactionId
    };


}


function getStockPendingQueue() {


    try {
        return JSON.parse(localStorage.getItem(STOCK_QUEUE_STORAGE_KEY)) || [];
    } catch (error) {
        return [];
    }


}


function saveStockPendingQueue(queue) {


    localStorage.setItem(STOCK_QUEUE_STORAGE_KEY, JSON.stringify(queue));


}


function setupStockAutoSync() {


    window.addEventListener("online", syncPendingStockMovements);
    window.setInterval(syncPendingStockMovements, 60000);
    syncPendingStockMovements();


}


async function syncPendingStockMovements() {


    if (stockSyncInProgress || !isGoogleSheetsConfigured() || !navigator.onLine) {
        return;
    }


    stockSyncInProgress = true;


    const queue = getStockPendingQueue();


    if (queue.length === 0) {
        stockSyncInProgress = false;
        return;
    }


    const remainingQueue = queue.slice();


    try {
        while (remainingQueue.length > 0) {
            const transaction = remainingQueue[0];


            try {
                const response = await callGoogleSheets(Object.assign({
                    action: "stockRecord"
                }, transaction));


                if (!response.ok) {
                    break;
                }


                remainingQueue.shift();
                saveStockPendingQueue(remainingQueue);
            } catch (error) {
                break;
            }
        }
    } finally {
        stockSyncInProgress = false;
    }


}


function updateCachedStockAfterMovement(item, stockAfter) {


    if (stockAfter === "" || stockAfter === null || stockAfter === undefined) {
        return item;
    }


    const nextItem = Object.assign({}, item, {
        stock: Number(stockAfter),
        stockAvailable: true
    });


    cacheStockItem(nextItem);
    return nextItem;


}


function getCachedStockItem(itemCode) {


    const cache = getStockCache();
    const cachedItem = cache[itemCode];


    if (!cachedItem) {
        return null;
    }


    return cachedItem;


}


function cacheStockItem(item) {


    const cache = getStockCache();
    cache[item.code] = item;
    localStorage.setItem(STOCK_CACHE_STORAGE_KEY, JSON.stringify(cache));


}


function getStockCache() {


    try {
        return JSON.parse(localStorage.getItem(STOCK_CACHE_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }


}


function getLocalStockItem(itemCode) {


    const localItem = STOCK_ITEMS[itemCode];


    if (!localItem) {
        return null;
    }


    return {
        code: localItem.sku,
        name: localItem.name,
        itemType: "",
        status: "Active",
        productionUnit: "pcs",
        stock: localItem.stock,
        stockAvailable: Number.isFinite(localItem.stock)
    };


}


function stopStockQrScanner() {


    stockScanPaused = true;
    clearStockScanTimer();


}


function clearStockScanTimer() {


    if (stockScanTimeoutId) {
        window.clearTimeout(stockScanTimeoutId);
        stockScanTimeoutId = null;
    }


}


function clearStockReturnTimer() {


    if (stockReturnTimeoutId) {
        window.clearTimeout(stockReturnTimeoutId);
        stockReturnTimeoutId = null;
    }


}


function clearStockInvalidQrTimer() {


    if (stockInvalidQrTimeoutId) {
        window.clearTimeout(stockInvalidQrTimeoutId);
        stockInvalidQrTimeoutId = null;
    }


}


function updateStockStatus(message, isError) {


    const stockStatus = document.getElementById("stockStatus");


    stockStatus.textContent = message;
    stockStatus.classList.toggle("error", Boolean(isError));


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


    try {
        drawQrToCanvas(qrContent, qrPreviewCanvas, 1024);


        generatedQrFileName = sanitizeFileName(fileName);
        document.getElementById("qrPreviewLabel").textContent = qrContent;
        document.getElementById("qrPreviewPanel").hidden = false;
        updateQrGeneratorStatus("QR berhasil dibuat.");
    } catch (error) {
        updateQrGeneratorStatus(error.message || "QR belum bisa dibuat. Coba lagi.", true);
    }


}


// Local QR encoder for short Staff IDs and SKUs, so kiosk mode does not depend on a CDN.
function drawQrToCanvas(text, canvas, outputSize) {


    const qr = createQrMatrix(text);
    const context = canvas.getContext("2d");
    const quietZone = 4;
    const moduleCount = qr.length + quietZone * 2;
    const moduleSize = Math.floor(outputSize / moduleCount);
    const canvasSize = moduleSize * moduleCount;


    canvas.width = canvasSize;
    canvas.height = canvasSize;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, canvasSize, canvasSize);
    context.fillStyle = "#000000";


    for (let y = 0; y < qr.length; y += 1) {
        for (let x = 0; x < qr.length; x += 1) {
            if (qr[y][x]) {
                context.fillRect(
                    (x + quietZone) * moduleSize,
                    (y + quietZone) * moduleSize,
                    moduleSize,
                    moduleSize
                );
            }
        }
    }


}


function createQrMatrix(text) {


    const dataCodewords = createQrDataCodewords(text);
    const errorCodewords = createReedSolomonCodewords(dataCodewords, 16);
    const codewords = dataCodewords.concat(errorCodewords);
    const maskPattern = chooseQrMask(codewords);


    return buildQrMatrix(codewords, maskPattern);


}


function createQrDataCodewords(text) {


    const bytes = textToBytes(text);
    const maxDataBytes = 28;


    if (bytes.length > 25) {
        throw new Error("Kode terlalu panjang. Maksimal 25 karakter.");
    }


    const bits = [];
    appendBits(bits, 4, 4);
    appendBits(bits, bytes.length, 8);


    bytes.forEach(function(byte) {
        appendBits(bits, byte, 8);
    });


    appendBits(bits, 0, Math.min(4, maxDataBytes * 8 - bits.length));


    while (bits.length % 8 !== 0) {
        bits.push(0);
    }


    const dataCodewords = [];


    for (let index = 0; index < bits.length; index += 8) {
        dataCodewords.push(bitsToNumber(bits.slice(index, index + 8)));
    }


    let padByte = 0xEC;


    while (dataCodewords.length < maxDataBytes) {
        dataCodewords.push(padByte);
        padByte = padByte === 0xEC ? 0x11 : 0xEC;
    }


    return dataCodewords;


}


function buildQrMatrix(codewords, maskPattern) {


    const size = 25;
    const matrix = createEmptyMatrix(size);
    const reserved = createEmptyMatrix(size);


    addFinderPattern(matrix, reserved, 0, 0);
    addFinderPattern(matrix, reserved, size - 7, 0);
    addFinderPattern(matrix, reserved, 0, size - 7);
    addAlignmentPattern(matrix, reserved, 18, 18);
    addTimingPatterns(matrix, reserved);
    addDarkModule(matrix, reserved);
    reserveFormatAreas(reserved);
    addDataBits(matrix, reserved, codewords, maskPattern);
    addFormatBits(matrix, reserved, maskPattern);


    return matrix;


}


function chooseQrMask(codewords) {


    let bestMask = 0;
    let bestPenalty = Infinity;


    for (let mask = 0; mask < 8; mask += 1) {
        const matrix = buildQrMatrix(codewords, mask);
        const penalty = calculateQrPenalty(matrix);


        if (penalty < bestPenalty) {
            bestPenalty = penalty;
            bestMask = mask;
        }
    }


    return bestMask;


}


function addFinderPattern(matrix, reserved, left, top) {


    for (let y = -1; y <= 7; y += 1) {
        for (let x = -1; x <= 7; x += 1) {
            const row = top + y;
            const column = left + x;


            if (!isInsideMatrix(matrix, column, row)) {
                continue;
            }


            const isBorder = x === -1 || x === 7 || y === -1 || y === 7;
            const isFinder = !isBorder && (
                x === 0 || x === 6 || y === 0 || y === 6 ||
                (x >= 2 && x <= 4 && y >= 2 && y <= 4)
            );


            matrix[row][column] = isFinder;
            reserved[row][column] = true;
        }
    }


}


function addAlignmentPattern(matrix, reserved, centerX, centerY) {


    for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
            const row = centerY + y;
            const column = centerX + x;
            const isDark = Math.max(Math.abs(x), Math.abs(y)) !== 1;


            matrix[row][column] = isDark;
            reserved[row][column] = true;
        }
    }


}


function addTimingPatterns(matrix, reserved) {


    for (let index = 8; index < matrix.length - 8; index += 1) {
        const isDark = index % 2 === 0;
        matrix[6][index] = isDark;
        matrix[index][6] = isDark;
        reserved[6][index] = true;
        reserved[index][6] = true;
    }


}


function addDarkModule(matrix, reserved) {


    matrix[17][8] = true;
    reserved[17][8] = true;


}


function reserveFormatAreas(reserved) {


    const size = reserved.length;


    for (let index = 0; index <= 8; index += 1) {
        if (index !== 6) {
            reserved[8][index] = true;
            reserved[index][8] = true;
        }
    }


    for (let index = 0; index < 8; index += 1) {
        reserved[8][size - 1 - index] = true;
        reserved[size - 1 - index][8] = true;
    }


}


function addDataBits(matrix, reserved, codewords, maskPattern) {


    const bits = [];


    codewords.forEach(function(codeword) {
        appendBits(bits, codeword, 8);
    });


    let bitIndex = 0;
    let upward = true;


    for (let right = matrix.length - 1; right >= 1; right -= 2) {
        if (right === 6) {
            right -= 1;
        }


        for (let vertical = 0; vertical < matrix.length; vertical += 1) {
            const row = upward ? matrix.length - 1 - vertical : vertical;


            for (let offset = 0; offset < 2; offset += 1) {
                const column = right - offset;


                if (reserved[row][column]) {
                    continue;
                }


                let isDark = bitIndex < bits.length ? bits[bitIndex] === 1 : false;


                if (getMaskBit(maskPattern, row, column)) {
                    isDark = !isDark;
                }


                matrix[row][column] = isDark;
                bitIndex += 1;
            }
        }


        upward = !upward;
    }


}


function addFormatBits(matrix, reserved, maskPattern) {


    const size = matrix.length;
    const formatBits = getFormatBits(maskPattern);
    const firstPositions = [
        [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
        [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8],
        [2, 8], [1, 8], [0, 8]
    ];


    const secondPositions = [
        [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8],
        [size - 5, 8], [size - 6, 8], [size - 7, 8], [size - 8, 8],
        [8, size - 7], [8, size - 6], [8, size - 5],
        [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
    ];


    firstPositions.forEach(function(position, index) {
        matrix[position[1]][position[0]] = ((formatBits >> index) & 1) === 1;
        reserved[position[1]][position[0]] = true;
    });


    secondPositions.forEach(function(position, index) {
        matrix[position[1]][position[0]] = ((formatBits >> index) & 1) === 1;
        reserved[position[1]][position[0]] = true;
    });


}


function getFormatBits(maskPattern) {


    let data = maskPattern;
    let value = data << 10;
    const generator = 0x537;


    for (let bit = 14; bit >= 10; bit -= 1) {
        if (((value >> bit) & 1) !== 0) {
            value ^= generator << (bit - 10);
        }
    }


    return ((data << 10) | value) ^ 0x5412;


}


function createReedSolomonCodewords(dataCodewords, errorCodewordCount) {


    const generator = createReedSolomonGenerator(errorCodewordCount);
    const result = new Array(errorCodewordCount).fill(0);


    dataCodewords.forEach(function(dataCodeword) {
        const factor = dataCodeword ^ result.shift();
        result.push(0);


        generator.forEach(function(coefficient, index) {
            result[index] ^= gfMultiply(coefficient, factor);
        });
    });


    return result;


}


function createReedSolomonGenerator(degree) {


    let generator = [1];


    for (let index = 0; index < degree; index += 1) {
        generator = multiplyPolynomials(generator, [1, gfPow(2, index)]);
    }


    return generator.slice(1);


}


function multiplyPolynomials(left, right) {


    const result = new Array(left.length + right.length - 1).fill(0);


    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            result[leftIndex + rightIndex] ^= gfMultiply(left[leftIndex], right[rightIndex]);
        }
    }


    return result;


}


function gfPow(value, power) {


    let result = 1;


    for (let index = 0; index < power; index += 1) {
        result = gfMultiply(result, value);
    }


    return result;


}


function gfMultiply(left, right) {


    let result = 0;
    let a = left;
    let b = right;


    while (b > 0) {
        if ((b & 1) !== 0) {
            result ^= a;
        }


        a <<= 1;


        if ((a & 0x100) !== 0) {
            a ^= 0x11D;
        }


        b >>= 1;
    }


    return result & 0xFF;


}


function getMaskBit(maskPattern, row, column) {


    if (maskPattern === 0) {
        return (row + column) % 2 === 0;
    }


    if (maskPattern === 1) {
        return row % 2 === 0;
    }


    if (maskPattern === 2) {
        return column % 3 === 0;
    }


    if (maskPattern === 3) {
        return (row + column) % 3 === 0;
    }


    if (maskPattern === 4) {
        return (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0;
    }


    if (maskPattern === 5) {
        return ((row * column) % 2) + ((row * column) % 3) === 0;
    }


    if (maskPattern === 6) {
        return (((row * column) % 2) + ((row * column) % 3)) % 2 === 0;
    }


    return (((row + column) % 2) + ((row * column) % 3)) % 2 === 0;


}


function calculateQrPenalty(matrix) {


    return calculateRunPenalty(matrix) +
        calculateBlockPenalty(matrix) +
        calculatePatternPenalty(matrix) +
        calculateBalancePenalty(matrix);


}


function calculateRunPenalty(matrix) {


    let penalty = 0;


    for (let y = 0; y < matrix.length; y += 1) {
        penalty += calculateLineRunPenalty(matrix[y]);
    }


    for (let x = 0; x < matrix.length; x += 1) {
        const column = matrix.map(function(row) {
            return row[x];
        });
        penalty += calculateLineRunPenalty(column);
    }


    return penalty;


}


function calculateLineRunPenalty(line) {


    let penalty = 0;
    let runColor = line[0];
    let runLength = 1;


    for (let index = 1; index < line.length; index += 1) {
        if (line[index] === runColor) {
            runLength += 1;
        } else {
            if (runLength >= 5) {
                penalty += runLength - 2;
            }


            runColor = line[index];
            runLength = 1;
        }
    }


    if (runLength >= 5) {
        penalty += runLength - 2;
    }


    return penalty;


}


function calculateBlockPenalty(matrix) {


    let penalty = 0;


    for (let y = 0; y < matrix.length - 1; y += 1) {
        for (let x = 0; x < matrix.length - 1; x += 1) {
            const color = matrix[y][x];


            if (
                matrix[y][x + 1] === color &&
                matrix[y + 1][x] === color &&
                matrix[y + 1][x + 1] === color
            ) {
                penalty += 3;
            }
        }
    }


    return penalty;


}


function calculatePatternPenalty(matrix) {


    let penalty = 0;


    for (let y = 0; y < matrix.length; y += 1) {
        penalty += calculateLinePatternPenalty(matrix[y]);
    }


    for (let x = 0; x < matrix.length; x += 1) {
        const column = matrix.map(function(row) {
            return row[x];
        });
        penalty += calculateLinePatternPenalty(column);
    }


    return penalty;


}


function calculateLinePatternPenalty(line) {


    let penalty = 0;
    const pattern = [true, false, true, true, true, false, true, false, false, false, false];


    for (let index = 0; index <= line.length - pattern.length; index += 1) {
        const matches = pattern.every(function(value, offset) {
            return line[index + offset] === value;
        });


        const reverseMatches = pattern.every(function(value, offset) {
            return line[index + offset] === pattern[pattern.length - 1 - offset];
        });


        if (matches || reverseMatches) {
            penalty += 40;
        }
    }


    return penalty;


}


function calculateBalancePenalty(matrix) {


    let darkCount = 0;
    const totalCount = matrix.length * matrix.length;


    matrix.forEach(function(row) {
        row.forEach(function(value) {
            if (value) {
                darkCount += 1;
            }
        });
    });


    const darkPercent = (darkCount * 100) / totalCount;
    const previousMultiple = Math.floor(darkPercent / 5) * 5;
    const nextMultiple = previousMultiple + 5;


    return Math.min(
        Math.abs(previousMultiple - 50) / 5,
        Math.abs(nextMultiple - 50) / 5
    ) * 10;


}


function textToBytes(text) {


    return text.split("").map(function(character) {
        const code = character.charCodeAt(0);


        if (code > 127) {
            throw new Error("Kode QR hanya boleh memakai huruf, angka, dan simbol standar.");
        }


        return code;
    });


}


function appendBits(bits, value, length) {


    for (let index = length - 1; index >= 0; index -= 1) {
        bits.push((value >> index) & 1);
    }


}


function bitsToNumber(bits) {


    return bits.reduce(function(value, bit) {
        return (value << 1) | bit;
    }, 0);


}


function createEmptyMatrix(size) {


    return Array.from({ length: size }, function() {
        return new Array(size).fill(false);
    });


}


function isInsideMatrix(matrix, column, row) {


    return row >= 0 && row < matrix.length && column >= 0 && column < matrix.length;


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
