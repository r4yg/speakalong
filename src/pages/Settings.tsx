import { useRef, useState } from 'react';
import { Download, Monitor, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { exportData, importData, resetAll, updateSettings, useStore, type Lang, type Theme } from '../lib/store';
import { GITHUB_URL, useT } from '../lib/i18n';
import { download } from '../lib/download';
import GithubIcon from '../components/GithubIcon';
import { LogoMark } from '../components/Logo';
import Modal from '../components/Modal';

declare const __APP_VERSION__: string;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6">
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string, React.ReactNode?][]; onChange: (v: T) => void }) {
  return (
    <div className="inline-grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
      {options.map(([v, label, icon]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors ${
            value === v ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 3500);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-8 md:px-10 md:py-10">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">{t.settings.title}</h1>

      <Section title={t.settings.language}>
        <Segmented<Lang>
          value={settings.lang}
          onChange={(lang) => updateSettings({ lang })}
          options={[
            ['es', 'Español'],
            ['en', 'English'],
          ]}
        />
      </Section>

      <Section title={t.settings.theme}>
        <Segmented<Theme>
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            ['system', t.settings.system, <Monitor key="m" className="size-4" />],
            ['light', t.settings.light, <Sun key="s" className="size-4" />],
            ['dark', t.settings.dark, <Moon key="d" className="size-4" />],
          ]}
        />
      </Section>

      <Section title={t.settings.data}>
        <p className="mb-5 max-w-xl text-sm leading-relaxed text-muted">{t.settings.dataText}</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => download(`speakalong-backup-${new Date().toISOString().slice(0, 10)}.json`, exportData(), 'application/json')}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
          >
            <Download className="size-4" />
            {t.settings.export}
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-muted">
            <Upload className="size-4" />
            {t.settings.import}
          </button>
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-danger hover:bg-surface-2"
          >
            <Trash2 className="size-4" />
            {t.settings.reset}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              flash(importData(await file.text()) ? t.settings.imported : t.settings.importError);
            }}
          />
        </div>
        {message && <p className="mt-4 text-sm font-medium text-accent">{message}</p>}
      </Section>

      <Section title={t.settings.about}>
        <div className="flex items-start gap-4">
          <LogoMark className="size-12 shrink-0" />
          <div>
            <p className="font-serif text-lg font-semibold">
              SpeakAlong <span className="text-sm font-normal text-muted">v{__APP_VERSION__}</span>
            </p>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">{t.settings.aboutText}</p>
            <p className="mt-2 text-xs text-muted">{t.settings.audioNote}</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-muted"
            >
              <GithubIcon />
              {t.settings.source}
            </a>
          </div>
        </div>
      </Section>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h2 className="font-serif text-xl font-semibold">{t.settings.reset}</h2>
        <p className="mt-2 text-sm text-muted">{t.settings.resetConfirm}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={() => setConfirmReset(false)} className="rounded-full px-4 py-2 text-sm font-medium hover:bg-surface-2">
            {t.reader.cancel}
          </button>
          <button
            onClick={() => {
              resetAll();
              setConfirmReset(false);
              flash(t.settings.resetDone);
            }}
            className="rounded-full bg-danger px-4 py-2 text-sm font-semibold text-white"
          >
            {t.settings.reset}
          </button>
        </div>
      </Modal>
    </div>
  );
}
