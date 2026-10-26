import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { chunks, documents, docSources, workspaceMembers } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { embedText } from "@/lib/ai/embed";
import { chunkText } from "@/lib/ai/chunk";
import { fetchPublicDocument } from "@/lib/security/safe-fetch";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;
const Body = z.object({ workspaceId: z.string().uuid(), url: z.string().url().max(2048) });

function extractText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "";
  const text = html.replace(/<(script|style|noscript|svg|nav|footer|header|form)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title: title.replace(/\s+/g, " ").trim().slice(0, 300), text };
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to import documentation." }, { status: 401 });
  const limit = await enforceRateLimit(`ingest:user:${user.id}`);
  if (!limit.success) return NextResponse.json({ error: "Too many import attempts. Try again shortly." }, { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))) } });
  let input: z.infer<typeof Body>;
  try {
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid workspaceId and HTTPS documentation URL." }, { status: 400 });
    input = parsed.data;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const [membership] = await db.select({ role: workspaceMembers.role }).from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.workspaceId, input.workspaceId))).limit(1);
  if (!membership || !["owner", "admin", "editor"].includes(membership.role)) return NextResponse.json({ error: "You do not have permission to import documents into this workspace." }, { status: 403 });

  try {
    const fetched = await fetchPublicDocument(input.url);
    const extracted = extractText(fetched.html);
    if (extracted.text.length < 80) return NextResponse.json({ error: "This page did not contain enough readable documentation text to import." }, { status: 422 });
    const contentHash = createHash("sha256").update(extracted.text).digest("hex");
    const sourceTitle = extracted.title || new URL(fetched.url).hostname;
    const created = await db.transaction(async (tx) => {
      const [source] = await tx.insert(docSources).values({ workspaceId: input.workspaceId, type: "url", url: fetched.url, status: "processing" }).returning({ id: docSources.id });
      if (!source) throw new Error("Could not create document source.");
      const [document] = await tx.insert(documents).values({ workspaceId: input.workspaceId, sourceId: source.id, url: fetched.url, title: sourceTitle, contentHash, status: "processing" }).returning({ id: documents.id });
      if (!document) throw new Error("Could not create document.");
      return { sourceId: source.id, documentId: document.id };
    });

    const parts = chunkText(extracted.text);
    for (const part of parts) {
      const embedding = await embedText(part.content);
      await db.insert(chunks).values({ workspaceId: input.workspaceId, documentId: created.documentId, chunkIndex: part.index, content: part.content, searchText: part.content, tokenCount: Math.ceil(part.content.length / 4), embedding });
    }
    await db.update(documents).set({ status: "active", updatedAt: new Date() }).where(eq(documents.id, created.documentId));
    await db.update(docSources).set({ status: "active", lastCrawledAt: new Date() }).where(eq(docSources.id, created.sourceId));
    return NextResponse.json({ documentId: created.documentId, title: sourceTitle, url: fetched.url, chunksImported: parts.length, status: "active" }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prooflayer document import failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "The page could not be imported. Check that it is a public HTTPS documentation page and try again." }, { status: 422 });
  }
}
