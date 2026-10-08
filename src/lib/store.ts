import { useSyncExternalStore } from 'react';

// Everything the app remembers lives here, on the user's own device.
// There is no account and nothing is ever sent to a server.

export type Lang = 'es' | 'en';
export type Theme = 'system' | 'light' | 'dark';
export type TranslationMode = 'show' | 'reveal' | 'hide';

export type Settings = {
  lang: Lang;
  theme: Theme;
  translation: TranslationMode;
  rate: number;
  autoAdvance: boolean;
  repeatTwice: boolean;
  pauseToRepeat: boolean;
};

export type BookProgress = {
  caption: number; // caption number (n) the reader is on
  total: number;
  completed: boolean;
  updatedAt: number;
};

export type SavedWord = {
  id: string;
  word: string;
  note: string;
  bookId: number;
  caption: number;
  en: string;
  es: string;
  createdAt: number;
};

export type State = {
  version: 1;
  settings: Settings;
  progress: Record<string, BookProgress>;
  words: SavedWord[];
  lastBookId: number | null;
};

const KEY = 'speakalong:v1';

function defaultLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function defaultState(): State {
  return {
    version: 1,
    settings: {
      lang: defaultLang(),
      theme: 'system',
      translation: 'show',
      rate: 1,
      autoAdvance: true,
      repeatTwice: false,
      pauseToRepeat: false,
    },
    progress: {},
    words: [],
    lastBookId: null,
  };
}

function normalise(raw: unknown): State {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<State>;
  return {
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}) },
    progress: r.progress && typeof r.progress === 'object' ? r.progress : {},
    words: Array.isArray(r.words) ? r.words : [],
    lastBookId: typeof r.lastBookId === 'number' ? r.lastBookId : null,
  };
}

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalise(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

let state: State = read();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable (private mode, quota); keep working in memory.
  }
  listeners.forEach((l) => l());
}

export function setState(update: (s: State) => State) {
  state = update(state);
  emit();
}

export function getState(): State {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ---- Actions ---------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

export function saveProgress(bookId: number, caption: number, total: number, index: number) {
  setState((s) => {
    const prev = s.progress[bookId];
    const completed = (prev?.completed ?? false) || index >= total - 1;
    return {
      ...s,
      lastBookId: bookId,
      progress: { ...s.progress, [bookId]: { caption, total, completed, updatedAt: Date.now() } },
    };
  });
}

export function resetBookProgress(bookId: number) {
  setState((s) => {
    const progress = { ...s.progress };
    delete progress[bookId];
    return { ...s, progress };
  });
}

export function addWord(w: Omit<SavedWord, 'id' | 'createdAt'>) {
  setState((s) => {
    const existing = s.words.find((x) => x.word === w.word && x.bookId === w.bookId && x.caption === w.caption);
    if (existing) {
      return { ...s, words: s.words.map((x) => (x === existing ? { ...x, note: w.note || x.note } : x)) };
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    return { ...s, words: [{ ...w, id, createdAt: Date.now() }, ...s.words] };
  });
}

export function updateWordNote(id: string, note: string) {
  setState((s) => ({ ...s, words: s.words.map((w) => (w.id === id ? { ...w, note } : w)) }));
}

export function removeWord(id: string) {
  setState((s) => ({ ...s, words: s.words.filter((w) => w.id !== id) }));
}

export function exportData(): string {
  return JSON.stringify({ app: 'speakalong', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importData(json: string): boolean {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || parsed.app !== 'speakalong') return false;
    state = normalise(parsed);
    emit();
    return true;
  } catch {
    return false;
  }
}

export function resetAll() {
  const lang = state.settings.lang;
  state = defaultState();
  state.settings.lang = lang;
  emit();
}
