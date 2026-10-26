"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

export default function DocumentsPage() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { let alive = true; fetch("/api/auth/me", { cache: "no-store" }).then(async (r) => { if (!r.ok) throw new Error("Please sign in first."); return r.json(); }).then((data) => { if (alive) setWorkspaceId(data.workspaces?.[0]?.id ?? ""); }).catch((e) => { if (alive) setError(e.message || "Could not load workspace."); }); return () => { alive = false; }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/documents/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed.");
      setMessage(`Imported ${data.title} — ${data.chunksImported} searchable chunks.`); setUrl("");
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed."); } finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl space-y-7"><Link href="/dashboard" className="text-sm text-lime-300">← Dashboard</Link><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Knowledge sources</p><h1 className="mt-2 text-3xl font-semibold text-white">Connect documentation</h1><p className="mt-3 text-sm leading-6 text-slate-400">Import one public HTTPS documentation page to begin building your evidence base. Only import material you own or are authorized to use.</p></header><section className="rounded-2xl border border-charcoal-700 bg-charcoal-900 p-6 sm:p-8"><form onSubmit={submit} className="space-y-5"><label className="block text-sm text-slate-200">Documentation page URL<input type="url" required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.example.com/getting-started" className="mt-2 w-full rounded-xl border border-charcoal-700 bg-charcoal-950 px-4 py-3 text-white outline-none focus:border-lime-500" /></label><p className="text-xs leading-5 text-slate-500">Supports public HTTPS HTML and plain-text pages up to 1.5 MB. This first version imports one page; it does not crawl an entire site or access login-protected docs.</p>{error && <p role="alert" className="rounded-lg border border-rose-400/20 p-3 text-sm text-rose-200">{error}</p>}{message && <p role="status" className="rounded-lg border border-lime-400/20 p-3 text-sm text-lime-200">{message}</p>}<button disabled={busy || !workspaceId} className="rounded-xl bg-lime-500 px-5 py-3 font-semibold text-charcoal-950 disabled:opacity-50">{busy ? "Importing and indexing…" : "Import documentation page"}</button></form></section><section className="rounded-2xl border border-charcoal-700 p-5"><h2 className="font-semibold text-white">What happens next?</h2><p className="mt-2 text-sm leading-6 text-slate-400">Prooflayer extracts readable text, creates searchable chunks and embeddings, and makes the source available to retrieval. Answers still need valid citations and pass the verification gate before publication.</p></section></main>;
}
