import { RepoMemoryChunk } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function applyTemporalDecay(
  score: number,
  chunk: RepoMemoryChunk,
  now = new Date("2026-05-06T00:00:00.000Z"),
): number {
  if (!chunk.created_at || chunk.source_type === "adr") {
    return score;
  }

  const createdAt = new Date(chunk.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return score;
  }

  const ageDays = Math.max(0, (now.getTime() - createdAt.getTime()) / DAY_MS);
  return score * Math.exp(-ageDays / 365);
}
