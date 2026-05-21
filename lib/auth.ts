import GithubProvider from 'next-auth/providers/github';
import GoogleProvider  from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';

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
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { githubId?: number }).githubId =
          token.githubId as number | undefined;
      }
      return session;
    },
  },
};
