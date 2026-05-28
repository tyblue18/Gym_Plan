import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

// Generate per-request, not at build — keeps the DB query (which grows with the
// user table) off the build's critical path. The sitemap is crawler-only
// traffic, so a per-request DB read is fine.
export const dynamic = 'force-dynamic';

const BASE = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const users = await prisma.appUser.findMany({
    where:  { username: { not: null } },
    select: { username: true, updatedAt: true },
  });

  const profiles: MetadataRoute.Sitemap = users
    .filter((u): u is typeof u & { username: string } => !!u.username)
    .map(u => ({
      url:          `${BASE}/profile/${u.username}`,
      lastModified: u.updatedAt,
      changeFrequency: 'weekly',
      priority:     0.7,
    }));

  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,        lastModified: now, changeFrequency: 'monthly', priority: 1.0 },
    { url: `${BASE}/about`,   lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE}/terms`,   lastModified: now, changeFrequency: 'yearly',  priority: 0.3 },
  ];

  return [...staticPages, ...profiles];
}
