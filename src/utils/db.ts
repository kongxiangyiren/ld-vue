const DB_NAME = 'ld-vue-images';
const STORE_NAME = 'generations';
const DB_VERSION = 1;

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return databasePromise;
}

function toPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut<T>(value: T) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  await toPromise(store.put(value));
}

export async function dbAll<T>() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const store = transaction.objectStore(STORE_NAME);
  return toPromise<T[]>(store.getAll());
}

export async function dbDelete(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  await toPromise(store.delete(key));
}

export async function dbClear() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  await toPromise(store.clear());
}
