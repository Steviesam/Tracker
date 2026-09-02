"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/credentials";

export default function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? "Could not create the account.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-7 space-y-4">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Name
        </label>
        <input
          id="name"
          required
          autoComplete="name"
          className="field"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          className="field"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          className="field"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className={`mt-1 text-[12px] ${tooShort ? "text-rose-600" : "text-slate-500"}`}>
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-[13px] font-medium text-slate-700">
          Confirm password
        </label>
        <input
          id="confirm"
          type="password"
          required
          autoComplete="new-password"
          className="field"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        {mismatch ? <p className="mt-1 text-[12px] text-rose-600">Passwords do not match.</p> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="animate-fade rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary w-full py-2.5"
        disabled={submitting || tooShort || mismatch}
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
