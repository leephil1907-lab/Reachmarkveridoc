# Prooflayer

**Every answer. Backed by evidence.**

Prooflayer is an accuracy-first support assistant for SaaS teams. It retrieves from approved documentation, cites evidence, verifies answers before publication, and escalates uncertainty rather than guessing.

## Implemented foundation
- Next.js App Router, TypeScript and the Reachmark-aligned charcoal/lime visual system.
- Initial workspace, document, chunk, conversation, message, documentation-gap and usage-event schema.
- PostgreSQL/pgvector client and workspace-scoped hybrid retrieval using vector similarity, PostgreSQL full-text search and reciprocal-rank fusion.
- Text chunking, embeddings, deterministic citation validation, grounded generation and conservative verification.
- Initial public chat API pipeline and a product landing page.
- CI workflow for type-checking, linting and build checks.

## Chat API
Send a POST request to /api/chat with a JSON body containing workspaceSlug and message. Example:

    {"workspaceSlug":"your-workspace","message":"How do I update my billing details?","visitorId":"anonymous-session-id"}

For a follow-up, include the returned conversationId. The workspace slug is a public widget identifier, not an authentication mechanism. Do not expose private workspace data through this endpoint.

The API only returns a generated answer when citations validate and the verifier returns publish. Otherwise it returns a safe fallback and records the outcome for later review. The verifier is a model-based gate, not proof of truth.

## Local setup
1. Install Node.js 20+ and PostgreSQL with the vector extension.
2. Copy .env.example to .env.local and set DATABASE_URL and OPENAI_API_KEY.
3. Run npm install.
4. Apply the schema using reviewed Drizzle migrations, then enable pgvector and create the indexes in drizzle/0000_initial_extensions.sql after the tables exist.
5. Run npm run dev.

## Important gaps before production
Authentication and workspace membership, rate limiting and abuse prevention, secure source ingestion, a real human escalation workflow, retention controls, billing/webhook handling, automated golden-question evaluations, and a live database-backed test run are not complete. The chat API must be protected with rate limits before public traffic. Do not count generated answers as billable verified resolutions automatically. Never commit secrets.