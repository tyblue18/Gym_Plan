import GithubProvider from 'next-auth/providers/github';
import GoogleProvider  from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';
import { prisma } from '@/lib/prisma';

/**
 * Centralised NextAuth config — imported by:
 *   • app/api/auth/[...nextauth]/route.ts   (the handler)
 *   • app/api/sync/route.ts                 (getServerSession)
 *   • app/api/health/google-fit/*           (getServerSession)
 */
export const authOptions: NextAuthOptions = {
  logger: {
    error(code, ...message) {
      if (code === 'CLIENT_FETCH_ERROR') return;
      console.error('[next-auth]', code, ...message);
    },
  },

  providers: [
    GithubProvider({
      clientId:     process.env.GITHUB_CLIENT_ID     as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    }),
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID     as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    }),
  ],

  session: { strategy: 'jwt' },

  secret: process.env.NEXTAUTH_SECRET,

  pages: { signIn: '/auth/signin' },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.githubId = (profile as { id?: number }).id;
      }
      // Upsert the DB user once and cache their id in the JWT.
      // After this, every route reads session.user.id with no extra DB query.
      if (!token.userId && token.email) {
        const user = await prisma.appUser.upsert({
          where:  { email: token.email },
          create: { email: token.email, name: token.name ?? undefined },
          update: { name: token.name ?? undefined },
        });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id       = token.userId as string;
        session.user.githubId = token.githubId as number | undefined;
      }
      return session;
    },
  },
};
