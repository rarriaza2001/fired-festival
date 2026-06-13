/** Lightweight semantic similarity (no embedding API) for deduplication. */

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'your', 'are', 'was', 'were',
  'have', 'has', 'had', 'not', 'but', 'from', 'they', 'their', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'into', 'about', 'than', 'then', 'when',
  'what', 'which', 'who', 'how', 'all', 'any', 'each', 'more', 'most', 'other',
  'some', 'such', 'only', 'also', 'very', 'just', 'been', 'being', 'does', 'did',
  'doing', 'its', 'our', 'out', 'over', 'under', 'again', 'further',
]);

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequency(words: readonly string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const word of words) {
    tf.set(word, (tf.get(word) ?? 0) + 1);
  }
  return tf;
}

function cosineFromMaps(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [, v] of a) normA += v * v;
  for (const [, v] of b) normB += v * v;
  for (const [key, va] of a) {
    const vb = b.get(key);
    if (vb !== undefined) dot += va * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function trigrams(text: string): string[] {
  const normalized = normalizeText(text).replace(/\s/g, '');
  if (normalized.length < 3) return normalized ? [normalized] : [];
  const grams: string[] = [];
  for (let i = 0; i <= normalized.length - 3; i += 1) {
    grams.push(normalized.slice(i, i + 3));
  }
  return grams;
}

function trigramJaccard(a: string, b: string): number {
  const setA = new Set(trigrams(a));
  const setB = new Set(trigrams(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function wordJaccard(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function substringOverlap(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const shorter = na.length <= nb.length ? na : nb;
  const longer = na.length <= nb.length ? nb : na;
  return longer.includes(shorter) && shorter.length / longer.length >= 0.68;
}

export function semanticSimilarity(a: string, b: string): number {
  const tfA = termFrequency(tokens(a));
  const tfB = termFrequency(tokens(b));
  return Math.max(cosineFromMaps(tfA, tfB), trigramJaccard(a, b), wordJaccard(a, b));
}

export function isSemanticallySimilar(a: string, b: string, threshold = 0.58): boolean {
  if (substringOverlap(a, b)) return true;
  return semanticSimilarity(a, b) >= threshold;
}

export function chunkUserContext(text: string, maxChunkChars = 280): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 12);
  if (sentences.length === 0) return [normalized];
  const chunks: string[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (buffer.length + sentence.length + 1 > maxChunkChars && buffer.length > 0) {
      chunks.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}
