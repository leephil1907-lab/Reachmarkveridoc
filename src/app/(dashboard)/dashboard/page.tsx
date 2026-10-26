import { count, eq, and, gte } from "drizzle-orm";
import { BadgeCheck, FileText, AlertTriangle, ArrowUpRight, ArrowDownRight, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { getSessionUser, getUserWorkspaces } from "@/lib/auth/session";
import { documents, docGaps, usageEvents } from "@/lib/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) {
    return <main className="mx-auto max-w-xl px-6 py-20"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Prooflayer workspace</p><h1 className="mt-3 text-3xl font-semibold text-white">Sign in to view support intelligence</h1><p className="mt-3 text-slate-400">Your documentation coverage and verified-answer metrics will appear here after you connect a workspace.</p><Link className="mt-6 inline-flex rounded-xl bg-lime-500 px-5 py-3 font-semibold text-charcoal-950 hover:bg-lime-400" href="/signin">Sign in</Link></main>;
  }

  const memberships = await getUserWorkspaces(user.id);
  const workspaceId = memberships[0]?.id;
  if (!workspaceId) return <main className="p-8"><h1 className="text-2xl font-semibold">No workspace found</h1><p className="mt-2 text-slate-400">Your account has no workspace membership. Contact your workspace administrator.</p></main>;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [[docCount], [gapCount], [verifiedCount], [totalAnswers]] = await Promise.all([
    db.select({ value: count() }).from(documents).where(and(eq(documents.workspaceId, workspaceId), eq(documents.status, "active"))),
    db.select({ value: count() }).from(docGaps).where(and(eq(docGaps.workspaceId, workspaceId), eq(docGaps.status, "new"))),
    db.select({ value: count() }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId), eq(usageEvents.eventType, "grounded_answer"), gte(usageEvents.createdAt, since))),
    db.select({ value: count() }).from(usageEvents).where(and(eq(usageEvents.workspaceId, workspaceId), gte(usageEvents.createdAt, since)))
  ]);
  const groundedRate = totalAnswers.value ? Math.round((verifiedCount.value / totalAnswers.value) * 100) : null;
  const metrics = [
    { label: "Verified answers", value: String(verifiedCount.value), note: "Last 7 days", icon: BadgeCheck, kind: "positive" },
    { label: "Docs indexed", value: String(docCount.value), note: "Active documents", icon: FileText, kind: "neutral" },
    { label: "Knowledge gaps", value: String(gapCount.value), note: "New gaps identified", icon: AlertTriangle, kind: "warning" },
    { label: "Grounded-answer rate", value: groundedRate === null ? "—" : `${groundedRate}%`, note: totalAnswers.value ? `From ${totalAnswers.value} support events` : "Awaiting first support events", icon: ArrowUpRight, kind: "positive" }
  ];
  return <div className="space-y-8">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-400">Workspace overview</p><h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Support intelligence</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">Monitor verified answers, documentation coverage, and customer escalations using your workspace data.</p></div>
      <Link href="/dashboard/documents" className="inline-flex items-center justify-center rounded-xl bg-lime-500 px-4 py-2.5 text-sm font-semibold text-charcoal-950 hover:bg-lime-400">Connect documentation <span aria-hidden="true" className="ml-2">↗</span></Link>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => <Card key={metric.label} className="border-charcoal-700 bg-charcoal-900 shadow-premium"><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-slate-400">{metric.label}</CardTitle><metric.icon className={`h-4 w-4 ${metric.kind === "warning" ? "text-amber-300" : "text-lime-400"}`} /></CardHeader><CardContent><p className="text-2xl font-semibold text-white">{metric.value}</p><p className="mt-1 text-xs text-slate-400">{metric.note}</p></CardContent></Card>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base text-white">Start building your evidence base</CardTitle><p className="text-sm text-slate-400">Prooflayer needs approved documentation before it can give grounded support answers.</p></CardHeader><CardContent><ol className="space-y-4 text-sm text-slate-300"><li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-500/10 text-lime-300">1</span><span><strong className="text-white">Connect a public docs page</strong><br/>Import an HTTPS page you own or are authorized to use.</span></li><li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-500/10 text-lime-300">2</span><span><strong className="text-white">Test real customer questions</strong><br/>Check citations and confirm when the system refuses to guess.</span></li><li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime-500/10 text-lime-300">3</span><span><strong className="text-white">Review gaps and escalations</strong><br/>Use actual support events to identify documentation improvements.</span></li></ol></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base text-white"><ShieldAlert className="h-4 w-4 text-lime-400"/> Evidence policy</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-slate-400">A generated response is not automatically a verified resolution. Prooflayer should only publish answers that pass citation and verification checks. Empty metrics mean no qualifying events have been recorded yet.</p><p className="mt-4 text-xs text-slate-500">Metrics reflect the last 7 days unless otherwise stated.</p></CardContent></Card>
    </div>
  </div>;
}
