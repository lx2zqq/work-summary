const STORAGE_KEY = "work-summary:selected-date-v1";

let selectedDate: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function loadFromStorage() {
  if (loaded || !isBrowser()) return;
  loaded = true;

  try {
    selectedDate = window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    selectedDate = null;
  }
}

export function subscribeSelectedDate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSelectedDate(): string | null {
  loadFromStorage();
  return selectedDate;
}

export function getSelectedDateServerSnapshot(): null {
  return null;
}

/** 切换日期时同步，让“今日复盘”入口带回当前日期 */
export function setSelectedDate(date: string): void {
  loadFromStorage();

  if (selectedDate === date) return;

  selectedDate = date;

  if (isBrowser()) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, date);
    } catch {
      // 浏览器禁用存储时只保留内存状态
    }
  }

  for (const listener of listeners) listener();
}
