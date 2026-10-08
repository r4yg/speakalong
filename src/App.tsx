import { useEffect } from 'react';
import { HashRouter, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { BookOpen, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import GithubIcon from './components/GithubIcon';
import { useStore } from './lib/store';
import { GITHUB_URL, useT } from './lib/i18n';
import Logo from './components/Logo';
import Library from './pages/Library';
import Reader from './pages/Reader';
import Words from './pages/Words';
import Settings from './pages/Settings';

function useThemeAndLang() {
  const theme = useStore((s) => s.settings.theme);
  const lang = useStore((s) => s.settings.lang);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
}

function Shell() {
  const t = useT();
  const wordCount = useStore((s) => s.words.length);
  const items = [
    { to: '/', label: t.nav.library, icon: BookOpen, end: true },
    { to: '/words', label: t.nav.words, icon: Sparkles, badge: wordCount || undefined },
    { to: '/settings', label: t.nav.settings, icon: SettingsIcon },
  ];

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:w-60 md:flex-col md:items-stretch md:gap-1 md:border-r md:border-b-0 md:px-4 md:py-6">
        <div className="mr-auto px-2 md:mr-0 md:mb-8">
          <Logo />
        </div>
        <nav className="flex gap-1 md:flex-col">
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent-soft text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              <Icon className="size-[18px]" strokeWidth={1.9} />
              <span className="hidden sm:inline">{label}</span>
              {badge ? (
                <span className="ml-auto hidden rounded-full bg-mark-soft px-2 py-0.5 text-xs font-semibold text-mark md:inline">
                  {badge}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden px-3 md:block">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-muted transition-colors hover:text-ink"
          >
            <GithubIcon className="size-4" />
            Open source · MIT
          </a>
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  useThemeAndLang();
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Library />} />
          <Route path="words" element={<Words />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="read/:bookId" element={<Reader />} />
      </Routes>
    </HashRouter>
  );
}
