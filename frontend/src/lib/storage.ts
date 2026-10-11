/** Move existing browser preferences to Espada keys on the same origin. */
export function readStoredValue(key: string, legacyKey: string): string | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem(key);
  const value = current ?? localStorage.getItem(legacyKey);
  if (value !== null && current === null) localStorage.setItem(key, value);
  localStorage.removeItem(legacyKey);
  return value;
}
