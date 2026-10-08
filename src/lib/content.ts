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

export type Caption = { n: number; en: string; es: string; d: number };

export type Catalog = { version: number; levels: Level[]; books: Book[] };

export const MEDIA_BASE_URL = (
  import.meta.env.VITE_MEDIA_BASE_URL || 'https://speakalone.s3.us-east-1.amazonaws.com'
).replace(/\/$/, '');

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

export function audioUrl(book: Book, n: number): string {
  return `${MEDIA_BASE_URL}/audio/${book.path}/${n}.mp3`;
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
