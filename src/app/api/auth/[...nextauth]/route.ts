import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// Force this route to run at request time only. NextAuth + PrismaAdapter
// imports the Prisma client at module load; the build sandbox has no DB.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
