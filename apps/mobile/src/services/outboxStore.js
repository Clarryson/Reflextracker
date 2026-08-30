/**
 * IndexedDB-backed Outbox Mutation Store for offline-first reliability.
 * Stores pending status updates, photo proof submissions, and location telemetry.
 */

const DB_NAME = 'reflex_rider_db';
const DB_VERSION = 1;

/**
 * Check if IndexedDB is available in this browser/environment.
 * Returns false in private browsing, unsupported browsers, or disabled by user.
 */
export function supportsIndexedDB() {
  try {
    // Check if IndexedDB is available
    const indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB;
    if (!indexedDB) return false;

    // Try to open a test database to verify it's truly available
    const test = indexedDB.open('__test_db_' + Date.now());
    let isSupported = true;
    
    test.onerror = () => {
      isSupported = false;
    };
    
    test.onsuccess = () => {
      indexedDB.deleteDatabase('__test_db_' + Date.now());
    };

    return isSupported;
  } catch (error) {
    // Errors in private mode, quota exceeded, or security restrictions
    console.warn('IndexedDB support check failed:', error.message);
    return false;
  }
}

/**
 * In-memory fallback queue for when IndexedDB is unavailable.
 */
const inMemoryQueue = {
  mutations: [],
  
  add(mutation) {
    this.mutations.push(mutation);
    // Keep queue size bounded (max 50 items to prevent memory bloat)
    if (this.mutations.length > 50) {
      this.mutations.shift();
    }
    return this.mutations.length;
  },
  
  getAll() {
    return [...this.mutations];
  },
  
  remove(index) {
    this.mutations.splice(index, 1);
  },
  
  count() {
    return this.mutations.length;
  },
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('deliveries')) {
        db.createObjectStore('deliveries', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('telemetry')) {
        db.createObjectStore('telemetry', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Queue a mutation into the outbox for background sync.
 * Falls back to in-memory queue if IndexedDB is unavailable.
 */
export async function queueMutation({ url, method = 'POST', headers = {}, body = null }) {
  const mutation = {
    url,
    method,
    headers,
    body,
    createdAt: new Date().toISOString(),
    attempts: 0,
    idempotencyKey: 'mut_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
  };

  if (!supportsIndexedDB()) {
    console.warn('IndexedDB unavailable - using in-memory queue');
    inMemoryQueue.add(mutation);
    return { success: true, offline: 'memory' };
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.add(mutation);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn('Failed to queue mutation in IndexedDB, using memory fallback');
        inMemoryQueue.add(mutation);
        reject(req.error);
      };
    });
  } catch (error) {
    console.warn('IndexedDB queue failed, using in-memory fallback:', error.message);
    inMemoryQueue.add(mutation);
    return { success: true, offline: 'memory' };
  }
}

/**
 * Get all pending mutations in FIFO order.
 */
export async function getPendingMutations() {
  if (!supportsIndexedDB()) {
    return inMemoryQueue.getAll();
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        console.warn('Failed to get mutations from IndexedDB, using memory');
        resolve(inMemoryQueue.getAll());
      };
    });
  } catch (error) {
    console.warn('Error reading from IndexedDB:', error.message);
    return inMemoryQueue.getAll();
  }
}

/**
 * Remove a mutation by ID after successful sync.
 */
export async function removeMutation(id) {
  if (!supportsIndexedDB()) {
    const idx = inMemoryQueue.mutations.findIndex(m => m.id === id);
    if (idx >= 0) inMemoryQueue.remove(idx);
    return;
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      const store = tx.objectStore('outbox');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => {
        console.warn('Failed to remove mutation from IndexedDB');
        const idx = inMemoryQueue.mutations.findIndex(m => m.id === id);
        if (idx >= 0) inMemoryQueue.remove(idx);
        reject(req.error);
      };
    });
  } catch (error) {
    console.warn('Error removing from IndexedDB:', error.message);
    const idx = inMemoryQueue.mutations.findIndex(m => m.id === id);
    if (idx >= 0) inMemoryQueue.remove(idx);
  }
}

/**
 * Count how many mutations are waiting to sync.
 */
export async function countPendingMutations() {
  if (!supportsIndexedDB()) {
    return inMemoryQueue.count();
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readonly');
      const store = tx.objectStore('outbox');
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => {
        console.warn('Failed to count mutations, using memory');
        resolve(inMemoryQueue.count());
      };
    });
  } catch (error) {
    console.warn('Error counting from IndexedDB:', error.message);
    return inMemoryQueue.count();
  }
}

/**
 * Cache deliveries locally for instant offline loading.
 */
export async function cacheDeliveries(deliveries) {
  if (!Array.isArray(deliveries)) return;
  const db = await openDB();
  const tx = db.transaction('deliveries', 'readwrite');
  const store = tx.objectStore('deliveries');
  deliveries.forEach((d) => store.put(d));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieve all cached deliveries from IndexedDB.
 */
export async function getCachedDeliveries() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('deliveries', 'readonly');
    const store = tx.objectStore('deliveries');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Update the local status of a cached delivery (optimistic update).
 */
export async function updateCachedDeliveryStatus(deliveryId, status, extraFields = {}) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('deliveries', 'readwrite');
    const store = tx.objectStore('deliveries');
    const getReq = store.get(deliveryId);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        const updated = { ...record, status, ...extraFields, updatedAt: new Date().toISOString() };
        store.put(updated);
        resolve(updated);
      } else {
        resolve(null);
      }
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Flush all pending outbox mutations sequentially.
 */
export async function flushOutbox(customFetch = fetch) {
  const pending = await getPendingMutations();
  if (pending.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  for (const mutation of pending) {
    try {
      const options = {
        method: mutation.method,
        headers: {
          'Content-Type': 'application/json',
          'x-idempotency-key': mutation.idempotencyKey,
          ...(mutation.headers || {}),
        },
      };

      if (mutation.body) {
        options.body = typeof mutation.body === 'string' ? mutation.body : JSON.stringify(mutation.body);
      }

      const res = await customFetch(mutation.url, options);
      if (res.ok || res.status === 409) {
        // 2xx or 409 (Already transitioned / idempotent duplicate)
        await removeMutation(mutation.id);
        flushed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
      break; // Stop flushing if network drops again
    }
  }

  return { flushed, failed };
}