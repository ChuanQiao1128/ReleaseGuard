import { z } from "zod";

export const confidenceLevelSchema = z.enum([
  "high",
  "medium",
  "low",
  "unresolved",
]);
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

export const capabilityNodeTypeSchema = z.enum([
  "file",
  "module",
  "package",
  "route",
  "api",
  "test",
]);
export type CapabilityNodeType = z.infer<typeof capabilityNodeTypeSchema>;

export const capabilityEdgeTypeSchema = z.enum([
  "defines",
  "belongs_to",
  "consumes",
  "tested_by",
]);
export type CapabilityEdgeType = z.infer<typeof capabilityEdgeTypeSchema>;

export const riskLevelSchema = z.enum(["low", "medium", "high"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const testCaseTagSchema = z.enum([
  "valid_discount",
  "invalid_discount",
  "expired_discount",
  "400",
  "500",
  "error_status",
  "success_status",
]);
export type TestCaseTag = z.infer<typeof testCaseTagSchema>;

export const evidenceRefSchema = z
  .object({
    filePath: z.string(),
    lineStart: z.number().int().positive().optional(),
    lineEnd: z.number().int().positive().optional(),
    quote: z.string().optional(),
    reason: z.string(),
  })
  .strict();
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

export const capabilityNodeSchema = z
  .object({
    id: z.string(),
    type: capabilityNodeTypeSchema,
    name: z.string(),
    target: z.string().optional(),
    filePath: z.string().optional(),
    risk: riskLevelSchema.optional(),
    confidence: confidenceLevelSchema,
    confidenceBasis: z.string(),
    evidenceRefs: z.array(evidenceRefSchema),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type CapabilityNode = z.infer<typeof capabilityNodeSchema>;

export const capabilityEdgeSchema = z
  .object({
    id: z.string(),
    type: capabilityEdgeTypeSchema,
    source: z.string(),
    target: z.string(),
    confidence: confidenceLevelSchema,
    confidenceBasis: z.string(),
    evidenceRefs: z.array(evidenceRefSchema),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();
export type CapabilityEdge = z.infer<typeof capabilityEdgeSchema>;

export const capabilityGraphSchema = z
  .object({
    version: z.string(),
    rootDir: z.string(),
    generatedAt: z.string(),
    nodes: z.record(capabilityNodeSchema),
    edges: z.record(capabilityEdgeSchema),
  })
  .strict();
export type CapabilityGraph = z.infer<typeof capabilityGraphSchema>;
