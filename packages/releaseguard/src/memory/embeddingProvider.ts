import { createHash } from "node:crypto";
import { tokenize } from "./tokenize";

export type EmbeddingProvider = {
  name: string;
  model: string;
  embed(text: string): Promise<number[]>;
};

export class DeterministicLocalEmbeddingProvider implements EmbeddingProvider {
  name = "deterministic_local";
  model = "token_hashing_v1";

  constructor(private readonly dimensions = 256) {}

  async embed(text: string): Promise<number[]> {
    const vector = new Array(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const hash = createHash("sha1").update(token).digest();
      const index = hash.readUInt32BE(0) % this.dimensions;
      vector[index] += 1;
    }
    return normalize(vector);
  }
}

export function defaultEmbeddingProvider(): EmbeddingProvider {
  return new DeterministicLocalEmbeddingProvider();
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((value) => value / norm);
}
