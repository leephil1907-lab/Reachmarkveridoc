import { NextResponse } from "next/server";
import { z } from "zod";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { users, workspaces, workspaceMembers } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session";
import { enforceRateLimit, requestIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const Body = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  workspaceName: z.string().trim().min(2).max(100)
});

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

export async function POST(request: Request) {
  const ipLimit = await enforceRateLimit(`auth:register:ip:${requestIp(request)}`);
  if (!ipLimit.success) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((ipLimit.reset - Date.now()) / 1000))), "Cache-Control": "no-store" } });
  let input: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid name, email, workspace name, and password of at least 12 characters." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const passwordHash = await hash(input.password, 12);
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
      if (existing) throw new Error("EMAIL_ALREADY_EXISTS");
      const [user] = await tx.insert(users).values({ name: input.name, email: input.email, passwordHash }).returning({ id: users.id, email: users.email, name: users.name });
      if (!user) throw new Error("Could not create user.");
      const baseSlug = slugify(input.workspaceName) || "workspace";
      const slug = `${baseSlug}-${user.id.slice(0, 8)}`;
      const [workspace] = await tx.insert(workspaces).values({ name: input.workspaceName, slug }).returning({ id: workspaces.id });
      if (!workspace) throw new Error("Could not create workspace.");
      await tx.insert(workspaceMembers).values({ userId: user.id, workspaceId: workspace.id, role: "owner" });
      return user;
    });
    await createSession(result.id);
    return NextResponse.json({ user: result }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/unique|duplicate|users_email/i.test(message)) return NextResponse.json({ error: "An account with this email may already exist." }, { status: 409 });
    console.error("Prooflayer registration failed");
    return NextResponse.json({ error: "Could not create the account right now." }, { status: 503 });
  }
}
