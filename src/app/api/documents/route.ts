import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers, docSources, documents, chunks } from "@/lib/db/schema";
import { chunkText } from "@/lib/ai/chunk";
import { embedText } from "@/lib/ai/embed";
import { enforceRateLimit, requestIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
const Body = z.object({ workspaceId: z.string().uuid(), url: z.string().url().max(2048) });
const PRIVATE_HOSTS = /^(localhost|.*\.localhost|.*\.local|metadata\.google\.internal)$/i;

async function safePublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP(S) URLs are supported.");
  if (url.username || url.password || PRIVATE_HOSTS.test(url.hostname)) throw new Error("This URL is not allowed.");
  if (url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname.startsWith("10.") || url.hostname.startsWith("192.168.") || url.hostname.startsWith("169.254.") || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) throw new Error("Private network addresses are not allowed.");
  if (!isIP(url.hostname)) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => entry.address.startsWith("127.") || entry.address.startsWith("10.") || entry.address.startsWith("192.168.") || entry.address.startsWith("169.254.") || entry.address === "::1" || entry.address.startsWith("fc") || entry.address.startsWith("fd") || entry.address.startsWith("fe80:"))) throw new Error("This host resolves to a private or restricted address.");
  }
  return url;
}

function extractText(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").trim() || "Imported webpage";
  const main = html.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? html;
  const text = main.replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text: text.slice(0, 100_000) };
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rate = await enforceRateLimit("document-ingest:" + userId + ":" + requestIp(request));
  if (!rate.success) return NextResponse.json({ error: "Too many ingestion requests. Try again shortly." }, { status: 429 });
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Provide a valid workspaceId and URL." }, { status: 400 }); }

  try {
    const [membership] = await db.select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers).innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.workspaceId, body.workspaceId), eq(workspaceMembers.clerkUserId, userId))).limit(1);
    if (!membership) return NextResponse.json({ error: "Workspace access denied." }, { status: 403 });

    const url = await safePublicUrl(body.url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "ProoflayerDocumentationBot/1.0", Accept: "text/html, text/plain;q=0.9" } });
    if (response.status >= 300 && response.status < 400) return NextResponse.json({ error: "Redirected URLs must be submitted directly after review." }, { status: 400 });
    if (!response.ok) return NextResponse.json({ error: "The source returned an unsuccessful response." }, { status: 422 });
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.includes("text/html") && !type.includes("text/plain")) return NextResponse.json({ error: "Only HTML and plain-text pages are supported." }, { status: 415 });
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > 1_000_000) return NextResponse.json({ error: "Source exceeds the 1 MB import limit." }, { status: 413 });
    const raw = await response.text();
    if (raw.length > 1_000_000) return NextResponse.json({ error: "Source exceeds the 1 MB import limit." }, { status: 413 });
    const parsed = type.includes("text/html") ? extractText(raw) : { title: url.hostname, text: raw.slice(0, 100_000).trim() };
    if (parsed.text.length < 80) return NextResponse.json({ error: "Not enough readable text was found on this page." }, { status: 422 });
    const hash = createHash("sha256").update(parsed.text).digest("hex");

    const [source] = await db.insert(docSources).values({ workspaceId: body.workspaceId, type: "url", url: url.toString(), status: "processing" }).returning({ id: docSources.id });
    if (!source) throw new Error("Could not create document source.");
    try {
      const [document] = await db.insert(documents).values({ workspaceId: body.workspaceId, sourceId: source.id, url: url.toString(), title: parsed.title.slice(0, 300), contentHash: hash, status: "active" }).returning({ id: documents.id });
      if (!document) throw new Error("Could not create document.");
      const pieces = chunkText(parsed.text);
      for (const piece of pieces) {
        const embedding = await embedText(piece.content);
        await db.insert(chunks).values({ workspaceId: body.workspaceId, documentId: document.id, chunkIndex: piece.index, content: piece.content, searchText: piece.content, tokenCount: Math.ceil(piece.content.length / 4), embedding });
      }
      await db.update(docSources).set({ status: "active", lastCrawledAt: new Date() }).where(eq(docSources.id, source.id));
      return NextResponse.json({ documentId: document.id, title: parsed.title, url: url.toString(), chunksCreated: pieces.length, status: "indexed" }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      await db.update(docSources).set({ status: "failed" }).where(eq(docSources.id, source.id));
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not allowed|private|restricted|HTTP\(S\)/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
    console.error("Documentation ingestion failed");
    return NextResponse.json({ error: "Could not import this documentation page. Check the URL and try again." }, { status: 502 });
  }
}
