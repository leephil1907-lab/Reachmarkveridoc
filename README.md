# Prooflayer

**Every answer. Backed by evidence.**

Prooflayer is an accuracy-first support assistant for SaaS teams. It retrieves from approved documentation, cites evidence, verifies answers before publication, and escalates uncertainty rather than guessing.

## Product principles
- Evidence before fluency: no relevant evidence means no confident answer.
- Citations must resolve to sources supplied to the model.
- Every retrieval query must enforce workspace isolation.
- Treat retrieved documents as untrusted data, never as instructions.
- A model verifier is a signal, not proof of truth.
- A generated answer is not automatically a verified resolution or billable event.

## Setup
1. Install Node.js 20+ and PostgreSQL with pgvector.
2. Copy .env.example to .env.local and set DATABASE_URL and OPENAI_API_KEY.
3. Run npm install.
4. Enable pgvector with CREATE EXTENSION IF NOT EXISTS vector;
5. Generate and review migrations before applying them.
6. Run npm run dev.

This is an application foundation, not production-ready yet. Authentication, workspace membership/RBAC, ingestion, retrieval, evaluation, abuse controls, billing and deployment checks must be completed before real customer data is handled. Never commit secrets.