"use client";

import { useCallback, useSyncExternalStore } from "react";

type StoredValueSetter<T> = T | ((current: T) => T);

const storageEventName = "family-manager:local-storage";
const cache = new Map<string, { raw: string | null; value: unknown }>();

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
): [T, (nextValue: StoredValueSetter<T>) => void] {
  const snapshot = useSyncExternalStore(
    subscribeToLocalStorage,
    () => readLocalStorage(key, fallback),
    () => fallback,
  );

  const setValue = useCallback(
    (nextValue: StoredValueSetter<T>) => {
      const current = readLocalStorage(key, fallback);
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (current: T) => T)(current)
          : nextValue;

      window.localStorage.setItem(key, JSON.stringify(resolvedValue));
      cache.delete(key);
      window.dispatchEvent(new Event(storageEventName));
    },
    [fallback, key],
  );

  return [snapshot, setValue];
}

function subscribeToLocalStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(storageEventName, callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(storageEventName, callback);
  };
}

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  const cached = cache.get(key);

  if (cached && cached.raw === raw) {
    return cached.value as T;
  }

  if (!raw) {
    cache.set(key, {
      raw,
      value: fallback,
    });
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    const value =
      Array.isArray(fallback) || typeof fallback !== "object" || fallback === null
        ? parsed
        : {
            ...fallback,
            ...parsed,
          };

    cache.set(key, {
      raw,
      value,
    });

    return value;
  } catch {
    window.localStorage.removeItem(key);
    cache.delete(key);
    return fallback;
  }
}
