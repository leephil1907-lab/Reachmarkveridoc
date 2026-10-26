import { NextResponse } from "next/server";
import { getSessionUser, getUserWorkspaces } from "@/lib/auth/session";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const workspaces = await getUserWorkspaces(user.id);
  return NextResponse.json({ user, workspaces }, { headers: { "Cache-Control": "no-store" } });
}
