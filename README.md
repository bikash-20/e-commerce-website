# E-commerce Auth Scaffold

NextAuth v4 + Prisma + Supabase. Email/password and Google OAuth, with an explicit
account-link flow when an OAuth login collides with an existing password account.

## Stack

- **Next.js 14.2** (App Router)
- **NextAuth 4.24** with `@auth/prisma-adapter` and **database sessions**
- **Prisma 5.22** against **Supabase Postgres** (pooler for runtime, direct for migrations)
- **bcryptjs** for password hashing (cost 12)
- **Zod** for input validation
- **Google OAuth** via `next-auth/providers/google`

## Local development

```bash
cp .env.example .env.local
# Fill in DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

npm install
npx prisma migrate dev --name init
npm run dev
```

App runs at http://localhost:3000.

Generate a `NEXTAUTH_SECRET` with:

```bash
openssl rand -base64 32
```

## Environment variables

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | App runtime | **Supabase transaction-mode pooler** (port 6543). Must include `?pgbouncer=true&connection_limit=1&sslmode=require`. |
| `DIRECT_URL` | Prisma migrations + Studio | **Supabase direct connection** (port 5432). Session mode. |
| `NEXTAUTH_SECRET` | NextAuth | 32+ random bytes, base64. |
| `NEXTAUTH_URL` | NextAuth | Full URL of the deployment. On Vercel, set `AUTH_TRUST_HOST=true` and omit. |
| `GOOGLE_CLIENT_ID` | Google provider | From Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Google provider | From Google Cloud Console. |

`.env.local` is git-ignored. Never commit it.

## Architecture decisions

- **Database sessions, not JWT.** NextAuth's database session strategy means
  `getServerSession()` always hits Postgres. Middleware uses the signed cookie
  payload so it stays fast.
- **Pooler for the app, direct for migrations.** The Supabase pooler (pgbouncer)
  drops prepared statements, which Prisma migrations rely on. Both URLs are
  configured in `prisma/schema.prisma`.
- **No auto-link by email.** NextAuth's `allowDangerousEmailAccountLinking` is
  intentionally `false`. If a Google login's email already exists with a
  password, the user is redirected to `/login?error=AccountLinkRequired` with a
  one-shot token, and must confirm their password at `/api/account/merge`.
- **Constant-ish-time credentials check.** When the email is unknown, we still
  bcrypt-compare against a dummy hash so timing doesn't reveal whether an
  account exists.

## Security caveats (read before launch)

1. **In-memory rate limiting.** `src/lib/rateLimit.ts` uses a `Map` per process.
   On Vercel/serverless this means each cold instance gets its own bucket, so
   the effective limit is `instances × limit`. **Replace with Upstash Redis or
   Vercel KV before launch.**
2. **In-memory pending merge store.** `createPendingOAuthMerge` in
   `src/lib/auth.ts` keeps 15-minute merge tokens in a `Map`. Lost on cold
   start, useless across regions. **Replace with Redis/KV before launch.**
3. **No CSRF check on `/api/signup`.** NextAuth's own routes have CSRF
   protection, but the custom signup route does not. Add an `Origin` check
   against `NEXTAUTH_URL` before going live.
4. **User enumeration on signup.** `/api/signup` returns "Email already
   registered" on duplicate. Consider the privacy trade-off vs. always-200
   responses.
5. **Google OAuth redirect URI.** Must be configured in Google Cloud Console
   for each environment (see deploy steps below).

## Deployment

### Architecture

| Service | Role |
|---|---|
| GitHub | Source of truth. Push to `main` triggers both Vercel and the migration workflow. |
| Vercel | Hosts the Next.js app. Auto-deploys on push to `main`. |
| GitHub Actions | Runs `prisma migrate deploy` against Supabase on every push to `main`. |
| Supabase | Postgres. App uses the pooler (port 6543); migrations use the direct connection (port 5432). |
| Render (Blueprint) | Optional cron job that runs `prisma migrate deploy` daily at 02:00 UTC as a backup to GitHub Actions. |

The GitHub Actions workflow is the primary migration runner. The Render cron is
a safety net for ad-hoc drift.

### 1. Supabase

1. Create a project at https://supabase.com.
2. **Project Settings → Database → Connection string**:
   - **Transaction pooler** (port 6543) → `DATABASE_URL`.
   - **Direct connection** (port 5432) → `DIRECT_URL`.
3. Don't run the SQL wizard — Prisma owns the schema.

### 2. Vercel

1. https://vercel.com/new → **Import** `bikash-20/e-commerce-website`.
2. Framework: **Next.js** (auto-detected).
3. **Build Command override** (Project Settings → General → Build & Development Settings):
   ```
   prisma generate && next build
   ```
4. **Environment Variables** (Project Settings → Environment Variables, scope = Production + Preview):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler URL |
   | `DIRECT_URL` | Supabase direct URL |
   | `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | your Vercel URL (or set `AUTH_TRUST_HOST=true` instead) |
   | `GOOGLE_CLIENT_ID` | from Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | from Google Cloud Console |

5. Deploy. If you skipped `NEXTAUTH_URL`, set `AUTH_TRUST_HOST=true` and redeploy.

### 3. GitHub Actions — migrations

Add two repository secrets at
`https://github.com/bikash-20/e-commerce-website/settings/secrets/actions`:

| Secret | Value |
|---|---|
| `DIRECT_URL` | Supabase **direct** URL (port 5432). Used for both `DATABASE_URL` and `DIRECT_URL` in the workflow — migrations need session mode. |
| (optional) `DATABASE_URL` | Supabase pooler URL, if you want the workflow to also exercise the runtime path. |

The workflow at `.github/workflows/migrate.yml` runs on every push to `main` and
on manual dispatch (`Actions → prisma migrate deploy → Run workflow`).

### 4. Render Blueprint (backup migration runner)

1. https://render.com → **New** → **Blueprint** → connect the repo.
2. Render reads `render.yaml` from the repo root and creates a cron job named
   `prisma-migrate` that runs `npx prisma migrate deploy` daily at 02:00 UTC.
3. In the Render dashboard, set these env vars on the cron service:
   - `DATABASE_URL` = Supabase direct URL (port 5432)
   - `DIRECT_URL` = same value
4. Hit **Run Job** once after the first Vercel deploy to seed the tables.

### 5. Google OAuth redirect URIs

In Google Cloud Console → APIs & Services → Credentials → your OAuth client →
**Authorized redirect URIs**, add:

```
https://<your-app>.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

### 6. Supabase auth URL (optional)

Supabase Dashboard → Authentication → URL Configuration → **Site URL**:

```
https://<your-app>.vercel.app
```

Only matters if you also use Supabase Auth directly. The scaffold uses
NextAuth's adapter for storage only, so this is informational.

## Project layout

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── account/page.tsx
│   ├── checkout/page.tsx
│   ├── dashboard/page.tsx
│   ├── layout.tsx
│   └── api/
│       ├── account/merge/route.ts
│       ├── auth/[...nextauth]/route.ts
│       └── signup/route.ts
├── lib/
│   ├── auth.ts
│   ├── password.ts
│   ├── prisma.ts
│   ├── rateLimit.ts
│   └── validation.ts
└── types/
    └── next-auth.d.ts
```

## Scripts

```bash
npm run dev              # next dev
npm run build            # next build
npm run start            # next start
npm run prisma:generate  # prisma generate
npm run prisma:migrate   # prisma migrate dev
npm run prisma:deploy    # prisma migrate deploy
npm run prisma:studio    # prisma studio
npm run lint             # next lint
npm run typecheck        # tsc --noEmit
```
