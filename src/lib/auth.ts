import { randomBytes } from "crypto";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { LoginSchema } from "@/lib/validation";

// --- Pending merge store (in-memory; replace with Redis/KV in production) ---
type PendingMerge = {
  provider: string;
  providerAccountId: string;
  email: string;
  profileImage?: string;
  expiresAt: number;
};
const pendingMerges = new Map<string, PendingMerge>();

async function createPendingOAuthMerge(
  p: Omit<PendingMerge, "expiresAt">,
): Promise<string> {
  const token = randomBytes(24).toString("hex");
  pendingMerges.set(token, { ...p, expiresAt: Date.now() + 1000 * 60 * 15 });
  return token;
}

export function consumePendingOAuthMerge(token: string): PendingMerge | null {
  const m = pendingMerges.get(token);
  if (!m || m.expiresAt < Date.now()) {
    pendingMerges.delete(token);
    return null;
  }
  pendingMerges.delete(token); // one-shot
  return m;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Block auto-link-by-email. We handle this in signIn callback below.
      allowDangerousEmailAccountLinking: false,
    }),
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const parsed = LoginSchema.safeParse(creds);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        // Constant-ish-time response to avoid user enumeration via timing.
        // We do NOT short-circuit on missing user; we still hash-compare against a dummy.
        const hash =
          user?.passwordHash ??
          "$2a$12$0000000000000000000000000000000000000000000000000000";
        const ok = await verifyPassword(password, hash);
        if (!user || !user.passwordHash || !ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;

      // Block silent auto-link.
      const existing = await prisma.user.findUnique({
        where: { email: user.email! },
        include: { accounts: true },
      });

      if (!existing) return true; // new OAuth user → create
      if (existing.accounts.some((a) => a.provider === "google")) return true; // already linked

      // Conflict: email exists via password, but this Google login is unlinked.
      // Surface a merge prompt instead of silently linking.
      const url = new URL("/login?error=AccountLinkRequired", process.env.NEXTAUTH_URL!);
      url.searchParams.set("email", user.email!);
      // Stash OAuth details server-side keyed by a short-lived token so /account/merge can complete it.
      const mergeToken = await createPendingOAuthMerge({
        provider: "google",
        providerAccountId: account!.providerAccountId,
        email: user.email!,
        profileImage: (profile as any)?.picture,
      });
      url.searchParams.set("mergeToken", mergeToken);
      return url.toString(); // NextAuth redirects here on a string return
    },
    async session({ session, user }) {
      if (session.user && user) (session.user as any).id = user.id;
      return session;
    },
  },
};
