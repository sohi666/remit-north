/** Web preview storage: localStorage when available, memory otherwise. */
const mem = new Map<string, string>();

export const kv = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return mem.get(key) ?? null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      mem.set(key, value);
    }
  },
};
