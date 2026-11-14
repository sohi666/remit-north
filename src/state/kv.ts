import Storage from 'expo-sqlite/kv-store';

/** Synchronous key-value storage (SQLite-backed on device; backed up by iCloud / Android Auto Backup). */
export const kv = {
  get(key: string): string | null {
    try {
      return Storage.getItemSync(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      Storage.setItemSync(key, value);
    } catch {
      // Storage full or unavailable: progress stays in memory for this session.
    }
  },
};
