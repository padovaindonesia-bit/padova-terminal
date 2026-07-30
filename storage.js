function generateStockTransactionId() {




    const nextNumber = Number(localStorage.getItem(STOCK_TRANSACTION_COUNTER_KEY) || "0") + 1;
    localStorage.setItem(STOCK_TRANSACTION_COUNTER_KEY, String(nextNumber));
    return "STK-" + String(nextNumber).padStart(6, "0");




}




function queueStockMovement(transaction, pendingSyncReason) {




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
        pendingSyncReason: pendingSyncReason || "offline",
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




