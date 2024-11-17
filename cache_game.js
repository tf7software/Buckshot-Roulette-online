/* © - 2024 tf7software */
async function fetchAndCacheIndexedDB(url, key) {
    const dbPromise = indexedDB.open("gameCache", 1);

    // Set up the database schema
    dbPromise.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains("files")) {
            db.createObjectStore("files");
        }
    };

    // Wait for the database to open
    const db = await new Promise((resolve, reject) => {
        dbPromise.onsuccess = (event) => resolve(event.target.result);
        dbPromise.onerror = () => reject("Failed to open IndexedDB.");
    });

    // Check if the file is already cached
    const transaction = db.transaction("files", "readonly");
    const store = transaction.objectStore("files");
    const cachedBlob = await new Promise((resolve) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });

    if (cachedBlob) {
        console.log(`${key} loaded from IndexedDB`);
        return cachedBlob;
    } else {
        // If not cached, fetch from the server and store it
        console.log(`Fetching ${key} from server...`);
        const response = await fetch(url);
        const blob = await response.blob();

        const writeTransaction = db.transaction("files", "readwrite");
        writeTransaction.objectStore("files").put(blob, key);
        await new Promise((resolve) => (writeTransaction.oncomplete = resolve));

        return blob;
    }
}

(async function () {
    try {
        // Cache the PCK and WASM files
        const pckFile = await fetchAndCacheIndexedDB("index.pck", "index_pck");
        const wasmFile = await fetchAndCacheIndexedDB("index.wasm", "index_wasm");

        // Ensure GODOT_CONFIG is globally defined
        if (typeof GODOT_CONFIG === "undefined") {
            console.error("GODOT_CONFIG is not defined. Make sure it is available globally.");
            return;
        }

        // Initialize the Godot engine
        const engine = new Engine(GODOT_CONFIG);

        engine.startGame({
            pck: URL.createObjectURL(pckFile),
            wasm: URL.createObjectURL(wasmFile),
            onProgress: function (current, total) {
                const statusProgressInner = document.getElementById("status-progress-inner");
                if (total > 0) {
                    statusProgressInner.style.width = `${(current / total) * 100}%`;
                }
            }
        }).then(() => {
            console.log("Game started successfully");
        }).catch((err) => {
            console.error("Error starting game:", err);
        });
    } catch (error) {
        console.error("Error in caching or game initialization:", error);
    }
})();
