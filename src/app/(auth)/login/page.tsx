"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const sp = useSearchParams();
  const error = sp.get("error");
  const email = sp.get("email") ?? "";
  const mergeToken = sp.get("mergeToken") ?? "";

  const [submitting, setSubmitting] = useState(false);

  async function onCredentials(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: fd.get("email"),
      password: fd.get("password"),
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) alert("Invalid email or password");
    else window.location.href = "/dashboard";
  }

  async function onGoogle() {
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto" }}>
      <h1>Sign in</h1>

      {error === "AccountLinkRequired" && (
        <div style={{ background: "#fff3cd", padding: 12, marginBottom: 12 }}>
          The email <b>{email}</b> already has a password account. To link your
          Google sign-in, sign in below with your password, then link Google
          from your account settings.
          <MergeForm email={email} mergeToken={mergeToken} />
        </div>
      )}

      <form onSubmit={onCredentials}>
        <input
          name="email"
          type="email"
          required
          defaultValue={email}
          placeholder="Email"
          style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
        />
        <button disabled={submitting} type="submit">
          Sign in
        </button>
      </form>

      <hr style={{ margin: "1rem 0" }} />

      <button onClick={onGoogle} type="button">
        Continue with Google
      </button>
    </main>
  );
}

function MergeForm({
  email,
  mergeToken,
}: {
  email: string;
  mergeToken: string;
}) {
  async function complete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/account/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pendingToken: mergeToken,
        password: fd.get("password"),
      }),
    });
    if (res.ok) window.location.reload();
    else alert("Merge failed — sign in with password and try from Account settings.");
  }
  return (
    <form onSubmit={complete} style={{ marginTop: 8 }}>
      <input
        name="password"
        type="password"
        required
        placeholder="Password to confirm link"
        style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
      />
      <button type="submit">Link Google to this account</button>
    </form>
  );
}
