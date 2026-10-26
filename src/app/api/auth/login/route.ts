import { NextResponse } from "next/server";
import { z } from "zod";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { createSession } from "@/lib/auth/session";
import { enforceRateLimit, requestIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const Body = z.object({ email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  const ipLimit = await enforceRateLimit(`auth:login:ip:${requestIp(request)}`);
  if (!ipLimit.success) return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((ipLimit.reset - Date.now()) / 1000))), "Cache-Control": "no-store" } });
  let input: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  try {
    const [user] = await db.select({ id: users.id, email: users.email, name: users.name, passwordHash: users.passwordHash }).from(users).where(eq(users.email, input.email)).limit(1);
    const valid = user ? await compare(input.password, user.passwordHash) : false;
    if (!user || !valid) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
  }
}
