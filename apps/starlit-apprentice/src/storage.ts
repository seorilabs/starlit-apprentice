import {
  COLLECTION_STORAGE_KEY,
  RUN_STORAGE_KEY,
  loadCollection,
  loadRun,
  serializeCollection,
  serializeRun
} from "@starlit-apprentice/product-core";
import type { EndingCode, RunState } from "@starlit-apprentice/product-core";

export interface StorageLoadResult {
  run: RunState | null;
  collection: EndingCode[];
  warning?: string;
}

export function loadStorageState(): StorageLoadResult {
  let run: RunState | null = null;
  let collection: EndingCode[] = [];
  let warning: string | undefined;

  try {
    const runRaw = localStorage.getItem(RUN_STORAGE_KEY);
    run = runRaw ? loadRun(runRaw) : null;
  } catch {
    warning = "일부 저장 데이터를 읽지 못해 유효한 기록만 복구했습니다.";
  }

  try {
    const collectionRaw = localStorage.getItem(COLLECTION_STORAGE_KEY);
    collection = collectionRaw ? loadCollection(collectionRaw) : [];
  } catch {
    warning = "일부 저장 데이터를 읽지 못해 유효한 기록만 복구했습니다.";
  }

  return { run, collection, warning };
}

export function saveRun(run: RunState): string | undefined {
  try {
    localStorage.setItem(RUN_STORAGE_KEY, serializeRun(run));
    return undefined;
  } catch {
    return "로컬 저장 공간에 진행 상황을 저장하지 못했습니다.";
  }
}

export function saveCollection(endings: EndingCode[]): string | undefined {
  try {
    localStorage.setItem(COLLECTION_STORAGE_KEY, serializeCollection(endings));
    return undefined;
  } catch {
    return "로컬 저장 공간에 도감 정보를 저장하지 못했습니다.";
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in embedded previews.
  }
}

export function clearAllStorage(): string | undefined {
  const runCleared = clearStorageKey(RUN_STORAGE_KEY, "");
  const collectionCleared = clearStorageKey(COLLECTION_STORAGE_KEY, serializeCollection([]));
  return runCleared && collectionCleared ? undefined : "로컬 저장 공간의 일부 기록을 완전히 삭제하지 못했습니다.";
}

function clearStorageKey(key: string, fallbackValue: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    try {
      localStorage.setItem(key, fallbackValue);
      return true;
    } catch {
      return false;
    }
  }
}
