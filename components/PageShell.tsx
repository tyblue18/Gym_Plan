import Link from 'next/link';
import Image from 'next/image';
import queLogo from '@/public/Que_logo.png';
import { SITE } from '@/lib/site';

/**
 * Shared shell for the public static pages (about / privacy / terms). Server
 * component — no client JS, fully crawlable for OAuth verification + ad review.
 */
export function PageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="font-sans min-h-[100dvh] flex flex-col" style={{ background: 'var(--bg-0)', color: 'var(--ink-1)' }}>
      <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <Link href="/" className="flex items-center gap-2">
          <Image src={queLogo} alt="Que" width={26} height={26} priority />
          <span className="font-display text-[18px] tracking-[2px] uppercase text-[var(--ink-0)]">{SITE.name}</span>
        </Link>
        <Link href="/app" className="font-mono text-[10px] font-bold tracking-[1px] uppercase text-[var(--accent)]">
          Open app
        </Link>
      </header>

      <main className="flex-1 w-full max-w-[720px] mx-auto px-5 py-10">
        <h1 className="font-display text-[30px] md:text-[36px] tracking-[1.5px] uppercase text-[var(--ink-0)] leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="font-mono text-[11px] text-[var(--ink-3)] tracking-[0.5px] mt-3">{subtitle}</p>
        )}
        <div className="mt-8">{children}</div>
      </main>

      <footer className="border-t px-5 py-6 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center" style={{ borderColor: 'var(--line)' }}>
        <span className="font-mono text-[10px] text-[var(--ink-3)]">© {new Date().getFullYear()} {SITE.name}</span>
        <Link href="/about"   className="font-mono text-[10px] text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">About</Link>
        <Link href="/privacy" className="font-mono text-[10px] text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">Privacy</Link>
        <Link href="/terms"   className="font-mono text-[10px] text-[var(--ink-2)] hover:text-[var(--accent)] transition-colors">Terms</Link>
      </footer>
    </div>
  );
}

// ── Reusable prose atoms (keep the legal pages readable + consistent) ──────────

export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="font-display text-[15px] tracking-[1px] uppercase text-[var(--ink-0)] mt-9 mb-3">{children}</h2>
);
export const P = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] leading-relaxed text-[var(--ink-2)] mb-3">{children}</p>
);
export const Ul = ({ children }: { children: React.ReactNode }) => (
  <ul className="list-disc pl-5 text-[13px] leading-relaxed text-[var(--ink-2)] mb-3 space-y-1.5">{children}</ul>
);
