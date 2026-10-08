import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  ExternalLink,
  Mic,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import { bookAudioUrl, CEFR, cleanWord, loadCaptions, lineLength, type Book, type Caption } from '../lib/content';
import { useCatalog } from '../lib/useCatalog';
import {
  addWord,
  getState,
  saveProgress,
  updateSettings,
  useStore,
  type SavedWord,
  type Settings,
  type TranslationMode,
} from '../lib/store';
import { fmt, useT } from '../lib/i18n';
import Modal from '../components/Modal';

type Phase = 'idle' | 'playing' | 'gap' | 'turn';

const RATES = [0.75, 0.85, 1, 1.15, 1.25];

export default function Reader() {
  const { bookId } = useParams();
  const { catalog, error } = useCatalog();
  const book = catalog?.books.find((b) => b.id === Number(bookId));
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const t = useT();

  useEffect(() => {
    setCaptions(null);
    setLoadError(false);
    loadCaptions(Number(bookId)).then(setCaptions, () => setLoadError(true));
  }, [bookId]);

  if (error || loadError || (catalog && !book)) {
    return (
      <div className="grid h-full place-items-center p-10 text-center text-muted">
        <div>
          <p>{t.library.loadError}</p>
          <Link to="/" className="mt-4 inline-block text-accent underline">
            {t.reader.back}
          </Link>
        </div>
      </div>
    );
  }
  if (!book || !captions) {
    return <div className="grid h-full place-items-center text-sm text-muted">{t.reader.loading}</div>;
  }
  return <Player key={book.id} book={book} captions={captions} levelIndex={catalog!.levels.find((l) => l.id === book.levelId)!.index} />;
}

function startIndex(book: Book, captions: Caption[], requested: number | null): number {
  const find = (n: number) => captions.findIndex((c) => c.n === n);
  if (requested != null && find(requested) >= 0) return find(requested);
  const p = getState().progress[book.id];
  if (!p) return 0;
  const i = find(p.caption);
  if (i < 0 || (p.completed && i >= captions.length - 1)) return 0;
  return i;
}

