import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const accounts = await prisma.account.findMany({
    where: { userId: (session.user as any).id },
    select: { provider: true },
  });

  return (
    <main style={{ maxWidth: 640, margin: "4rem auto" }}>
      <h1>Account</h1>
      <p>Signed in as {session.user?.email}</p>

      <h2>Linked providers</h2>
      <ul>
        {accounts.map((a) => (
          <li key={a.provider}>{a.provider}</li>
        ))}
        {accounts.length === 0 && <li>None</li>}
      </ul>
    </main>
  );
}
