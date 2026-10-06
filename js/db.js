/* Habitat — IndexedDB file storage.
 *
 * Stores photo blobs and arbitrary files in IndexedDB so they survive
 * localStorage quota limits and can handle larger files. The Store object
 * keeps metadata in localStorage (fast queries) while the binary data
 * lives here.
 *
 * Database: habitat-files (version 1)
 * Object stores:
 *   photos  — { id, propertyId, taskId, uploaderId, blob, caption, lat, lng, kind, createdAt }
 *   files   — { id, propertyId, uploaderId, blob, name, mimeType, size, createdAt }
 */
"use strict";

const DB_NAME = "habitat-files";
const DB_VERSION = 1;

let _db = null;

/* ------------------------------------------------------------- lifecycle */
export function initDB() {
  return new Promise((resolve, reject) => {
    if (_db) { resolve(_db); return; }
    if (!("indexedDB" in window)) {
      reject(new Error("indexeddb_unsupported"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("photos")) {
        const s = db.createObjectStore("photos", { keyPath: "id" });
        s.createIndex("propertyId", "propertyId", { unique: false });
        s.createIndex("taskId", "taskId", { unique: false });
        s.createIndex("uploaderId", "uploaderId", { unique: false });
      }
      if (!db.objectStoreNames.contains("files")) {
        const s = db.createObjectStore("files", { keyPath: "id" });
        s.createIndex("propertyId", "propertyId", { unique: false });
        s.createIndex("uploaderId", "uploaderId", { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => { reject(e.target.error); };
  });
}

function _tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = _db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && result._val !== undefined ? result._val : result);
    t.onerror = (e) => reject(e.target.error);
    t.onabort = (e) => reject(e.target.error);
  });
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/* -------------------------------------------------------------- photos */
export async function putPhoto(record) {
  await initDB();
  const r = { ...record, blob: record.blob || null };
  return _tx("photos", "readwrite", (s) => { s.put(r); });
}

export async function getPhoto(id) {
  await initDB();
  return _tx("photos", "readonly", (s) => _req(s.get(id)));
}

export async function deletePhoto(id) {
  await initDB();
  return _tx("photos", "readwrite", (s) => { s.delete(id); });
}

export async function getPhotosForProperty(propertyId) {
  await initDB();
  return _tx("photos", "readonly", (s) => {
    const idx = s.index("propertyId");
    return _req(idx.getAll(propertyId));
  });
}

export async function getPhotosForTask(taskId) {
  await initDB();
  return _tx("photos", "readonly", (s) => {
    const idx = s.index("taskId");
    return _req(idx.getAll(taskId));
  });
}

export async function getAllPhotos() {
  await initDB();
  return _tx("photos", "readonly", (s) => _req(s.getAll()));
}

export async function getPhotosForUploader(uploaderId) {
  await initDB();
  return _tx("photos", "readonly", (s) => {
    const idx = s.index("uploaderId");
    return _req(idx.getAll(uploaderId));
  });
}

/* --------------------------------------------------------------- files */
export async function putFile(record) {
  await initDB();
  const r = { ...record, blob: record.blob || null };
  return _tx("files", "readwrite", (s) => { s.put(r); });
}

export async function getFile(id) {
  await initDB();
  return _tx("files", "readonly", (s) => _req(s.get(id)));
}

export async function deleteFile(id) {
  await initDB();
  return _tx("files", "readwrite", (s) => { s.delete(id); });
}

export async function getFilesForProperty(propertyId) {
  await initDB();
  return _tx("files", "readonly", (s) => {
    const idx = s.index("propertyId");
    return _req(idx.getAll(propertyId));
  });
}

export async function getAllFiles() {
  await initDB();
  return _tx("files", "readonly", (s) => _req(s.getAll()));
}

/* -------------------------------------------------------------- stats */
export async function storageEstimate() {
  await initDB();
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      return {
        bytes: est.usage || 0,
        mb: (est.usage || 0) / 1048576,
        limitMb: (est.quota || 0) / 1048576,
      };
    } catch { /* fall through */ }
  }
  // fallback: count blobs
  const photos = await getAllPhotos();
  const files = await getAllFiles();
  let bytes = 0;
  for (const p of photos) bytes += p.blob ? p.blob.size : 0;
  for (const f of files) bytes += f.blob ? f.blob.size : 0;
  return { bytes, mb: bytes / 1048576, limitMb: 100 };
}

/* -------------------------------------------------------------- helpers */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:(.*?);/)?.[1] || "application/octet-stream";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export async function clearAll() {
  await initDB();
  await _tx("photos", "readwrite", (s) => { s.clear(); });
  await _tx("files", "readwrite", (s) => { s.clear(); });
}
