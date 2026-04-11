/**
 * IndexedDB-backed offline chunk queue for huddle recording.
 * When chunk uploads fail (network loss), chunks are queued here
 * and drained when connectivity returns.
 */

const DB_NAME = 'ehrc_huddle_queue';
const DB_VERSION = 1;
const STORE_NAME = 'chunks';

export interface QueuedChunk {
  id?: number; // auto-incremented
  huddle_id: string;
  chunk_index: number;
  recording_session_id: string;
  mime_type: string;
  blob: Blob;
  queued_at: number; // timestamp
  retry_count: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('huddle_id', 'huddle_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueChunk(chunk: Omit<QueuedChunk, 'id'>): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(chunk);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getQueuedChunks(huddleId?: string): Promise<QueuedChunk[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let req: IDBRequest;
    if (huddleId) {
      const index = store.index('huddle_id');
      req = index.getAll(huddleId);
    } else {
      req = store.getAll();
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function removeChunk(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/**
 * Drain the offline queue by uploading each chunk with exponential backoff.
 * Returns the number of successfully uploaded chunks.
 */
export async function drainQueue(
  onProgress?: (uploaded: number, remaining: number) => void
): Promise<number> {
  const chunks = await getQueuedChunks();
  if (chunks.length === 0) return 0;

  // Sort by chunk_index to upload in order
  chunks.sort((a, b) => a.chunk_index - b.chunk_index);

  let uploaded = 0;
  for (const chunk of chunks) {
    const maxRetries = 3;
    let success = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const formData = new FormData();
        formData.append('audio', chunk.blob);
        formData.append('chunk_index', String(chunk.chunk_index));
        formData.append('recording_session_id', chunk.recording_session_id);
        formData.append('mime_type', chunk.mime_type);

        const res = await fetch(`/api/huddle/${chunk.huddle_id}/chunk`, {
          method: 'POST',
          body: formData,
        });

        if (res.ok || res.status === 409) {
          // 409 = duplicate chunk, treat as success
          await removeChunk(chunk.id!);
          uploaded++;
          success = true;
          onProgress?.(uploaded, chunks.length - uploaded);
          break;
        }
      } catch {
        // Network still down or server error
      }

      // Exponential backoff: 1s, 2s, 4s
      if (attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }

    if (!success) {
      // Stop draining if we still can't upload (still offline)
      break;
    }
  }

  return uploaded;
}
