import type { StatisticsDocument } from "./workspace-types";
const DB = "mathroom-statistics-workspaces";
export type SavedWork = {
  id: string;
  title: string;
  updatedAt: string;
  document: StatisticsDocument;
};
let database: Promise<IDBDatabase> | undefined;
function openDb() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("works", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
export async function readWorks(): Promise<SavedWork[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("works", "readonly")
      .objectStore("works")
      .getAll();
    request.onsuccess = () => resolve(request.result as SavedWork[]);
    request.onerror = () => reject(request.error);
  });
}
export async function saveWork(work: SavedWork): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("works", "readwrite");
    transaction.objectStore("works").put(work);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
