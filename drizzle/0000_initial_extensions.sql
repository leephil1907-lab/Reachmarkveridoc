CREATE EXTENSION IF NOT EXISTS vector;

-- Apply only after the base Drizzle schema has created the chunks table.
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS chunks_search_text_gin_idx
  ON chunks USING gin (to_tsvector('english', search_text));

CREATE INDEX IF NOT EXISTS chunks_workspace_document_idx
  ON chunks (workspace_id, document_id);
