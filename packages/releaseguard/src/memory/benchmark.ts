import { promises as fs } from "node:fs";
import path from "node:path";
import { retrieveWithBm25 } from "./bm25Retriever";
import { retrieveWithEmbeddings } from "./embeddingRetriever";
import {
  RagEvalItem,
  RagEvalDatasetResult,
  RagEvalQueryType,
  writeRagEvalDataset,
} from "./evalDataset";
import {
  DEFAULT_GUARDED_RETRIEVAL_THRESHOLDS,
  GuardedRetrievalThresholds,
  guardedRetrieveWithRrf,
  RetrievalDecision,
} from "./guardedRetriever";
import { writeRepoMemoryIndex } from "./memoryIndex";
import { validateRepoMemoryCitation } from "./memoryCitationValidator";
import { MemoryRetrievalResult } from "./retrieverTypes";
import { fuseWithRrf } from "./rrfRetriever";
import { RepoMemoryChunk } from "./types";

export type RetrieverBenchmarkName =
  | "bm25"
  | "embedding"
  | "rrf_hybrid"
  | "guarded_rrf_hybrid";

export type RetrieverMetrics = {
  recall_at_5: number;
  mrr: number;
  answerable_query_count: number;
  no_answer_query_count: number;
  false_abstention_count: number;
  no_answer_false_positive_rate: number;
  no_answer_abstention_rate: number;
  false_abstention_rate: number;
};

export type RetrieverBenchmarkResult = {
  retriever: RetrieverBenchmarkName;
  metrics: RetrieverMetrics;
};

export type RagBenchmarkRun = {
  index_chunk_count: number;
  dataset_item_count: number;
  query_type_counts: Record<RagEvalQueryType, number>;
  generated_dataset_path: string;
  markdown_report_path: string;
  json_report_path: string;
  results: RetrieverBenchmarkResult[];
  guarded_thresholds_used: GuardedRetrievalThresholds;
  abstention_examples: AbstentionExamples;
  citation_validation_eval: CitationValidationEval;
  limitations: string[];
};

export type AbstentionExample = {
  query_id: string;
  query: string;
  query_type: RagEvalQueryType;
  gold_chunk_ids: string[];
  reason: string;
};

export type AbstentionExamples = {
  no_answer_correct_abstentions: AbstentionExample[];
  answerable_false_abstentions: AbstentionExample[];
};

export type CitationValidationEval = {
  valid_retrieved_citation_passed: boolean;
  nonexistent_chunk_rejected: boolean;
  outside_retrieval_set_rejected: boolean;
  untrusted_decision_context_rejected: boolean;
};

type RetrieverRun = {
  name: RetrieverBenchmarkName;
  resultsByQueryId: Map<string, MemoryRetrievalResult[]>;
  decisionsByQueryId?: Map<string, RetrievalDecision>;
};

