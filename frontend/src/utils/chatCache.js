/**
 * PairUP Offline-First Chat Cache
 * Two-tier architecture:
 *   L1: O(1) In-Memory LRU Cache (Map, bounded to 40 conversations)
 *   L2: IndexedDB persistent store (with graceful fallback when unavailable)
 *
 * Keeps rooms, direct conversations, and recent message histories cached locally
 * so switching chats renders instantly (0ms) and avoids redundant backend calls.
 */

const DB_NAME = "pairup_offline_cache_v1";
const DB_VERSION = 1;
const STORE_MESSAGES = "messages";
const STORE_META = "meta";

const MAX_LRU_CHATS = 40;
const MAX_CACHED_MESSAGES_PER_CHAT = 200;
export const CHAT_CACHE_TTL_MS = 60 * 1000; // 60s fresh window; WS keeps cache live

// O(1) LRU Cache using JS Map insertion order
class LRUCache {
  constructor(limit = MAX_LRU_CHATS) {
    this.limit = limit;
    this.map = new Map();
  }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val);
    return val;
  }

  set(key, value) {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.limit) {
      const oldestKey = this.map.keys().next().value;
      this.map.delete(oldestKey);
    }
    this.map.set(key, value);
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

const memoryMessagesLRU = new LRUCache(MAX_LRU_CHATS);
const memoryMeta = new Map();
let dbPromise = null;

function openCacheDB() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          db.createObjectStore(STORE_MESSAGES, { keyPath: "chatKey" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return dbPromise;
}

function idbGet(storeName, key) {
  return openCacheDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readonly");
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

function idbPut(storeName, record) {
  return openCacheDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

function idbDelete(storeName, key) {
  return openCacheDB().then((db) => {
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  });
}

export function buildChatKey(type, id) {
  return `${type}:${type === "room" ? String(id || "").toLowerCase() : String(id || "")}`;
}

export async function getCachedMessages(chatKey) {
  const mem = memoryMessagesLRU.get(chatKey);
  if (mem) {
    return {
      messages: mem.messages,
      fetchedAt: mem.fetchedAt,
      isFresh: Date.now() - mem.fetchedAt < CHAT_CACHE_TTL_MS,
    };
  }

  const record = await idbGet(STORE_MESSAGES, chatKey);
  if (record && Array.isArray(record.messages)) {
    memoryMessagesLRU.set(chatKey, {
      messages: record.messages,
      fetchedAt: record.fetchedAt || 0,
    });
    return {
      messages: record.messages,
      fetchedAt: record.fetchedAt || 0,
      isFresh: Date.now() - (record.fetchedAt || 0) < CHAT_CACHE_TTL_MS,
    };
  }

  return null;
}

export async function setCachedMessages(chatKey, messages) {
  const trimmed = Array.isArray(messages)
    ? messages.slice(-MAX_CACHED_MESSAGES_PER_CHAT)
    : [];
  const entry = {
    chatKey,
    messages: trimmed,
    fetchedAt: Date.now(),
  };
  memoryMessagesLRU.set(chatKey, {
    messages: trimmed,
    fetchedAt: entry.fetchedAt,
  });
  await idbPut(STORE_MESSAGES, entry);
}

export async function appendCachedMessage(chatKey, message) {
  if (!chatKey || !message) return;
  const existing = await getCachedMessages(chatKey);
  if (!existing) return; // Don't create partial cache before initial history load

  const prev = existing.messages || [];
  if (message.id && prev.some((m) => m.id === message.id)) {
    return;
  }
  const next = [...prev, message].slice(-MAX_CACHED_MESSAGES_PER_CHAT);
  const entry = {
    chatKey,
    messages: next,
    fetchedAt: Date.now(),
  };
  memoryMessagesLRU.set(chatKey, {
    messages: next,
    fetchedAt: entry.fetchedAt,
  });
  await idbPut(STORE_MESSAGES, entry);
}

export async function deleteCachedMessages(chatKey) {
  memoryMessagesLRU.delete(chatKey);
  await idbDelete(STORE_MESSAGES, chatKey);
}

export async function getCachedMeta(key) {
  if (memoryMeta.has(key)) return memoryMeta.get(key);
  const record = await idbGet(STORE_META, key);
  if (record && record.value !== undefined) {
    memoryMeta.set(key, record.value);
    return record.value;
  }
  return null;
}

export async function setCachedMeta(key, value) {
  memoryMeta.set(key, value);
  await idbPut(STORE_META, { key, value, updatedAt: Date.now() });
}

export async function clearAllChatCache() {
  memoryMessagesLRU.clear();
  memoryMeta.clear();
  const db = await openCacheDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_MESSAGES, STORE_META], "readwrite");
      tx.objectStore(STORE_MESSAGES).clear();
      tx.objectStore(STORE_META).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
