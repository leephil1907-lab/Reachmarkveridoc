import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaces, conversations, messages, usageEvents } from "@/lib/db/schema";
import { retrieveContext } from "@/lib/ai/retrieve";
import { generateGroundedAnswer } from "@/lib/ai/generate";
import { verifyAnswer } from "@/lib/ai/verify";
import { validateCitations, resolveCitations } from "@/lib/ai/validate-citations";

export const runtime = "nodejs";
const RequestBody = z.object({
  workspaceSlug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(2000),
  visitorId: z.string().trim().min(1).max(120).optional()
});
const safeReply = "I couldn’t verify a reliable answer from the available documentation. I can route this to the support team.";

export async function POST(request: Request) {
  let body: z.infer<typeof RequestBody>;
  try {
    const json: unknown = await request.json();
    const parsed = RequestBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const [workspace] = await db.select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
      .from(workspaces).where(eq(workspaces.slug, body.workspaceSlug)).limit(1);
    if (!workspace) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

    let conversationId = body.conversationId;
    if (conversationId) {
      const [existing] = await db.select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspace.id)))
        .limit(1);
      if (!existing) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    } else {
      const [created] = await db.insert(conversations).values({
        workspaceId: workspace.id,
        visitorId: body.visitorId,
        channel: "widget",
        status: "open"
      }).returning({ id: conversations.id });
      if (!created) throw new Error("Could not create conversation.");
      conversationId = created.id;
    }

    await db.insert(messages).values({ conversationId, role: "user", content: body.message });
    const chunks = await retrieveContext(workspace.id, body.message);
    const generated = await generateGroundedAnswer({ question: body.message, chunks });
    let answer = safeReply;
    let outcome = "unverified";
    let citationDetails: ReturnType<typeof resolveCitations> = [];
    let verification: Awaited<ReturnType<typeof verifyAnswer>> | null = null;

    if (!generated.refused) {
      const citationCheck = validateCitations(generated.answer, chunks.length);
      if (citationCheck.valid) {
        verification = await verifyAnswer({ question: body.message, answer: generated.answer, chunks });
        if (verification.decision === "publish") {
          answer = generated.answer;
          outcome = "grounded_answer";
          citationDetails = resolveCitations(citationCheck.numbers, chunks);
        } else {
          outcome = verification.decision === "review" ? "needs_review" : "blocked";
        }
      } else {
        outcome = "invalid_citations";
      }
    } else {
      outcome = generated.reason ?? "refused";
    }

    await db.insert(messages).values({
      conversationId,
      role: "assistant",
      content: answer,
      faithfulness: verification ? String(verification.faithfulness) : null,
      relevance: verification ? String(verification.relevance) : null,
      citations: citationDetails
    });
    await db.insert(usageEvents).values({
      workspaceId: workspace.id,
      conversationId,
      eventType: outcome,
      quantity: 1,
      metadata: { sourceCount: chunks.length, verificationDecision: verification?.decision ?? "not_run" }
    });

    return NextResponse.json({
      conversationId,
      answer,
      citations: citationDetails,
      status: outcome === "grounded_answer" ? "verified" : outcome === "needs_review" ? "needs_review" : "escalation_recommended",
      verification: verification ? {
        faithfulness: verification.faithfulness,
        relevance: verification.relevance,
        completeness: verification.completeness,
        citationSupport: verification.citationSupport,
        decision: verification.decision,
        reason: verification.reason
      } : null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Prooflayer chat request failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ error: "The support assistant is temporarily unavailable. Please try again." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
