import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

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

  return [
    {
      url:             `${BASE}/`,
      lastModified:    new Date(),
      changeFrequency: 'monthly',
      priority:        1.0,
    },
    ...profiles,
  ];
}
