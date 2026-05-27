import type { Metadata } from 'next';
import { PageShell, H2, P, Ul } from '@/components/PageShell';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  title:       'Privacy Policy — Que',
  description: 'How Que collects, uses, stores, and shares your data.',
};

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy Policy" subtitle={`Last updated ${SITE.legalUpdated}`}>
      <P>
        {SITE.name} (&quot;the app&quot;, &quot;we&quot;, &quot;us&quot;) is a personal training and
        calorie-tracking app. This policy explains what we collect, why, and the choices you have.
        {SITE.name} is offline-first: most of your data lives on your own device and is only synced
        to our servers when you sign in.
      </P>

      <H2>Information we collect</H2>
      <Ul>
        <li><strong>Account information</strong> — when you sign in with Google or GitHub, we receive your name, email address, profile image, and a provider account ID. You also choose a username.</li>
        <li><strong>Fitness &amp; nutrition data you enter</strong> — workouts (exercises, sets, reps, weights), cardio, body weight, calories and macros, food logs, plans, and related notes.</li>
        <li><strong>Profile photo</strong> — if you upload one, it&apos;s stored in our image storage.</li>
        <li><strong>Step count</strong> — if you enter your daily steps (manually, or by pushing them from a phone shortcut), we store that number with your day&apos;s data.</li>
        <li><strong>Push subscriptions</strong> — if you enable notifications, we store the browser push subscription needed to deliver them.</li>
        <li><strong>Technical data</strong> — error diagnostics (to fix crashes), anonymous usage analytics, your timezone, and your IP address (used transiently for rate-limiting and abuse prevention).</li>
      </Ul>

      <H2>How we use your information</H2>
      <Ul>
        <li>To provide the app and sync your data across your devices.</li>
        <li>To power social features you opt into — friends, challenges, and your public profile.</li>
        <li>To send notifications you enable (reminders, weekly recaps, challenge results).</li>
        <li>To keep the app reliable and secure (diagnostics, rate-limiting, abuse prevention).</li>
      </Ul>
      <P>We do <strong>not</strong> sell your data, and we do <strong>not</strong> use it for advertising.</P>

      <H2>What&apos;s public</H2>
      <P>
        If you create a public profile, your username, display name, profile photo, status,
        earned badges, and coin balance are visible to anyone at your profile URL. Friends you add
        can see stats relevant to challenges you enter together. Everything else (your logs, food,
        weight, plans) is private to your account.
      </P>

      <H2>Service providers</H2>
      <P>We rely on a small set of trusted providers to run the app. They process data only to provide their service to us:</P>
      <Ul>
        <li><strong>Vercel</strong> — hosting, image storage, and anonymous analytics.</li>
        <li><strong>PostHog</strong> — product analytics (which features get used, and where new users drop off) so we can improve the app. We do not record your screen. No data is sold or used for advertising.</li>
        <li><strong>Neon</strong> — our PostgreSQL database.</li>
        <li><strong>Upstash</strong> — rate-limiting and caching.</li>
        <li><strong>Google &amp; GitHub</strong> — sign-in (OAuth).</li>
        <li><strong>USDA FoodData Central &amp; Open Food Facts</strong> — food lookups (your search terms / scanned barcodes are sent to find nutrition info).</li>
        <li><strong>Sentry</strong> — error monitoring.</li>
        <li><strong>Browser push services</strong> (e.g. Apple, Google) — to deliver notifications you enable.</li>
      </Ul>

      <H2>Google sign-in</H2>
      <P>
        When you sign in with Google we receive only your basic profile (name, email address, and
        profile image) to create and identify your account. {SITE.name} does not request or access
        any other Google data. Our use of information received from Google APIs adheres to the{' '}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
          Google API Services User Data Policy
        </a>. We never sell this data or use it for advertising.
      </P>

      <H2>Your choices &amp; rights</H2>
      <Ul>
        <li><strong>Export</strong> — download a full copy of your data anytime via Export Data in the app.</li>
        <li><strong>Delete</strong> — request deletion of your account and associated data by emailing us.</li>
        <li><strong>Notifications</strong> — turn off anytime in the app or your browser settings.</li>
      </Ul>

      <H2>Data retention &amp; security</H2>
      <P>
        We keep your data while your account is active and delete it on request. Data is
        transmitted over HTTPS and access is protected by authenticated sessions. No system is
        perfectly secure, but we take reasonable measures to protect your information.
      </P>

      <H2>Children</H2>
      <P>{SITE.name} is not directed to children under 13, and we do not knowingly collect data from them.</P>

      <H2>Changes</H2>
      <P>We may update this policy; we&apos;ll revise the &quot;last updated&quot; date above when we do.</P>

      <H2>Contact</H2>
      <P>
        Questions or data requests:{' '}
        <a href={`mailto:${SITE.contactEmail}`} className="text-[var(--accent)] underline">{SITE.contactEmail}</a>.
      </P>
    </PageShell>
  );
}
