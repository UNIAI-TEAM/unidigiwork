/**
 * Kho dữ liệu ngoại tuyến cho PWA (IndexedDB).
 * - `cache`: ảnh chụp dữ liệu đọc (công việc, góp ý, Work Graph) để mở được khi mất mạng.
 * - `queue`: hàng đợi thao tác người dùng thực hiện khi ngoại tuyến, gửi lại khi có mạng.
 */
import { openDB, type IDBPDatabase } from "idb";

export type CachedEntry = {
  hash: string;
  key: unknown[];
  data: unknown;
  updatedAt: number;
};

export type QueuedMutation = {
  id: string;
  kind: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

const DB_NAME = "uniwork-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache", { keyPath: "hash" });
        if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function putCache(entry: CachedEntry) {
  const db = await getDb();
  if (!db) return;
  await db.put("cache", entry);
}

export async function readCache(): Promise<CachedEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return (await db.getAll("cache")) as CachedEntry[];
}

export async function clearCache() {
  const db = await getDb();
  if (!db) return;
  await db.clear("cache");
}

export async function pushQueue(item: QueuedMutation) {
  const db = await getDb();
  if (!db) return;
  await db.put("queue", item);
}

export async function readQueue(): Promise<QueuedMutation[]> {
  const db = await getDb();
  if (!db) return [];
  const all = (await db.getAll("queue")) as QueuedMutation[];
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function removeQueued(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete("queue", id);
}

export async function updateQueued(item: QueuedMutation) {
  const db = await getDb();
  if (!db) return;
  await db.put("queue", item);
}
