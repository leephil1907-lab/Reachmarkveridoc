import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { embedText } from "./embed";
import type { EvidenceChunk } from "./generate";

export type RetrievedChunk = EvidenceChunk & { vectorScore: number; keywordScore: number; fusedScore: number };

export async function retrieveContext(workspaceId: string, query: string): Promise<RetrievedChunk[]> {
  if (!workspaceId || !query.trim()) return [];
  const embedding = await embedText(query);
  const vectorLiteral = `[${embedding.join(",")}]`;
  const result = await db.execute(sql`
    WITH semantic AS (
      SELECT c.id, c.document_id, c.content, d.url, d.title,
        1 - (c.embedding <=> ${vectorLiteral}::vector) AS vector_score,
        row_number() OVER (ORDER BY c.embedding <=> ${vectorLiteral}::vector) AS vector_rank
      FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.workspace_id = ${workspaceId}::uuid AND d.workspace_id = ${workspaceId}::uuid AND d.status = 'active'
      ORDER BY c.embedding <=> ${vectorLiteral}::vector LIMIT 30
    ), keyword AS (
      SELECT c.id, c.document_id, c.content, d.url, d.title,
        ts_rank_cd(to_tsvector('english', c.search_text), websearch_to_tsquery('english', ${query})) AS keyword_score,
        row_number() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.search_text), websearch_to_tsquery('english', ${query})) DESC) AS keyword_rank
      FROM chunks c JOIN documents d ON d.id = c.document_id
      WHERE c.workspace_id = ${workspaceId}::uuid AND d.workspace_id = ${workspaceId}::uuid AND d.status = 'active'
        AND to_tsvector('english', c.search_text) @@ websearch_to_tsquery('english', ${query})
      ORDER BY keyword_score DESC LIMIT 30
    )
    SELECT COALESCE(s.id, k.id) AS id, COALESCE(s.document_id, k.document_id) AS document_id,
      COALESCE(s.content, k.content) AS content, COALESCE(s.url, k.url) AS url,
      COALESCE(s.title, k.title) AS title, s.vector_score, k.keyword_score, s.vector_rank, k.keyword_rank
    FROM semantic s FULL OUTER JOIN keyword k ON k.id = s.id
  `);
  const rows = result.rows as Array<Record<string, unknown>>;
  return rows.map((row) => {
    const vectorRank = row.vector_rank == null ? null : Number(row.vector_rank);
    const keywordRank = row.keyword_rank == null ? null : Number(row.keyword_rank);
    const vectorScore = row.vector_score == null ? 0 : Number(row.vector_score);
    const keywordScore = row.keyword_score == null ? 0 : Number(row.keyword_score);
    return { id: String(row.id), documentId: String(row.document_id), content: String(row.content), url: String(row.url), title: String(row.title), vectorScore, keywordScore, fusedScore: (vectorRank ? 1 / (60 + vectorRank) : 0) + (keywordRank ? 1 / (60 + keywordRank) : 0) };
  }).filter((chunk) => chunk.vectorScore >= 0.72 || chunk.keywordScore >= 0.08).sort((a, b) => b.fusedScore - a.fusedScore).slice(0, 8);
}
