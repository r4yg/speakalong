export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" className={className} aria-hidden="true">
      <rect width="256" height="256" rx="60" fill="var(--accent)" />
      <path
        d="M64 82a30 30 0 0 1 30-30h68a30 30 0 0 1 30 30v40a30 30 0 0 1-30 30H120l-24 20v-20H94a30 30 0 0 1-30-30z"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="150,104 114,86 114,122" fill="var(--accent-ink)" />
      <rect x="96" y="186" width="64" height="12" rx="6" fill="var(--accent-ink)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-serif text-lg font-semibold tracking-tight">SpeakAlong</span>
    </div>
  );
}
