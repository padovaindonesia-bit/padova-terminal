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
let stockMovementSaving = false;

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
    setStockQuantity(0);
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




    console.log("[Stock Debug] scanned item code:", itemCode);
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
        stockMovementSaving = false;
        updateStockStatus("Stock belum bisa diperbarui. Coba lagi.", true);
    });




}




async function getStockItemFromSheets(itemCode) {




    if (!isGoogleSheetsConfigured("inventory")) {
        const cachedItem = getCachedStockItem(itemCode);




        if (cachedItem) {
            return cachedItem;
        }




        return getLocalStockItem(itemCode);
    }




    try {
        const response = await callGoogleSheets("inventory", {
            action: "stockItem",
            itemCode: itemCode
        });




        if (!response || typeof response !== "object") {
            throw {
                code: "invalid-response",
                fromSheetsResponse: true
            };
        }

        if (!response.ok) {
            throw {
                code: response.code === "not-found" || response.code === "inactive" ?
                    response.code : "backend-unavailable",
                fromSheetsResponse: true
            };
        }

        if (!response.item || !response.item.code || !response.item.name) {
            throw {
                code: "invalid-response",
                fromSheetsResponse: true
            };
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




        console.log("[Stock Debug] matched item code:", item.code);
        console.log("[Stock Debug] Google Sheets stock value:", response.item.currentStock);
        cacheStockItem(item);
        return item;
    } catch (error) {
        if (error.fromSheetsResponse) {
            throw error;
        }




        const cachedItem = getCachedStockItem(itemCode);




        if (cachedItem) {
            console.warn("[Stock Debug] using cached stock item:", cachedItem.code, cachedItem.stock);
            return cachedItem;
        }




        throw navigator.onLine ? { code: "backend-unavailable" } : { code: "offline" };
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

    if (code === "backend-unavailable") {
        message = "❌ Server inventory belum dapat dihubungi.\n\nCoba lagi sebentar.";
    }

    if (code === "invalid-response") {
        message = "❌ Data barang dari server tidak dapat dikenali.\n\nCoba scan ulang.";
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




    console.log("[Stock Debug] value sent to UI:", item.code, item.stockAvailable ? item.stock : "Stock tidak tersedia (Offline)");
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




function setupStockQuantityControls() {




    const stockQuantityControls = document.getElementById("stockQuantityControls");
    const stockQuantityValue = document.getElementById("stockQuantityValue");




    if (!stockQuantityControls || !stockQuantityValue) {
        return;
    }




    stockQuantityControls.innerHTML = "";




    QUANTITY_STEPS.slice().reverse().forEach(function(step) {
        stockQuantityControls.appendChild(createStockQuantityButton(-step));
    });




    stockQuantityControls.appendChild(stockQuantityValue);




    QUANTITY_STEPS.forEach(function(step) {
        stockQuantityControls.appendChild(createStockQuantityButton(step));
    });




    stockQuantityValue.addEventListener("input", handleStockQuantityInput);




}




function createStockQuantityButton(amount) {




    const button = document.createElement("button");
    const label = amount > 0 ? "+" + amount : String(amount);




    button.type = "button";
    button.className = "quantityButton";
    button.textContent = label;
    button.setAttribute("aria-label", label + " pcs");
    button.addEventListener("pointerdown", function() {
        startStockQuantityHold(amount);
    });
    button.addEventListener("pointerup", stopStockQuantityHold);
    button.addEventListener("pointerleave", stopStockQuantityHold);
    button.addEventListener("pointercancel", stopStockQuantityHold);




    return button;




}




function handleStockQuantityInput(event) {




    const quantity = Number(event.target.value);




    setStockQuantity(Number.isFinite(quantity) ? quantity : 0);




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
    const stockQuantityValue = document.getElementById("stockQuantityValue");




    if ("value" in stockQuantityValue) {
        stockQuantityValue.value = String(stockQuantity);
        return;
    }




    stockQuantityValue.textContent = String(stockQuantity);




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

    if (stockMovementSaving) {
        return;
    }




    if (!pendingStockMovement) {
        updateStockStatus("Transaksi stock belum siap. Coba scan barang lagi.", true);
        return;
    }

    const stockMovement = pendingStockMovement;
    pendingStockMovement = null;




    stockMovementSaving = true;
    const result = await saveStockMovement(
        stockMovement.item,
        stockMovement.actionType,
        stockMovement.quantity,
        staff
    );




    if (!result.saved) {
        stockMovementSaving = false;
        updateStockStatus(result.message || "Stock belum bisa diperbarui. Coba lagi.", true);
        return;
    }




    selectedStockItem = updateCachedStockAfterMovement(stockMovement.item, result.stockAfter);




    if (result.pendingSync) {
        stockMovementSaving = false;
        showStockOfflineSuccess(result.pendingSyncReason);
        return;
    }




    stockMovementSaving = false;
    showStockSuccess(
        stockMovement.actionType,
        stockMovement.quantity,
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




    if (!isGoogleSheetsConfigured("inventory")) {
        return queueStockMovement(transaction, "backend-unavailable");
    }

    if (!navigator.onLine) {
        return queueStockMovement(transaction, "offline");
    }




    try {
        console.log("[Stock Write] sending transaction:", transaction);
        const response = await callGoogleSheets("inventory", Object.assign({
            action: "stockRecord"
        }, transaction));




        console.log("[Stock Write] server response:", response);




        if (!response || response.ok !== true) {
            return {
                saved: false,
                message: response && response.message ? response.message : "Stock belum bisa diperbarui. Coba lagi."
            };
        }




        const serverStockAfter = Number(response.stockAfter);




        if (response.stockAfter === "" || response.stockAfter === null || response.stockAfter === undefined || !Number.isFinite(serverStockAfter)) {
            return {
                saved: false,
                message: "Stock belum bisa diperbarui. Coba lagi."
            };
        }




        return {
            saved: true,
            pendingSync: false,
            stockAfter: serverStockAfter,
            transactionId: response.transactionId
        };
    } catch (error) {
        console.error("[Stock Write] request failed:", error);
        return queueStockMovement(transaction, navigator.onLine ? "backend-unavailable" : "offline");
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
        }, SUCCESS_MESSAGE_DURATION_MS);
    });




}




function showStockOfflineSuccess(pendingSyncReason) {




    document.getElementById("stockInstruction").hidden = true;
    document.getElementById("stockCameraBox").hidden = true;
    document.getElementById("stockStatus").hidden = true;
    document.getElementById("stockItemPanel").hidden = true;
    document.getElementById("stockSuccessPanel").hidden = false;
    document.getElementById("stockSuccessName").textContent = "";
    document.getElementById("stockSuccessTitle").textContent = "✅ Transaksi berhasil disimpan.";
    document.getElementById("stockSuccessText").textContent = pendingSyncReason === "backend-unavailable" ?
        "Server inventory belum dapat dihubungi.\n\nTransaksi akan otomatis disinkronkan saat server tersedia." :
        "Tidak ada koneksi internet.\n\nTransaksi akan otomatis disinkronkan saat koneksi tersedia.";
    waitForScreenRender().then(function() {
        stockReturnTimeoutId = window.setTimeout(function() {
            if (stockIsOpen) {
                resetStockScreen();
                goHome();
            }
        }, SUCCESS_MESSAGE_DURATION_MS);
    });




}




function generateStockClientRequestId() {




    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }




    return (
        "REQ-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2)
    );




}




function createStockMovementTransaction(item, actionType, quantity, staff, stockBefore, stockAfter) {




    const now = new Date();




    return {
        clientRequestId: generateStockClientRequestId(),
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




function setupStockAutoSync() {




    window.addEventListener("online", syncPendingStockMovements);
    window.setInterval(syncPendingStockMovements, 60000);
    syncPendingStockMovements();




}




async function syncPendingStockMovements() {




    if (stockSyncInProgress || !isGoogleSheetsConfigured("inventory") || !navigator.onLine) {
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
                console.log("[Stock Sync] sending queued transaction:", transaction);
                const response = await callGoogleSheets("inventory", Object.assign({
                    action: "stockRecord"
                }, transaction));




                console.log("[Stock Sync] server response:", response);




                if (!response || response.ok !== true) {
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




    return item;




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




