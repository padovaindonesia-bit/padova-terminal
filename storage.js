function generateStockTransactionId() {




    const nextNumber = Number(localStorage.getItem(STOCK_TRANSACTION_COUNTER_KEY) || "0") + 1;
    localStorage.setItem(STOCK_TRANSACTION_COUNTER_KEY, String(nextNumber));
    return "STK-" + String(nextNumber).padStart(6, "0");




}




function queueStockMovement(transaction, pendingSyncReason) {




    const queuedTransaction = normalizeQueuedStockMovement(transaction);
    const queue = getStockPendingQueue();
    const transactionKey = getStockTransactionKey(queuedTransaction);
    const isDuplicate = queue.some(function(item) {
        return transactionKey && getStockTransactionKey(item) === transactionKey;
    });




    if (!isDuplicate) {
        queue.push(queuedTransaction);
        saveStockPendingQueue(queue);
    }




    return {
        saved: true,
        pendingSync: true,
        pendingSyncReason: pendingSyncReason || "offline",
        stockAfter: queuedTransaction.stockAfter,
        transactionId: queuedTransaction.transactionId,
        clientRequestId: queuedTransaction.clientRequestId,
        targetMonth: queuedTransaction.targetMonth
    };




}




function getStockTransactionKey(transaction) {




    if (!transaction) {
        return "";
    }




    return String(transaction.transactionId || transaction.clientRequestId || "").trim();




}




function normalizeQueuedStockMovement(transaction) {




    if (!transaction) {
        return transaction;
    }




    const clientRequestId = String(transaction.clientRequestId || "").trim();
    const transactionId = String(transaction.transactionId || "").trim();
    const targetMonth = getStockTargetMonth(transaction);
    const updates = {};




    if (!transactionId && clientRequestId) {
        updates.transactionId = clientRequestId;
    }




    if (targetMonth && transaction.targetMonth !== targetMonth) {
        updates.targetMonth = targetMonth;
    }




    if (Object.keys(updates).length === 0) {
        return transaction;
    }




    return Object.assign({}, transaction, updates);




}




function getStockTargetMonth(transaction) {




    return normalizeStockMonthValue(
        transaction.targetMonth ||
        transaction.activeMonth ||
        getStockMonthFromDateValue(transaction.date)
    );




}




function getStockMonthFromDateValue(value) {




    const match = String(value || "").trim().match(/^\d{4}-(\d{1,2})-\d{1,2}$/);




    return match ? match[1] : "";




}




function normalizeStockMonthValue(value) {




    const text = String(value || "").trim();




    if (!text) {
        return "";
    }




    const month = Number(text);




    if (!Number.isInteger(month) || month < 1 || month > 12) {
        return "";
    }




    return String(month).padStart(2, "0");




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




function getCachedStockItem(itemCode) {




    const cache = getStockCache();
    const cachedItem = cache[itemCode];




    if (!cachedItem) {
        return null;
    }




    if (cachedItem.cacheSource !== "sheets") {
        console.warn("[Stock Debug] ignoring untrusted cached stock item:", itemCode, cachedItem.stock);
        return null;
    }




    return cachedItem;




}




function cacheStockItem(item) {




    const cache = getStockCache();
    cache[item.code] = Object.assign({}, item, {
        cacheSource: "sheets",
        cachedAt: new Date().toISOString()
    });
    localStorage.setItem(STOCK_CACHE_STORAGE_KEY, JSON.stringify(cache));




}




function getStockCache() {




    try {
        return JSON.parse(localStorage.getItem(STOCK_CACHE_STORAGE_KEY)) || {};
    } catch (error) {
        return {};
    }




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




