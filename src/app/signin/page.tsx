"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Sign in failed.");
      router.push("/dashboard"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Sign in failed."); } finally { setBusy(false); }
  }
  return <main className="flex min-h-dvh items-center justify-center px-5 py-12"><section className="w-full max-w-md rounded-3xl border border-charcoal-700 bg-charcoal-900 p-7 shadow-premium sm:p-9"><Link href="/" className="text-sm font-semibold tracking-wide text-lime-400">PROOFLAYER</Link><h1 className="mt-8 text-3xl font-semibold text-white">Welcome back.</h1><p className="mt-2 text-sm text-slate-400">Sign in to your support intelligence workspace.</p><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-sm text-slate-300">Work email<input autoComplete="email" type="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-charcoal-700 bg-charcoal-950 px-4 py-3 text-white outline-none focus:border-lime-500"/></label><label className="block text-sm text-slate-300">Password<input autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-charcoal-700 bg-charcoal-950 px-4 py-3 text-white outline-none focus:border-lime-500"/></label>{error&&<p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-lime-500 px-4 py-3 font-semibold text-charcoal-950 disabled:opacity-60">{busy?"Signing in…":"Sign in"}</button></form><p className="mt-6 text-sm text-slate-400">New to Prooflayer? <Link href="/signup" className="text-lime-300 hover:text-lime-200">Create an account</Link></p></section></main>;
}
