import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import {
  ensureDevUser,
  isDevLoginEnabled,
  parseDevLoginWho,
} from "@/lib/dev-login";
import { prisma } from "@/lib/prisma";

const providers: NextAuthConfig["providers"] = [...authConfig.providers];

if (isDevLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev",
      credentials: {
        who: { label: "Who", type: "text" },
      },
      async authorize(credentials) {
        if (!isDevLoginEnabled()) return null;
        const who = parseDevLoginWho(credentials?.who);
        if (!who) return null;
        const user = await ensureDevUser(who);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
});
