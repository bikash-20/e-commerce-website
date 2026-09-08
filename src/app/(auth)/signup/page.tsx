"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignupPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get("name"),
      email: fd.get("email"),
      password: fd.get("password"),
    };

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Signup failed");
      setSubmitting(false);
      return;
    }

    // Auto sign-in after successful signup.
    const signInRes = await signIn("credentials", {
      email: body.email,
      password: body.password,
      redirect: false,
    });
    setSubmitting(false);
    if (signInRes?.error) {
      setError("Account created, but auto sign-in failed. Try logging in.");
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto" }}>
      <h1>Create account</h1>

      {error && (
        <div style={{ background: "#f8d7da", padding: 12, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <input
          name="name"
          type="text"
          required
          placeholder="Full name"
          style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
        />
        <input
          name="email"
          type="email"
          required
          placeholder="Email"
          style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
        />
        <input
          name="password"
          type="password"
          required
          placeholder="Password (min 8, mixed case + number)"
          style={{ display: "block", width: "100%", marginBottom: 8, padding: 8 }}
        />
        <button disabled={submitting} type="submit">
          Create account
        </button>
      </form>
    </main>
  );
}