export async function runRagBenchmark(
  rootDir: string,
): Promise<RagBenchmarkRun> {
  const index = await writeRepoMemoryIndex(rootDir);
  const dataset = await writeRagEvalDataset(rootDir, index.chunks);
  const runs = await runRetrievers(index.chunks, dataset.items);
  const results = runs.map((run) => ({
    retriever: run.name,
    metrics: computeMetrics(
      dataset.items,
      run.resultsByQueryId,
      run.decisionsByQueryId,
    ),
  }));

  const reportsDir = path.join(rootDir, ".releaseguard", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const markdownReportPath = path.join(reportsDir, "rag_benchmark_v0_2.md");
  const jsonReportPath = path.join(reportsDir, "rag_benchmark_v0_2.json");
  const limitations = benchmarkLimitations(dataset, index.chunks);
  const report: RagBenchmarkRun = {
    index_chunk_count: index.chunks.length,
    dataset_item_count: dataset.items.length,
    query_type_counts: queryTypeCounts(dataset.items),
    generated_dataset_path: dataset.outputPath,
    markdown_report_path: markdownReportPath,
    json_report_path: jsonReportPath,
    results,
    guarded_thresholds_used: DEFAULT_GUARDED_RETRIEVAL_THRESHOLDS,
    abstention_examples: abstentionExamples(dataset.items, runs),
    citation_validation_eval: runCitationValidationEval(index.chunks, runs),
    limitations,
  };
  await fs.writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(
    markdownReportPath,
    renderBenchmarkMarkdown(report, rootDir),
  );
  return report;
}

function runCitationValidationEval(
  chunks: RepoMemoryChunk[],
  runs: RetrieverRun[],
): CitationValidationEval {
  const hybridRun = runs.find((run) => run.name === "rrf_hybrid") ?? runs[0];
  const retrievalResults = [...hybridRun.resultsByQueryId.values()].find(
    (results) => results.length > 0,
  ) ?? [];
  const retrievedChunk = chunks.find(
    (chunk) => chunk.chunk_id === retrievalResults[0]?.chunk_id,
  );
  const outsideChunk = chunks.find(
    (chunk) => !retrievalResults.some((result) => result.chunk_id === chunk.chunk_id),
  );
  const untrustedChunk =
    chunks.find((chunk) => chunk.trust_tier !== "trusted_for_decision_context") ??
    chunks[0];

  const validResult = retrievedChunk
    ? validateRepoMemoryCitation({
        citation: {
          chunk_id: retrievedChunk.chunk_id,
          index_version: retrievedChunk.index_version,
          intended_use: "report_context",
          reason: "benchmark valid retrieved citation",
        },
        chunks,
        retrievalResults,
      }).valid
    : false;

  const nonexistentResult = validateRepoMemoryCitation({
    citation: {
      chunk_id: "mem_does_not_exist",
      index_version: "repo-memory-v0.2",
      intended_use: "report_context",
      reason: "benchmark invalid citation",
    },
    chunks,
    retrievalResults,
  });

  const outsideResult = outsideChunk
    ? validateRepoMemoryCitation({
        citation: {
          chunk_id: outsideChunk.chunk_id,
          index_version: outsideChunk.index_version,
          intended_use: "report_context",
          reason: "benchmark outside retrieval citation",
        },
        chunks,
        retrievalResults,
      })
    : { valid: false, reason: "no_outside_chunk_available" };

  const untrustedResult = validateRepoMemoryCitation({
    citation: {
      chunk_id: untrustedChunk.chunk_id,
      index_version: untrustedChunk.index_version,
      intended_use: "decision_context",
      reason: "benchmark untrusted decision citation",
    },
    chunks,
    retrievalResults: [{ chunk_id: untrustedChunk.chunk_id, rank: 1, score: 1, retriever: "bm25" }],
  });

  return {
    valid_retrieved_citation_passed: validResult,
    nonexistent_chunk_rejected:
      !nonexistentResult.valid && nonexistentResult.reason === "unknown_chunk_id",
    outside_retrieval_set_rejected:
      !outsideResult.valid &&
      outsideResult.reason === "chunk_not_in_current_retrieval_set",
    untrusted_decision_context_rejected:
      !untrustedResult.valid &&
      untrustedResult.reason === "chunk_not_trusted_for_decision_context",
  };
}

async function runRetrievers(
  chunks: RepoMemoryChunk[],
  items: RagEvalItem[],
): Promise<RetrieverRun[]> {
  const bm25 = new Map<string, MemoryRetrievalResult[]>();
  const embedding = new Map<string, MemoryRetrievalResult[]>();
  const hybrid = new Map<string, MemoryRetrievalResult[]>();
  const guarded = new Map<string, MemoryRetrievalResult[]>();
  const guardedDecisions = new Map<string, RetrievalDecision>();

  for (const item of items) {
    const bm25Results = retrieveWithBm25({
      chunks,
      query: item.query,
      limit: 10,
    });
    const embeddingResults = await retrieveWithEmbeddings({
      chunks,
      query: item.query,
      limit: 10,
    });
    bm25.set(item.query_id, bm25Results.slice(0, 5));
    embedding.set(item.query_id, embeddingResults.slice(0, 5));
    hybrid.set(
      item.query_id,
      fuseWithRrf({
        bm25Results,
        embeddingResults,
        limit: 5,
      }),
    );
    const guardedResult = await guardedRetrieveWithRrf({
      chunks,
      query: item.query,
      limit: 5,
    });
    guarded.set(item.query_id, guardedResult.results);
    guardedDecisions.set(item.query_id, guardedResult.decision);
  }

  return [
    { name: "bm25", resultsByQueryId: bm25 },
    { name: "embedding", resultsByQueryId: embedding },
    { name: "rrf_hybrid", resultsByQueryId: hybrid },
    {
      name: "guarded_rrf_hybrid",
      resultsByQueryId: guarded,
      decisionsByQueryId: guardedDecisions,
    },
  ];
}

export function computeMetrics(
  items: RagEvalItem[],
  resultsByQueryId: Map<string, MemoryRetrievalResult[]>,
  decisionsByQueryId?: Map<string, RetrievalDecision>,
): RetrieverMetrics {
  const answerable = items.filter((item) => item.gold_chunk_ids.length > 0);
  const noAnswer = items.filter((item) => item.gold_chunk_ids.length === 0);
  let recalled = 0;
  let reciprocalRankSum = 0;
  let answerableAbstained = 0;

  for (const item of answerable) {
    const results = resultsByQueryId.get(item.query_id) ?? [];
    const abstained = didAbstain(item.query_id, results, decisionsByQueryId);
    if (abstained) {
      answerableAbstained += 1;
      continue;
    }
    const firstGoldIndex = results.findIndex((result) =>
      item.gold_chunk_ids.includes(result.chunk_id),
    );
    if (firstGoldIndex >= 0 && firstGoldIndex < 5) {
      recalled += 1;
      reciprocalRankSum += 1 / (firstGoldIndex + 1);
    }
  }

  let falsePositive = 0;
  let noAnswerAbstained = 0;
  for (const item of noAnswer) {
    const results = resultsByQueryId.get(item.query_id) ?? [];
    const abstained = didAbstain(item.query_id, results, decisionsByQueryId);
    if (abstained) {
      noAnswerAbstained += 1;
    } else if (results.some((result) => result.score > 0)) {
      falsePositive += 1;
    }
  }

  return {
    recall_at_5: answerable.length === 0 ? 0 : recalled / answerable.length,
    mrr: answerable.length === 0 ? 0 : reciprocalRankSum / answerable.length,
    answerable_query_count: answerable.length,
    no_answer_query_count: noAnswer.length,
    false_abstention_count: answerableAbstained,
    no_answer_false_positive_rate:
      noAnswer.length === 0 ? 0 : falsePositive / noAnswer.length,
    no_answer_abstention_rate:
      noAnswer.length === 0 ? 0 : noAnswerAbstained / noAnswer.length,
    false_abstention_rate:
      answerable.length === 0 ? 0 : answerableAbstained / answerable.length,
  };
}

function benchmarkLimitations(
  dataset: RagEvalDatasetResult,
  chunks: RepoMemoryChunk[],
): string[] {
  const limitations = [
    "This is a small demo-corpus benchmark, not a production retrieval benchmark.",
    "v0.2 benchmark uses deterministic local template queries, not a reviewed production eval set.",
    "Embedding baseline defaults to deterministic local token hashing unless an external provider is explicitly configured later.",
    "No-answer handling is required before RAG context can safely influence evidence priority.",
    "RAG retrieval is report context only in v0.2 and does not change PASS/WARN/BLOCK decisions.",
  ];
  if (dataset.items.length < 20 || chunks.length < 30) {
    limitations.push(
      "Dataset and corpus are intentionally small; metrics are directional, not statistically significant.",
    );
  }
  return limitations;
}

function abstentionExamples(
  items: RagEvalItem[],
  runs: RetrieverRun[],
): AbstentionExamples {
  const guardedRun = runs.find((run) => run.name === "guarded_rrf_hybrid");
  if (!guardedRun?.decisionsByQueryId) {
    return {
      no_answer_correct_abstentions: [],
      answerable_false_abstentions: [],
    };
  }
  const examples = items
    .filter(
      (item) =>
        guardedRun.decisionsByQueryId?.get(item.query_id) ===
        "NO_RELEVANT_CONTEXT",
    )
    .map((item) => ({
      query_id: item.query_id,
      query: item.query,
      query_type: item.query_type,
      gold_chunk_ids: item.gold_chunk_ids,
      reason:
        item.gold_chunk_ids.length === 0
          ? "correct no-answer abstention"
          : "false abstention on answerable query",
    }));

  return {
    no_answer_correct_abstentions: examples
      .filter((item) => item.gold_chunk_ids.length === 0)
      .slice(0, 5),
    answerable_false_abstentions: examples
      .filter((item) => item.gold_chunk_ids.length > 0)
      .slice(0, 5),
  };
}

function renderBenchmarkMarkdown(report: RagBenchmarkRun, rootDir: string): string {
  const rel = (filePath: string) =>
    path.relative(rootDir, filePath).split(path.sep).join("/");
  return [
    "# ReleaseGuard Repo Memory RAG Benchmark v0.2",
    "",
    "## Dataset",
    "",
    `Chunks indexed: ${report.index_chunk_count}`,
    `Queries: ${report.dataset_item_count}`,
    `Dataset: ${rel(report.generated_dataset_path)}`,
    "",
    "| Query type | Count |",
    "|---|---:|",
    `| direct | ${report.query_type_counts.direct} |`,
    `| paraphrase | ${report.query_type_counts.paraphrase} |`,
    `| near_miss | ${report.query_type_counts.near_miss} |`,
    `| no_answer | ${report.query_type_counts.no_answer} |`,
    "",
    "## Retriever Comparison",
    "",
    "| Retriever | Recall@5 | MRR | No-answer FPR | No-answer abstention | False abstention | Answerable queries | No-answer queries |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.results.map(
      (result) =>
        `| ${result.retriever} | ${formatMetric(result.metrics.recall_at_5)} | ${formatMetric(result.metrics.mrr)} | ${formatMetric(result.metrics.no_answer_false_positive_rate)} | ${formatMetric(result.metrics.no_answer_abstention_rate)} | ${formatMetric(result.metrics.false_abstention_rate)} | ${result.metrics.answerable_query_count} | ${result.metrics.no_answer_query_count} |`,
    ),
    "",
    "## Interpretation",
    "",
    "BM25 is strong in this repo-memory corpus because many relevant documents contain exact domain terms such as discount, checkout, ADR, incident, and API names.",
    "",
    "The deterministic embedding baseline is local and CI-safe. It validates retrieval plumbing and evaluation without external API keys, but it is not a claim that token hashing matches production-grade semantic embeddings.",
    "",
    "RRF hybrid retrieval does not assume embedding-only retrieval is superior. It uses reciprocal ranks from BM25 and embedding results and can improve ordering quality even when Recall@5 is unchanged.",
    "",
    "Guarded RRF hybrid adds deterministic abstention. It can return NO_RELEVANT_CONTEXT for no-answer queries instead of forcing unrelated chunks into report context.",
    "",
    "No-answer handling is required before RAG context can safely influence evidence priority.",
    "",
    "## Guarded Retriever Calibration",
    "",
    `False abstention count: ${guardedMetrics(report)?.false_abstention_count ?? 0}`,
    `False abstention rate: ${formatMetric(guardedMetrics(report)?.false_abstention_rate ?? 0)}`,
    "",
    "### Thresholds Used",
    "",
    `- BM25 minimum top score: ${report.guarded_thresholds_used.bm25MinTopScore}`,
    `- Minimum meaningful query-token overlap: ${report.guarded_thresholds_used.minQueryTokenOverlap}`,
    `- Minimum meaningful query-token overlap ratio: ${formatMetric(report.guarded_thresholds_used.minQueryTokenOverlapRatio)}`,
    `- Embedding minimum top score: ${report.guarded_thresholds_used.embeddingMinTopScore}`,
    `- Shared top-rank limit for BM25/RRF support: ${report.guarded_thresholds_used.sharedTopRankLimit}`,
    `- RRF guard rule: require positive BM25 lexical signal before returning hybrid context.`,
    `- Metadata support rule: metadata-supported embedding context can support HAS_RELEVANT_CONTEXT only after the lexical guard passes.`,
    "",
    "### Abstention Examples",
    "",
    "No-answer queries correctly abstained:",
    ...formatAbstentionExamples(
      report.abstention_examples.no_answer_correct_abstentions,
    ),
    "",
    "Answerable queries incorrectly abstained:",
    ...formatAbstentionExamples(
      report.abstention_examples.answerable_false_abstentions,
    ),
    "",
    "## Citation Validation Eval",
    "",
    "| Check | Passed |",
    "|---|---:|",
    `| Valid retrieved citation accepted | ${formatBoolean(report.citation_validation_eval.valid_retrieved_citation_passed)} |`,
    `| Nonexistent chunk rejected | ${formatBoolean(report.citation_validation_eval.nonexistent_chunk_rejected)} |`,
    `| Outside retrieval set rejected | ${formatBoolean(report.citation_validation_eval.outside_retrieval_set_rejected)} |`,
    `| Untrusted decision context rejected | ${formatBoolean(report.citation_validation_eval.untrusted_decision_context_rejected)} |`,
    "",
    "## Limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  ].join("\n");
}

function didAbstain(
  queryId: string,
  results: MemoryRetrievalResult[],
  decisionsByQueryId: Map<string, RetrievalDecision> | undefined,
): boolean {
  const decision = decisionsByQueryId?.get(queryId);
  if (decision) {
    return decision === "NO_RELEVANT_CONTEXT";
  }
  return results.length === 0 || !results.some((result) => result.score > 0);
}

function guardedMetrics(report: RagBenchmarkRun): RetrieverMetrics | undefined {
  return report.results.find(
    (result) => result.retriever === "guarded_rrf_hybrid",
  )?.metrics;
}

function formatAbstentionExamples(examples: AbstentionExample[]): string[] {
  if (examples.length === 0) {
    return ["- None"];
  }
  return examples.map((example) => {
    const gold = example.gold_chunk_ids.length > 0
      ? ` gold=${example.gold_chunk_ids.join(",")}`
      : "";
    return `- ${example.query_id}: ${example.query}${gold}`;
  });
}

function queryTypeCounts(
  items: RagEvalItem[],
): Record<RagEvalQueryType, number> {
  return {
    direct: items.filter((item) => item.query_type === "direct").length,
    paraphrase: items.filter((item) => item.query_type === "paraphrase").length,
    near_miss: items.filter((item) => item.query_type === "near_miss").length,
    no_answer: items.filter((item) => item.query_type === "no_answer").length,
  };
}

function formatMetric(value: number): string {
  return value.toFixed(3);
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}
