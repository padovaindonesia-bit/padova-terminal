const APPS_SCRIPT_URLS = {
    attendance: "https://script.google.com/macros/s/AKfycbzq0jysQ1_vrEG3empyB0ldi3y4zMMPLxUgiU5UERKLSklCkqV2k84mMLdtBLFppx48/exec",
    inventory: "https://script.google.com/macros/s/AKfycbyflKhUe5VCoR3m9FJnlIQRp5BeQBXmKywBC2lhGniO3VMHiO7UZ0kCrjONFmv_6gor0g/exec"
};
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
const QUANTITY_STEPS = [1, 10, 100];
const QR_SCAN_DELAY_MS = 250;
const STOCK_INVALID_QR_DELAY_MS = 2000;
const DUPLICATE_SCAN_DELAY_MS = 1500;
const MESSAGE_DISPLAY_DELAY_MS = 2000;
const COUNTDOWN_DELAY_MS = 300;
const SUCCESS_MESSAGE_DURATION_MS = 2000;
const SHEETS_REQUEST_TIMEOUT_MS = 5000;
const SHEETS_WRITE_FALLBACK_TIMEOUT_MS = 3000;


