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
        log and calorie tracker I&apos;d actually enjoy using every day. Fast, offline-first, and your
        data stays yours. It does workouts, macros, body-weight trends, cut and bulk plans, badges,
        and friendly challenges with friends, all in one app.
      </P>
      <P>
        I&apos;ve spent countless hours on this. Before I started, I tried a bunch of the other
        fitness and calorie apps out there, and honestly most of them let me down. They were thin on
        features, or the parts I actually wanted were locked behind a paywall. I wanted one app that
        did everything well and wasn&apos;t blocked by cost, so I sat down and built it.
      </P>
      <P>
        The cut and bulk plans aren&apos;t generic templates either. They run on the same equations
        sports scientists and dietitians use: Mifflin-St Jeor for your metabolism, the ACSM running
        equation and the Compendium of Physical Activities for exercise burn. {SITE.name} also counts
        cardio net of rest, the way it&apos;s actually measured, instead of the inflated numbers most
        apps show. It ends up more rigorous than the plans a lot of apps lock behind a subscription.
      </P>
      <P>
        {SITE.name} is free to use, no required subscription to track your workouts, food, and
        progress. I want to build something people genuinely enjoy using.
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
        {SITE.name} is free to use. If you&apos;d like to support its development, you can donate on
        Ko-fi. Completely optional, no pressure.
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
