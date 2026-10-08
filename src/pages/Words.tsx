import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Download, FileText, Search, Sparkles, Trash2 } from 'lucide-react';
import { removeWord, updateWordNote, useStore, type SavedWord } from '../lib/store';
import { useCatalog } from '../lib/useCatalog';
import { fmt, useT } from '../lib/i18n';
import { download } from '../lib/download';

function toCsv(words: SavedWord[], titles: Map<number, string>) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [['word', 'note', 'sentence', 'translation', 'book', 'line']];
  words.forEach((w) => rows.push([w.word, w.note, w.en, w.es, titles.get(w.bookId) ?? '', String(w.caption)]));
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}

async function toPdf(words: SavedWord[], titles: Map<number, string>, heading: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;

  pdf.setFont('helvetica', 'bold').setFontSize(22).text(heading, margin, y + 8);
  y += 30;
  pdf.setFont('helvetica', 'normal').setFontSize(10).setTextColor(120).text(`SpeakAlong · ${words.length}`, margin, y);
  y += 24;

  for (const w of words) {
    const sentence = pdf.splitTextToSize(w.en, width);
    const translation = w.es ? pdf.splitTextToSize(w.es, width) : [];
    const note = w.note ? pdf.splitTextToSize(w.note, width) : [];
    const height = 20 + (sentence.length + translation.length + note.length) * 13 + 22;
    if (y + height > bottom) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(20).text(w.word, margin, y + 12);
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(140).text(titles.get(w.bookId) ?? '', margin + width, y + 12, { align: 'right' });
    y += 22;
    pdf.setFontSize(10);
    if (note.length) {
      pdf.setTextColor(150, 90, 0).text(note, margin, y + 8);
      y += note.length * 13;
    }
    pdf.setTextColor(40).text(sentence, margin, y + 8);
    y += sentence.length * 13;
    if (translation.length) {
      pdf.setTextColor(120).text(translation, margin, y + 8);
      y += translation.length * 13;
    }
    y += 10;
    pdf.setDrawColor(225).line(margin, y, margin + width, y);
    y += 12;
  }
  pdf.save('speakalong-words.pdf');
}

export default function Words() {
  const t = useT();
  const words = useStore((s) => s.words);
  const { catalog } = useCatalog();
  const [query, setQuery] = useState('');
  const [bookId, setBookId] = useState<number | 'all'>('all');

  const titles = useMemo(() => new Map(catalog?.books.map((b) => [b.id, b.title]) ?? []), [catalog]);
  const books = useMemo(() => [...new Set(words.map((w) => w.bookId))], [words]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return words.filter(
      (w) => (bookId === 'all' || w.bookId === bookId) && (!q || w.word.includes(q) || w.note.toLowerCase().includes(q)),
    );
  }, [words, query, bookId]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-10">
      <header className="mb-8 flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">{t.words.title}</h1>
          <p className="mt-2 text-sm text-muted">{t.words.subtitle}</p>
        </div>
        {words.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => download('speakalong-words.csv', toCsv(shown, titles), 'text/csv')}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-muted"
            >
              <Download className="size-4" />
              {t.words.csv}
            </button>
            <button
              onClick={() => toPdf(shown, titles, t.words.title)}
              className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-muted"
            >
              <FileText className="size-4" />
              {t.words.pdf}
            </button>
          </div>
        )}
      </header>

      {words.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line px-6 py-20 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-mark-soft text-mark">
            <Sparkles className="size-5" />
          </div>
          <p className="font-medium">{t.words.empty}</p>
          <p className="mt-1 text-sm text-muted">{t.words.emptyHint}</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.words.search}
                className="w-full rounded-full border border-line bg-surface py-2 pr-4 pl-9 text-sm outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <select
              value={bookId}
              onChange={(e) => setBookId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none"
            >
              <option value="all">{t.words.allBooks}</option>
              {books.map((id) => (
                <option key={id} value={id}>
                  {titles.get(id) ?? id}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">{fmt(t.words.count, { n: shown.length })}</p>
          <ul className="flex flex-col gap-3">
            {shown.map((w) => (
              <WordRow key={w.id} word={w} title={titles.get(w.bookId) ?? ''} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function WordRow({ word: w, title }: { word: SavedWord; title: string }) {
  const t = useT();
  const [note, setNote] = useState(w.note);
  return (
    <li className="group rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-serif text-2xl font-semibold text-mark">{w.word}</h3>
        <span className="text-xs text-muted">{title}</span>
        <div className="ml-auto flex gap-1">
          <Link
            to={`/read/${w.bookId}?c=${w.caption}`}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-muted hover:bg-surface-2 hover:text-ink"
          >
            {t.words.open}
            <ArrowUpRight className="size-3.5" />
          </Link>
          <button onClick={() => removeWord(w.id)} title={t.words.remove} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== w.note && updateWordNote(w.id, note.trim())}
        placeholder={t.words.editNote}
        maxLength={300}
        className="mt-2 w-full border-b border-transparent bg-transparent pb-1 text-sm outline-none placeholder:text-muted/70 hover:border-line focus:border-accent"
      />
      <p className="mt-2 font-serif text-[15px] leading-relaxed">
        {w.en.split(/(\s+)/).map((tok, i) =>
          tok.toLowerCase().replace(/[^a-z'’-]/g, '').replace(/^['’]+|['’]+$/g, '') === w.word ? (
            <mark key={i} className="rounded bg-mark-soft px-0.5 text-ink">
              {tok}
            </mark>
          ) : (
            tok
          ),
        )}
      </p>
      {w.es && <p className="mt-1 text-sm text-muted">{w.es}</p>}
    </li>
  );
}
