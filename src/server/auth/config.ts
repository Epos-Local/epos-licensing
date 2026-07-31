import { compare } from "bcryptjs";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { db } from "~/server/db";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * Single admin login, per `Licensing_Design.md`'s "Panel's own auth" note.
 *
 * Credentials rather than an OAuth provider because this panel has exactly one
 * operator and no reseller tenancy yet, so a third-party identity provider
 * would add a dependency without removing any work. The `User` table and its
 * NextAuth companions are kept intact so a `role`/`scope` column and a second
 * provider can be added later without a redesign, as the design doc anticipates.
 *
 * Sessions are JWTs: the Credentials provider cannot use database sessions, and
 * a stateless cookie also means the panel keeps working through a Supabase
 * connection blip.
 */
export const authConfig = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        // Compare against a throwaway hash when the user is missing so a wrong
        // email and a wrong password take the same time to answer, and neither
        // reveals which one was wrong.
        const hash = user?.passwordHash ?? UNMATCHABLE_HASH;
        const ok = await compare(parsed.data.password, hash);

        if (!ok || !user?.passwordHash) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) token.sub = user.id;
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: { ...session.user, id: token.sub ?? "" },
    }),
  },
} satisfies NextAuthConfig;

/**
 * A well-formed bcrypt hash of a discarded 32-byte random value, so nothing a
 * caller can submit will ever match it. It exists only to give `compare` real
 * work to do on the no-such-user path.
 */
const UNMATCHABLE_HASH =
  "$2b$10$/fKp9sHDyCFOftmAXlxIHOunBmS9Q961Fv9JAWDGHCf01BrOvip8e";
