// Downloads the per-book audio files (one Opus file per book, ~700 MB in total)
// from the `audio-v1` GitHub release into public/audio/. They are kept out of git
// and bundled into the app at build time, so the app never streams anything.
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const BASE = process.env.AUDIO_BASE_URL || 'https://github.com/r4yg/speakalong/releases/download/audio-v1';
const dir = new URL('../public/audio/', import.meta.url);
mkdirSync(dir, { recursive: true });

const { books } = JSON.parse(readFileSync(new URL('../public/content/catalog.json', import.meta.url), 'utf8'));
const queue = books.map((b) => b.id);
let done = 0;

async function fetchOne(id) {
  const target = new URL(`${id}.webm`, dir);
  if (existsSync(target) && statSync(target).size > 0) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${BASE}/${id}.webm`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const part = new URL(`${id}.webm.part`, dir);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
      renameSync(part, target);
      return;
    } catch (err) {
      if (attempt >= 4) throw new Error(`audio ${id}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (queue.length) {
      await fetchOne(queue.shift());
      process.stdout.write(`\raudio ${++done}/${books.length}`);
    }
  }),
);
console.log('\naudio ready in public/audio/');
