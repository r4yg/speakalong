export type Level = { id: number; name: string; index: number };

export type Book = {
  id: number;
  title: string;
  levelId: number;
  path: string;
  cover: string;
  captions: number;
  words: number;
  minutes: number;
};

/** n: line number, en/es: text, d: nominal duration, s/e: segment in the book's audio file (seconds). */
export type Caption = { n: number; en: string; es: string; d: number; s?: number; e?: number };

export type Catalog = { version: number; levels: Level[]; books: Book[] };

// CEFR equivalent for each level index (0..6).
export const CEFR = ['A0', 'A1', 'A2', 'B1', 'B1+', 'B2', 'C1'];

let catalogPromise: Promise<Catalog> | null = null;
const bookCache = new Map<number, Promise<Caption[]>>();

export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch('./content/catalog.json').then((r) => {
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    return r.json();
  });
  return catalogPromise;
}

export function loadCaptions(bookId: number): Promise<Caption[]> {
  let p = bookCache.get(bookId);
  if (!p) {
    p = fetch(`./content/books/${bookId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`book ${r.status}`);
        return r.json();
      })
      .then((data: { captions: Caption[] }) => data.captions);
    p.catch(() => bookCache.delete(bookId));
    bookCache.set(bookId, p);
  }
  return p;
}

export function coverUrl(book: Book): string {
  return `./covers/${book.cover.replace(/\.png$/, '.webp')}`;
}

/** The whole book's audio ships with the app; nothing is streamed. */
export function bookAudioUrl(book: Book): string {
  return `./audio/${book.id}.webm`;
}

export function lineLength(c: Caption): number {
  return c.s != null && c.e != null ? c.e - c.s : c.d;
}

/** Normalise a clicked token into a dictionary word. */
export function cleanWord(token: string): string {
  return token
    .toLowerCase()
    .replace(/[“”"«»()[\]{}]/g, '')
    .replace(/^['’‘`´]+|['’‘`´]+$/g, '')
    .replace(/[.,!?;:…—–-]+$/g, '')
    .replace(/^[.,!?;:…—–-]+/g, '')
    .trim();
}
