import type { Metadata } from 'next';
import Image from 'next/image';
import { PageShell, H2, P } from '@/components/PageShell';
import { SITE } from '@/lib/site';
import finishPhoto from '@/public/finish.jpg';

export const metadata: Metadata = {
  title:       'About & Support — Que',
  description: 'Que is a personal training log and calorie tracker built solo as a free hobby project. If it helps you, you can support it.',
};

export default function AboutPage() {
  return (
    <PageShell title="About Que" subtitle="A hobby project, built for athletes who take their data seriously.">
      <P>
        Hey, I&apos;m Tanishq. I built {SITE.name} solo, on my own time, because I wanted a training
        log and calorie tracker I&apos;d actually enjoy using every day. Fast, offline-first, no ads,
        no upsells, and no selling your data. It does workouts, macros, body-weight trends,
        cut and bulk plans, badges, and friendly challenges with friends, all in one app.
      </P>
      <P>
        I&apos;ve spent countless hours on this. Before I started, I tried a bunch of the other
        fitness and calorie apps out there, and honestly most of them let me down. They were thin on
        features, or the parts I actually wanted were locked behind a paywall. I wanted one app that
        did everything well and wasn&apos;t blocked by cost, so I sat down and built it.
      </P>
      <P>
        It&apos;s free and it stays free. There&apos;s no paywall and there never will be. I&apos;d
        rather build something people genuinely like than nickel-and-dime it.
      </P>

      <figure className="mt-7 mb-2">
        <Image
          src={finishPhoto}
          alt="Tanishq crossing the finish line at the Knoxville Marathon"
          placeholder="blur"
          sizes="(max-width: 720px) 100vw, 720px"
          className="w-full h-auto rounded-lg border"
          style={{ borderColor: 'var(--line)' }}
        />
        <figcaption className="font-mono text-[10px] text-[var(--ink-3)] tracking-[0.5px] text-center mt-2">
          Crossing the line at the Knoxville Marathon. Built by someone who actually trains.
        </figcaption>
      </figure>

      <H2>Support the app</H2>
      <P>
        {SITE.name} costs real money to run. Servers, the database, image storage, and notifications
        all add up every month, and right now I cover that out of my own pocket. I refuse to put ads
        in the app, so there&apos;s no revenue behind it. If {SITE.name} is useful to you and you feel
        like chipping in, a donation genuinely goes a long way and I really appreciate it. It&apos;s
        completely optional, there&apos;s zero pressure, and it unlocks nothing you don&apos;t already
        have.
      </P>

      <div className="mt-6 mb-2 flex flex-col items-start gap-3">
        <a
          href={SITE.kofiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-mono text-[12px] font-bold tracking-[1px] uppercase"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 0 0 1px var(--accent), 0 0 24px var(--accent-24)' }}
        >
          ☕ Support on Ko-fi
        </a>
        <p className="font-mono text-[10px] text-[var(--ink-3)]">
          Opens Ko-fi in a new tab. One-time or monthly — whatever works for you.
        </p>
      </div>

      <H2>Get in touch</H2>
      <P>
        Found a bug, have an idea, or just want to say hi? Email me at{' '}
        <a href={`mailto:${SITE.contactEmail}`} className="text-[var(--accent)] underline">
          {SITE.contactEmail}
        </a>.
      </P>
    </PageShell>
  );
}
