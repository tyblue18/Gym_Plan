import NextAuth from 'next-auth';
import GithubProvider  from 'next-auth/providers/github';
import GoogleProvider  from 'next-auth/providers/google';
import type { NextAuthOptions } from 'next-auth';

/**
 * Centralised NextAuth configuration.
 * Export authOptions so server utilities (e.g. getServerSession) can reuse
 * the same config without importing the entire handler.
 */
const authOptions: NextAuthOptions = {
  // Suppress CLIENT_FETCH_ERROR noise — benign in dev with Next.js 15 + next-auth v4
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

  session: {
    // Stateless JWT — no database required.
    // The signed token is stored in an httpOnly cookie and verified on each
    // request, making this safe for a server-rendered + offline-first app.
    strategy: 'jwt',
  },

  secret: process.env.NEXTAUTH_SECRET,

  // Point NextAuth's built-in redirects at the custom page.
  pages: {
    signIn: '/auth/signin',
  },

  callbacks: {
    // Attach the GitHub numeric user ID to the JWT so downstream code can
    // use it as a stable key (e.g. future cloud sync of localStorage data).
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.githubId = (profile as { id?: number }).id;
      }
      return token;
    },

    // Surface githubId on the client-accessible session object.
    async session({ session, token }) {
      if (session.user) {
        (session.user as typeof session.user & { githubId?: number }).githubId =
          token.githubId as number | undefined;
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);

// App Router requires named exports for each HTTP verb.
export { handler as GET, handler as POST };
