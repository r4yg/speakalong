import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Headphones, Search } from 'lucide-react';
import { CEFR, type Book, type Level } from '../lib/content';
import { useCatalog } from '../lib/useCatalog';
import { useStore, type BookProgress } from '../lib/store';
import { fmt, useT } from '../lib/i18n';
import Cover from '../components/Cover';
import Progress from '../components/Progress';

function percent(p?: BookProgress) {
  if (!p) return 0;
  if (p.completed) return 100;
  return p.total ? (p.caption / p.total) * 100 : 0;
}

function BookCard({ book, progress }: { book: Book; progress?: BookProgress }) {
  const t = useT();
  const pct = percent(progress);
  return (
    <Link to={`/read/${book.id}`} className="group flex flex-col gap-3 rounded-2xl p-2 -m-2 transition-colors hover:bg-surface">
      <div className="relative">
        <Cover book={book} className="transition-transform duration-300 group-hover:-translate-y-1 group-hover:shadow-lg" />
        {progress?.completed && (
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-accent px-2 py-1 text-[11px] font-semibold text-accent-ink shadow">
            <Check className="size-3" strokeWidth={3} />
            {t.library.completed}
          </span>
        )}
      </div>
      <div className="min-w-0 px-0.5">
        <h3 className="truncate text-[15px] font-semibold leading-snug" title={book.title}>
          {book.title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {fmt(t.library.minutes, { n: book.minutes })} · {fmt(t.library.lines, { n: book.captions.toLocaleString() })}
        </p>
        {progress && !progress.completed && <Progress value={pct} className="mt-2" />}
      </div>
    </Link>
  );
}

function LevelHeader({ level, count }: { level: Level; count: number }) {
  const t = useT();
  const [name, desc] = t.levels[level.index];
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-1 border-b border-line pb-3">
      <h2 className="font-serif text-2xl font-semibold tracking-tight">
        {fmt(t.library.level, { n: level.index })} <span className="text-muted">· {name}</span>
      </h2>
      <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{CEFR[level.index]}</span>
      <p className="w-full text-sm text-muted sm:ml-auto sm:w-auto">
        {desc} · {fmt(t.library.books, { n: count })}
      </p>
    </div>
  );
}

export default function Library() {
  const t = useT();
  const { catalog, error } = useCatalog();
  const progress = useStore((s) => s.progress);
  const lastBookId = useStore((s) => s.lastBookId);
  const [levelId, setLevelId] = useState<number | 'all'>('all');
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    if (!catalog) return [];
    const q = query.trim().toLowerCase();
    return catalog.levels
      .filter((l) => levelId === 'all' || l.id === levelId)
      .map((level) => ({
        level,
        books: catalog.books.filter((b) => b.levelId === level.id && (!q || b.title.toLowerCase().includes(q))),
      }))
      .filter((g) => g.books.length > 0);
  }, [catalog, levelId, query]);

  if (error) return <p className="p-10 text-muted">{t.library.loadError}</p>;
  if (!catalog) return null;

  const current = catalog.books.find((b) => b.id === lastBookId);
  const featured = current ?? catalog.books[0];
  const featuredLevel = catalog.levels.find((l) => l.id === featured.levelId)!;
  const featuredProgress = progress[featured.id];

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-10">
      {/* Featured: continue reading or start here */}
      <section className="animate-rise relative mb-12 overflow-hidden rounded-3xl border border-line bg-surface">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(60% 120% at 100% 0%, var(--accent-soft), transparent 70%)' }}
        />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center md:p-8">
          <Cover book={featured} className="w-28 shrink-0 shadow-xl md:w-32" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
              {current ? t.library.continue : t.library.start}
            </p>
            <h1 className="mt-2 font-serif text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{featured.title}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              {current
                ? `${fmt(t.library.level, { n: featuredLevel.index })} · ${CEFR[featuredLevel.index]} · ${fmt(t.library.minutes, { n: featured.minutes })}`
                : t.library.startText}
            </p>
            {current && featuredProgress && (
              <div className="mt-4 flex max-w-sm items-center gap-3">
                <Progress value={percent(featuredProgress)} className="flex-1" />
                <span className="text-xs font-medium text-muted tabular-nums">{Math.round(percent(featuredProgress))}%</span>
              </div>
            )}
          </div>
          <Link
            to={`/read/${featured.id}`}
            className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-ink shadow-sm transition-transform hover:scale-[1.03] sm:self-center"
          >
            <Headphones className="size-4" />
            {current ? t.library.continueCta : t.library.startCta}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Filters */}
      <div className="sticky top-0 z-10 -mx-5 mb-8 flex flex-col gap-3 bg-bg/90 px-5 py-3 backdrop-blur md:-mx-10 md:flex-row md:items-center md:px-10">
        <div className="flex gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <Chip active={levelId === 'all'} onClick={() => setLevelId('all')}>
            {t.library.all}
          </Chip>
          {catalog.levels.map((l) => (
            <Chip key={l.id} active={levelId === l.id} onClick={() => setLevelId(l.id)}>
              <span className="font-semibold">L{l.index}</span>
              <span className="opacity-60">{CEFR[l.index]}</span>
            </Chip>
          ))}
        </div>
        <label className="relative md:ml-auto md:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.library.search}
            className="w-full rounded-full border border-line bg-surface py-2 pr-4 pl-9 text-sm outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      </div>

      {groups.length === 0 && <p className="py-16 text-center text-muted">{t.library.empty}</p>}

      <div className="flex flex-col gap-14">
        {groups.map(({ level, books }) => (
          <section key={level.id}>
            <LevelHeader level={level} count={books.length} />
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {books.map((b) => (
                <BookCard key={b.id} book={b} progress={progress[b.id]} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        active ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
