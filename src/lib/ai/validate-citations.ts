export type CitationSource = { source: number; documentId: string; url: string; title: string };

export function validateCitations(answer: string, sourceCount: number) {
  const matches = [...answer.matchAll(/\[(\d+)\]/g)];
  const numbers = [...new Set(matches.map((match) => Number(match[1])))];
  if (numbers.length === 0) return { valid: false, numbers, reason: "no_citations" as const };
  if (numbers.some((number) => !Number.isInteger(number) || number < 1 || number > sourceCount)) return { valid: false, numbers, reason: "unknown_source" as const };
  return { valid: true, numbers };
}

export function resolveCitations(numbers: number[], chunks: Array<{ id: string; documentId: string; url: string; title: string }>): CitationSource[] {
  return [...new Set(numbers)].map((source) => {
    const chunk = chunks[source - 1];
    if (!chunk) throw new Error("Citation references a source that was not supplied.");
    return { source, documentId: chunk.documentId, url: chunk.url, title: chunk.title };
  });
}