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

## Account and documentation API foundations

- `POST /api/auth/register` creates a user, workspace, owner membership, and an HttpOnly signed session cookie. Passwords are hashed with bcrypt.
- `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/me` provide the initial session endpoints.
- `POST /api/documents/ingest` accepts `{ "workspaceId": "...", "url": "https://docs.example.com/..." }`, requires a signed-in workspace member with an owner/admin/editor role, fetches a public HTTPS HTML/text page, extracts text, chunks it, embeds it, and stores the chunks.
- The public chat and account endpoints use a shared Upstash Redis sliding-window limiter. Production requests fail closed if Upstash credentials are missing.

Required environment variables:
- `AUTH_SECRET`: a unique random secret of at least 32 characters.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: create a Redis database and copy its REST credentials from Upstash.
- Existing `DATABASE_URL` and `OPENAI_API_KEY`.

## Important limitations before production

These are implementation foundations, not a production-ready launch. The database migration history is not yet a complete, generated baseline for a brand-new PostgreSQL database; review and apply migrations against a disposable database first. The URL importer blocks many private-network targets and redirects, but a production-grade importer still needs network-level egress restrictions and DNS-rebinding-resistant fetching. There is no email verification, password reset, MFA, account recovery, session revocation table, team invitation flow, or full human escalation UI. The current session is a signed cookie with a seven-day expiry. Add security tests and run CI plus live PostgreSQL/pgvector migration and ingestion tests before exposing the API to customers.

The verifier is a model-based gate, not proof of truth. Do not count generated answers as billable verified resolutions automatically. Never commit secrets.