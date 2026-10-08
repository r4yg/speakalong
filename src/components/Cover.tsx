import { coverUrl, type Book } from '../lib/content';

export default function Cover({ book, className = '' }: { book: Book; className?: string }) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-xl bg-surface-2 shadow-sm ring-1 ring-black/5 ${className}`}>
      <img
        src={coverUrl(book)}
        alt={book.title}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}
