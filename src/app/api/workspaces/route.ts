import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { enforceRateLimit, requestIp } from "@/lib/security/rate-limit";

const Body = z.object({ name: z.string().trim().min(2).max(80), slug: z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = await db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, plan: workspaces.plan })
    .from(workspaceMembers).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.clerkUserId, userId));
  return NextResponse.json({ workspaces: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rate = await enforceRateLimit("workspace-create:" + userId + ":" + requestIp(request));
  if (!rate.success) return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  let input: z.infer<typeof Body>;
  try { input = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Provide a valid workspace name and URL-safe slug." }, { status: 400 }); }

  try {
    const [created] = await db.transaction(async (tx) => {
      const rows = await tx.insert(workspaces).values({ name: input.name, slug: input.slug }).returning({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, plan: workspaces.plan });
      const workspace = rows[0];
      if (!workspace) throw new Error("Workspace creation failed.");
      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, clerkUserId: userId, role: "owner" });
      return rows;
    });
    return NextResponse.json({ workspace: created }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique")) return NextResponse.json({ error: "That workspace slug is already taken." }, { status: 409 });
    console.error("Workspace creation failed");
    return NextResponse.json({ error: "Could not create workspace." }, { status: 500 });
  }
}
