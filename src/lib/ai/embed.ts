import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

export async function embedText(input: string): Promise<number[]> {
  const text = input.trim();
  if (!text) throw new Error("Cannot embed empty text.");
  const response = await openai.embeddings.create({ model, input: text.slice(0, 8000), dimensions: 1536 });
  const embedding = response.data[0]?.embedding;
  if (!embedding || embedding.length !== 1536 || embedding.some((value) => !Number.isFinite(value))) throw new Error("Embedding provider returned an invalid vector.");
  return embedding;
}