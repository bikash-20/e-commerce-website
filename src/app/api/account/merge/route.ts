import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, consumePendingOAuthMerge } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { MergeAccountSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon";
  const limit = rateLimit(`merge:${ip}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = MergeAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { pendingToken, password } = parsed.data;

  // Confirm password against CURRENT logged-in user (the password account).
  const me = await prisma.user.findUnique({
    where: { id: (session.user as any).id },
  });
  if (!me?.passwordHash) {
    return NextResponse.json({ error: "No password set on account" }, { status: 400 });
  }

  const ok = await verifyPassword(password, me.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const pending = consumePendingOAuthMerge(pendingToken);
  if (!pending) {
    return NextResponse.json({ error: "Merge token expired or invalid" }, { status: 400 });
  }

  // Belt-and-suspenders: email on the OAuth payload must match the current user.
  if (pending.email !== me.email) {
    return NextResponse.json({ error: "Email mismatch" }, { status: 400 });
  }

  await prisma.account.create({
    data: {
      userId: me.id,
      type: "oauth",
      provider: pending.provider,
      providerAccountId: pending.providerAccountId,
    },
  });

  return NextResponse.json({ ok: true });
}
