import type { Metadata } from 'next';
import { PageShell, H2, P, Ul } from '@/components/PageShell';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title:       'Terms of Service — Que',
  description: 'The terms for using Que.',
};

export default function TermsPage() {
  return (
    <PageShell title="Terms of Service" subtitle={`Last updated ${SITE.legalUpdated}`}>
      <P>
        By using {SITE.name} (&quot;the app&quot;) you agree to these terms. If you don&apos;t agree,
        please don&apos;t use the app. {SITE.name} is an independent hobby project provided free of charge.
      </P>

      <H2>Not medical or nutritional advice</H2>
      <P>
        {SITE.name} is a tracking and informational tool, <strong>not</strong> a medical, healthcare,
        or professional nutrition service. Calorie budgets, macro targets, cut/bulk projections, and
        all other figures are <strong>estimates</strong> generated from formulas and the data you
        enter — they may be inaccurate. Nothing in the app is medical advice. Always consult a
        qualified physician or dietitian before changing your diet or exercise, especially if you
        have a health condition. You use {SITE.name} at your own risk.
      </P>

      <H2>Eligibility &amp; accounts</H2>
      <Ul>
        <li>You must be at least 13 years old to use {SITE.name}.</li>
        <li>You&apos;re responsible for activity under your account and for keeping your sign-in secure.</li>
        <li>Provide accurate information and keep it up to date.</li>
      </Ul>

      <H2>Acceptable use</H2>
      <P>Don&apos;t misuse the app. In particular, don&apos;t:</P>
      <Ul>
        <li>Abuse, overload, scrape, or attempt to breach the service or other users&apos; data.</li>
        <li>Falsify data to cheat challenges, or harass or impersonate other users.</li>
        <li>Use the app for any unlawful purpose.</li>
      </Ul>

      <H2>Your content</H2>
      <P>
        Your logged data is yours. You grant us the limited license needed to store, process, and
        display it so the app can function (including showing your public profile and challenge
        stats to friends). You can export or delete your data at any time.
      </P>

      <H2>Coins &amp; challenges</H2>
      <P>
        Coins, badges, and challenge wagers are virtual, for entertainment only, have{' '}
        <strong>no real-world monetary value</strong>, and can&apos;t be redeemed, transferred off
        the platform, or purchased.
      </P>

      <H2>Donations</H2>
      <P>
        Donations (e.g. via Ko-fi) are voluntary, are processed by third parties under their own
        terms, are generally non-refundable, and grant no additional features or entitlements.
      </P>

      <H2>Availability &amp; &quot;as is&quot;</H2>
      <P>
        {SITE.name} is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of
        any kind. As a hobby project, there is no uptime or support guarantee, and features may
        change or be discontinued. To the maximum extent permitted by law, we are not liable for any
        damages arising from your use of the app, including any loss of data or any decisions you make
        based on its estimates. Keep your own backups of important data (use Export Data).
      </P>

      <H2>Termination</H2>
      <P>
        You may stop using {SITE.name} and request deletion at any time. We may suspend or terminate
        access that violates these terms or harms the service or its users.
      </P>

      <H2>Changes</H2>
      <P>We may update these terms; continued use after an update means you accept the revised terms.</P>

      <H2>Contact</H2>
      <P>
        Questions:{' '}
        <a href={`mailto:${SITE.contactEmail}`} className="text-[var(--accent)] underline">{SITE.contactEmail}</a>.
      </P>
    </PageShell>
  );
}
