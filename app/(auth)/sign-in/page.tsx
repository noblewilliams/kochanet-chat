"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth/client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(res.error.message || "Sign-in failed");
      return;
    }
    window.location.href = "/";
  }

  async function onGitHub() {
    await signIn.social({ provider: "github", callbackURL: "/" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="text-xs text-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-bg p-2 text-white focus:border-accent focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Password</span>
        <div className="relative mt-1">
          <input
            type={showPw ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg p-2 pr-10 text-white focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-accent"
          >
            {showPw ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>
      {error && <p className="text-sm text-warning">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent p-2 font-semibold text-bg disabled:opacity-60"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <div className="relative py-2 text-center">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-surface px-2 text-xs text-muted">or</span>
      </div>

      <button
        type="button"
        onClick={onGitHub}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-border p-2 text-accent hover:bg-hover"
      >
        <img src="/github.svg" alt="" width={18} height={18} className="invert opacity-70" />
        Continue with GitHub
      </button>

      <p className="text-center text-xs text-muted">
        No account?{" "}
        <a href="/sign-up" className="text-accent underline">
          Sign up
        </a>
      </p>
    </form>
  );
}
