/** IndexedDB read/write transactions serialize same-origin writers, including LAN HTTP.
 * The callback is synchronous: all localStorage checks/writes finish while the mutex
 * transaction is active. No lease timeout can let a suspended tab resume as a writer.
 */
let database: Promise<IDBDatabase> | undefined;
let writerActive = false;
export const hasStorageTransaction = () => writerActive;
export function storageTransaction<T>(operation: () => T): Promise<T> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('first-export-storage-mutex', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('mutex');
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error('存档协调暂不可用'));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
  });
  return database.then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction('mutex', 'readwrite');
        const request = transaction.objectStore('mutex').get('writer');
        let result: T;
        let failure: unknown;
        request.onsuccess = () => {
          try {
            writerActive = true;
            result = operation();
          } catch (cause) {
            failure = cause;
            transaction.abort();
          } finally {
            writerActive = false;
          }
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error);
      }),
  );
}

/** Per-instance queue also orders rapid input/checkbox events before reading state. */
export function serialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => T | Promise<T>): Promise<T> => {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
}