function Player({ book, captions, levelIndex }: { book: Book; captions: Caption[]; levelIndex: number }) {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settings = useStore((s) => s.settings);
  const allWords = useStore((s) => s.words);
  const bookWords = useMemo(() => allWords.filter((w) => w.bookId === book.id), [allWords, book.id]);

  const [index, setIndex] = useState(() => startIndex(book, captions, params.get('c') ? Number(params.get('c')) : null));
  const [phase, setPhase] = useState<Phase>('idle');
  const [gap, setGap] = useState({ left: 0, total: 0 });
  const [audioError, setAudioError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [panel, setPanel] = useState<'none' | 'words' | 'practice'>('none');
  const [picked, setPicked] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frame = useRef(0);
  const timers = useRef<number[]>([]);
  const session = useRef(0);
  const playCount = useRef(0);
  const indexRef = useRef(index);
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;

  const caption = captions[index];
  const last = captions.length - 1;

  // One local audio file per book; each line is a [s, e) segment of it.
  const getAudio = () => {
    if (!audioRef.current) {
      const a = new Audio(bookAudioUrl(book));
      a.preload = 'auto';
      audioRef.current = a;
    }
    return audioRef.current;
  };

  const clearTimers = () => {
    timers.current.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    timers.current = [];
    cancelAnimationFrame(frame.current);
  };

  const stop = useCallback(() => {
    session.current++;
    clearTimers();
    audioRef.current?.pause();
    setPhase('idle');
  }, []);

  // ---- Playback engine ----------------------------------------------------

  const finishLine = (s: number) => {
    if (s !== session.current) return;
    const st = settingsRef.current;
    const i = indexRef.current;
    playCount.current += 1;
    const again = st.repeatTwice && playCount.current < 2;

    const proceed = () => {
      if (s !== session.current) return;
      if (again) return playLine(i, false);
      if (!st.autoAdvance) return setPhase('turn');
      if (i >= captions.length - 1) {
        setPhase('idle');
        setFinished(true);
        return;
      }
      go(i + 1, true);
    };

    if (st.pauseToRepeat) {
      // Leave as much silence as the line takes to say.
      const seconds = Math.min(15, Math.max(1.5, (lineLength(captions[i]) / st.rate) * 1.1));
      const end = performance.now() + seconds * 1000;
      setPhase('gap');
      setGap({ left: seconds, total: seconds });
      const tick = window.setInterval(() => {
        const left = Math.max(0, (end - performance.now()) / 1000);
        setGap({ left, total: seconds });
        if (left <= 0) {
          clearInterval(tick);
          proceed();
        }
      }, 100);
      timers.current.push(tick);
    } else {
      timers.current.push(window.setTimeout(proceed, again ? 350 : 150));
    }
  };

  const playLine = (i: number, resetCount: boolean) => {
    clearTimers();
    const s = ++session.current;
    if (resetCount) playCount.current = 0;
    const audio = getAudio();
    const c = captions[i];
    setPhase('playing');

    // No audio for this book (e.g. a build without media): keep the rhythm silently.
    const fallback = () => {
      if (s !== session.current) return;
      audio.pause();
      setAudioError(true);
      timers.current.push(window.setTimeout(() => finishLine(s), (lineLength(c) / settingsRef.current.rate) * 1000));
    };
    if (c.s == null || c.e == null || audio.error) return fallback();

    audio.pause();
    audio.currentTime = c.s;
    audio.playbackRate = settingsRef.current.rate;
    audio.onended = () => finishLine(s);
    audio.play().then(
      () => {
        if (s !== session.current) return;
        setAudioError(false);
        // Stop exactly at the end of the line's segment.
        const watch = () => {
          if (s !== session.current) return;
          if (audio.currentTime >= c.e! - 0.015) {
            audio.pause();
            finishLine(s);
          } else {
            frame.current = requestAnimationFrame(watch);
          }
        };
        frame.current = requestAnimationFrame(watch);
      },
      (err: DOMException) => {
        if (err?.name !== 'AbortError') fallback();
      },
    );
  };

  const go = (i: number, autoplay: boolean) => {
    const next = Math.max(0, Math.min(last, i));
    indexRef.current = next;
    setIndex(next);
    setRevealed(false);
    if (autoplay) playLine(next, true);
    else stop();
  };

  const togglePlay = () => {
    if (phase === 'playing' || phase === 'gap') return stop();
    setFinished(false);
    playLine(indexRef.current, true);
  };

  const step = (delta: number) => go(indexRef.current + delta, phase === 'playing' || phase === 'gap');

  // Persist progress whenever the line changes.
  useEffect(() => {
    saveProgress(book.id, caption.n, captions.length, index);
  }, [index, book.id, caption.n, captions.length]);

  // Apply speed changes immediately.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = settings.rate;
  }, [settings.rate]);

  // Stop everything and release the audio on unmount.
  useEffect(
    () => () => {
      session.current++;
      clearTimers();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      }
    },
    [],
  );

  // Keyboard shortcuts.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select, [role="dialog"]')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      step(1);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'Escape' && panel !== 'none') {
      setPanel('none');
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const pickWord = (token: string) => {
    const w = cleanWord(token);
    if (!w || !/[a-z]/i.test(w)) return;
    stop();
    setPicked(w);
  };

  const savedHere = new Set(bookWords.filter((w) => w.caption === caption.n).map((w) => w.word));
  const pct = ((index + 1) / captions.length) * 100;
  const playing = phase === 'playing' || phase === 'gap';

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* Top bar */}
      <header className="relative flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 md:px-5">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">{t.reader.back}</span>
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="truncate font-serif text-[15px] font-semibold">{book.title}</h1>
          <p className="text-xs text-muted tabular-nums">
            L{levelIndex} · {CEFR[levelIndex]} · {fmt(t.reader.of, { a: index + 1, b: captions.length })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <IconToggle active={panel === 'practice'} onClick={() => setPanel(panel === 'practice' ? 'none' : 'practice')} label={t.reader.practice}>
            <SlidersHorizontal className="size-[18px]" />
          </IconToggle>
          <IconToggle active={panel === 'words'} onClick={() => setPanel(panel === 'words' ? 'none' : 'words')} label={t.reader.words}>
            <Sparkles className="size-[18px]" />
            {bookWords.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-mark px-1 text-[10px] font-bold text-white">
                {bookWords.length}
              </span>
            )}
          </IconToggle>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-transparent">
          <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Stage */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-10 md:px-10">
            {captions[index - 1] && (
              <button
                onClick={() => step(-1)}
                className="mb-8 line-clamp-2 text-left font-serif text-lg leading-relaxed text-muted/60 transition-colors hover:text-muted"
              >
                {captions[index - 1].en}
              </button>
            )}

            <div key={index} className="animate-rise">
              <p className="font-serif text-[28px] leading-[1.45] font-medium tracking-[-0.01em] md:text-[34px] xl:text-[40px]">
                {caption.en.split(/(\s+)/).map((tok, k) =>
                  /^\s+$/.test(tok) ? (
                    tok
                  ) : (
                    <span
                      key={k}
                      onClick={() => pickWord(tok)}
                      className={`cursor-pointer rounded-md decoration-2 underline-offset-[6px] transition-colors hover:bg-mark-soft ${
                        savedHere.has(cleanWord(tok)) ? 'text-mark underline decoration-mark/50' : ''
                      }`}
                    >
                      {tok}
                    </span>
                  ),
                )}
              </p>

              <Translation mode={settings.translation} text={caption.es} revealed={revealed} onReveal={() => setRevealed(true)} />
            </div>

            <div className="mt-8 h-8">
              <Status phase={phase} gap={gap} />
            </div>

            {captions[index + 1] && (
              <button
                onClick={() => step(1)}
                className="mt-6 line-clamp-2 text-left font-serif text-lg leading-relaxed text-muted/50 transition-colors hover:text-muted"
              >
                {captions[index + 1].en}
              </button>
            )}

            {audioError && (
              <p className="mt-8 flex items-center gap-2 rounded-xl bg-mark-soft px-4 py-3 text-sm text-mark">
                <VolumeX className="size-4 shrink-0" />
                {t.reader.audioError}
              </p>
            )}
          </div>
        </section>

        {/* Side panels */}
        {panel !== 'none' && (
          <aside className="animate-rise absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl md:static md:shadow-none">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="font-semibold">{panel === 'words' ? t.reader.words : t.reader.practice}</h2>
              <button onClick={() => setPanel('none')} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {panel === 'practice' ? (
                <PracticePanel settings={settings} />
              ) : (
                <WordsPanel words={bookWords} onJump={(w) => go(captions.findIndex((c) => c.n === w.caption), false)} />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Control dock */}
      <footer className="border-t border-line bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="flex w-28 justify-start">
            <button
              onClick={() => setConfirmRestart(true)}
              title={t.reader.restart}
              className="rounded-full p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <RotateCcw className="size-5" />
            </button>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <button
              onClick={() => step(-1)}
              disabled={index === 0}
              title={t.reader.prev}
              className="rounded-full p-3 text-ink transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <SkipBack className="size-6" fill="currentColor" />
            </button>
            <button
              onClick={togglePlay}
              title={playing ? t.reader.pause : t.reader.play}
              className="grid size-16 place-items-center rounded-full bg-accent text-accent-ink shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {playing ? <Pause className="size-7" fill="currentColor" /> : <Play className="ml-1 size-7" fill="currentColor" />}
            </button>
            <button
              onClick={() => step(1)}
              disabled={index === last}
              title={t.reader.next}
              className="rounded-full p-3 text-ink transition-colors hover:bg-surface-2 disabled:opacity-30"
            >
              <SkipForward className="size-6" fill="currentColor" />
            </button>
          </div>
          <div className="flex w-28 justify-end">
            <select
              value={settings.rate}
              onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
              title={t.reader.speed}
              className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium tabular-nums outline-none hover:border-muted"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mx-auto mt-2 hidden max-w-3xl text-center text-[11px] text-muted md:block">
          {t.reader.clickHint} · {t.reader.shortcuts}
        </p>
      </footer>

      <WordModal
        word={picked}
        caption={caption}
        alreadySaved={picked ? savedHere.has(picked) : false}
        onClose={() => setPicked(null)}
        onSave={(note) => {
          addWord({ word: picked!, note, bookId: book.id, caption: caption.n, en: caption.en, es: caption.es });
          setPicked(null);
        }}
      />

      <Modal open={confirmRestart} onClose={() => setConfirmRestart(false)}>
        <h2 className="font-serif text-xl font-semibold">{t.reader.restartTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.reader.restartText}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setConfirmRestart(false)} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-surface-2">
            {t.reader.cancel}
          </button>
          <button
            onClick={() => {
              setConfirmRestart(false);
              setFinished(false);
              go(0, false);
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
          >
            {t.reader.confirm}
          </button>
        </div>
      </Modal>

      <Modal open={finished} onClose={() => setFinished(false)}>
        <div className="text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-accent-soft text-3xl">🎉</div>
          <h2 className="font-serif text-2xl font-semibold">{t.reader.finished}</h2>
          <p className="mt-2 text-sm text-muted">{t.reader.finishedText}</p>
          <button onClick={() => navigate('/')} className="mt-6 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink">
            {t.reader.back}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function IconToggle({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={`relative rounded-full p-2 transition-colors ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function Translation({ mode, text, revealed, onReveal }: { mode: TranslationMode; text: string; revealed: boolean; onReveal: () => void }) {
  const t = useT();
  if (mode === 'hide' || !text) return null;
  if (mode === 'reveal' && !revealed) {
    return (
      <button onClick={onReveal} className="group mt-5 block text-left" title={t.reader.tapToReveal}>
        <span className="text-lg leading-relaxed text-muted blur-[6px] transition group-hover:blur-[3px] select-none">{text}</span>
      </button>
    );
  }
  return <p className="mt-5 text-lg leading-relaxed text-muted">{text}</p>;
}

function Status({ phase, gap }: { phase: Phase; gap: { left: number; total: number } }) {
  const t = useT();
  if (phase === 'playing') {
    return (
      <div className="flex h-6 items-end gap-1 text-accent" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="eq-bar block h-full w-1 rounded-full bg-current" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
    );
  }
  if (phase === 'gap' || phase === 'turn') {
    const frac = phase === 'gap' && gap.total ? gap.left / gap.total : 0;
    return (
      <div className="flex items-center gap-3 text-sm font-medium text-mark">
        <span className="relative grid size-8 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--mark-soft)" strokeWidth="3" />
            {phase === 'gap' && (
              <circle cx="18" cy="18" r="15" fill="none" stroke="var(--mark)" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${frac * 94.2} 94.2`} />
            )}
          </svg>
          <Mic className="size-3.5" />
        </span>
        {t.reader.yourTurn}
      </div>
    );
  }
  return null;
}

function Toggle({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-colors hover:bg-surface-2">
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

function PracticePanel({ settings }: { settings: Settings }) {
  const t = useT();
  const modes: [TranslationMode, string][] = [
    ['show', t.reader.tShow],
    ['reveal', t.reader.tReveal],
    ['hide', t.reader.tHide],
  ];
  return (
    <div className="flex flex-col gap-1">
      <Toggle checked={settings.autoAdvance} onChange={(v) => updateSettings({ autoAdvance: v })} title={t.reader.autoAdvance} hint={t.reader.autoAdvanceHint} />
      <Toggle checked={settings.repeatTwice} onChange={(v) => updateSettings({ repeatTwice: v })} title={t.reader.repeatTwice} hint={t.reader.repeatTwiceHint} />
      <Toggle checked={settings.pauseToRepeat} onChange={(v) => updateSettings({ pauseToRepeat: v })} title={t.reader.pauseToRepeat} hint={t.reader.pauseToRepeatHint} />
      <div className="mt-4 px-3">
        <p className="mb-2 text-sm font-medium">{t.reader.translation}</p>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
          {modes.map(([m, label]) => (
            <button
              key={m}
              onClick={() => updateSettings({ translation: m })}
              className={`rounded-lg py-1.5 text-sm transition-colors ${settings.translation === m ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 px-3">
        <p className="mb-2 text-sm font-medium">{t.reader.speed}</p>
        <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => updateSettings({ rate: r })}
              className={`rounded-lg py-1.5 text-sm tabular-nums transition-colors ${settings.rate === r ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function WordsPanel({ words, onJump }: { words: SavedWord[]; onJump: (w: SavedWord) => void }) {
  const t = useT();
  if (words.length === 0) return <p className="text-sm text-muted">{t.reader.noWords}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {words.map((w) => (
        <li key={w.id}>
          <button onClick={() => onJump(w)} className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-mark hover:bg-mark-soft">
            <span className="font-serif text-lg font-semibold text-mark">{w.word}</span>
            {w.note && <span className="mt-0.5 block text-sm">{w.note}</span>}
            <span className="mt-1 line-clamp-2 block text-xs text-muted">{w.en}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function dictionaryUrl(word: string, lang: string) {
  return lang === 'es'
    ? `https://www.wordreference.com/es/translation.asp?tranword=${encodeURIComponent(word)}`
    : `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`;
}

function WordModal({
  word,
  caption,
  alreadySaved,
  onClose,
  onSave,
}: {
  word: string | null;
  caption: Caption;
  alreadySaved: boolean;
  onClose: () => void;
  onSave: (note: string) => void;
}) {
  const t = useT();
  const lang = useStore((s) => s.settings.lang);
  const [note, setNote] = useState('');
  useEffect(() => setNote(''), [word]);

  return (
    <Modal open={word != null} onClose={onClose}>
      {word && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(note.trim());
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-3xl font-semibold text-mark">{word}</h2>
            <a
              href={dictionaryUrl(word, lang)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted hover:text-ink"
            >
              {t.reader.dictionary}
              <ExternalLink className="size-3" />
            </a>
          </div>
          <p className="mt-3 rounded-xl bg-surface-2 p-3 font-serif text-[15px] leading-relaxed">{caption.en}</p>
          {caption.es && <p className="mt-2 px-1 text-sm text-muted">{caption.es}</p>}
          <label className="mt-5 block text-sm font-medium">
            {t.reader.note}
            <input
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.reader.notePh}
              maxLength={300}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-surface-2">
              {t.reader.cancel}
            </button>
            <button type="submit" className="flex items-center gap-2 rounded-full bg-mark px-5 py-2 text-sm font-semibold text-white">
              {alreadySaved ? <BookmarkCheck className="size-4" /> : <BookmarkPlus className="size-4" />}
              {alreadySaved ? t.reader.saved : t.reader.saveWord}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
