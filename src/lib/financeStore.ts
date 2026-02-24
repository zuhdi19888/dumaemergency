export type FinanceEntryType = 'income' | 'expense';

export interface FinanceEntry {
  id: string;
  type: FinanceEntryType;
  amount: number;
  category: string;
  description: string;
  date: string;
  notes?: string;
  createdAt: string;
}

const STORAGE_KEY = 'duma_finance_entries_v1';

const fallbackEntries: FinanceEntry[] = [];

function safeParse(value: string | null): FinanceEntry[] {
  if (!value) return fallbackEntries;
  try {
    const parsed = JSON.parse(value) as FinanceEntry[];
    if (!Array.isArray(parsed)) return fallbackEntries;
    return parsed;
  } catch {
    return fallbackEntries;
  }
}

function persist(entries: FinanceEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function getFinanceEntries(): FinanceEntry[] {
  const entries = safeParse(localStorage.getItem(STORAGE_KEY));
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getFinanceEntriesByType(type: FinanceEntryType): FinanceEntry[] {
  return getFinanceEntries().filter((entry) => entry.type === type);
}

export function addFinanceEntry(
  payload: Omit<FinanceEntry, 'id' | 'createdAt'>,
): FinanceEntry {
  const entries = getFinanceEntries();
  const entry: FinanceEntry = {
    ...payload,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  entries.push(entry);
  persist(entries);
  return entry;
}

export function deleteFinanceEntry(id: string): void {
  const entries = getFinanceEntries().filter((entry) => entry.id !== id);
  persist(entries);
}

export function getFinanceTotals() {
  const entries = getFinanceEntries();
  const totalIncome = entries
    .filter((entry) => entry.type === 'income')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalExpenses = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);
  return {
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
  };
}

export function getFinanceCategoryBreakdown(type: FinanceEntryType) {
  const map = new Map<string, number>();
  for (const entry of getFinanceEntriesByType(type)) {
    map.set(entry.category, (map.get(entry.category) ?? 0) + entry.amount);
  }
  return Array.from(map.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}
