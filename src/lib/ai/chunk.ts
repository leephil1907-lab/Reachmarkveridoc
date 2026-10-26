export type TextChunk = { index: number; content: string };

export function chunkText(input: string, maxChars = 1200, overlap = 180): TextChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 200) throw new Error("maxChars must be an integer of at least 200.");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= maxChars) throw new Error("overlap must be non-negative and smaller than maxChars.");
  const text = input.replace(/\r\n?/g, "\n").replace(/[\t ]+/g, " ").trim();
  if (!text) return [];
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks: TextChunk[] = [];
  let current = "";
  const flush = () => { if (current.trim()) chunks.push({ index: chunks.length, content: current.trim() }); };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush(); current = "";
      let start = 0;
      while (start < paragraph.length) { const piece = paragraph.slice(start, start + maxChars).trim(); if (piece) chunks.push({ index: chunks.length, content: piece }); if (start + maxChars >= paragraph.length) break; start += maxChars - overlap; }
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) { flush(); const tail = current.slice(-overlap); current = tail ? `${tail}\n\n${paragraph}` : paragraph; }
    else current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return chunks.map((chunk, index) => ({ ...chunk, index }));
}