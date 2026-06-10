import {
  BugHandoffSchema,
  BUG_TICKET_POOL,
  type BugHandoff,
} from "../../schemas/handoff-bug.js";
import {
  RequirementHandoffSchema,
  REQUIREMENT_TICKET_POOL,
  type RequirementHandoff,
} from "../../schemas/handoff-requirement.js";
import {
  SupportHandoffSchema,
  SUPPORT_TICKET_POOL,
  type SupportHandoff,
} from "../../schemas/handoff-support.js";
import {
  ClassifyInputSchema,
  type ClassifyInput,
  type IntentClassification,
} from "../../schemas/intent.js";
import { resolveClassifierMode } from "../../lib/classifier-mode.js";
import { config } from "../../config.js";
import type {
  ClassifierMode,
  CustomerServiceInput,
  CustomerServiceResult,
} from "../types.js";
import { classifyMessageIntentHeuristic } from "./classify-intent.js";
import { classifyMessageIntentLlm } from "./classify-intent-llm.js";
import {
  extractSupportContext,
  inferSupportPriority,
  inferSupportRequestType,
} from "./extract-support-context.js";

const BUG_SYMPTOM_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /超时|timeout/i, label: "model_timeout" },
  { pattern: /不稳定/, label: "instability" },
  { pattern: /playable.{0,15}(不|未|无法|没有|失败)/i, label: "playable_not_updated" },
  { pattern: /playable 不/i, label: "playable_not_updated" },
  { pattern: /got it/i, label: "got_it_without_update" },
  { pattern: /something'?s off/i, label: "somethings_off_loop" },
  { pattern: /崩溃|crash/i, label: "crash" },
  { pattern: /无法|不能|失败/, label: "functional_failure" },
];

function extractSymptoms(text: string): string[] {
  const found = BUG_SYMPTOM_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ label }) => label
  );
  const unique = [...new Set(found)];
  return unique.length > 0 ? unique : ["unspecified_symptom"];
}

function inferBugUrgency(text: string): BugHandoff["urgency"] {
  if (/两天|多天|频繁|大量|很多用户|持续/.test(text)) return "high";
  if (/偶尔|有时|个别/.test(text)) return "low";
  return "medium";
}

function inferRequirementPriority(text: string): RequirementHandoff["priority"] {
  if (/紧急|阻塞|必须|尽快/.test(text)) return "high";
  if (/最好|可以的话|nice to have/i.test(text)) return "low";
  return "medium";
}

function buildBugHandoff(
  input: ClassifyInput,
  classification: IntentClassification
): BugHandoff {
  const text = input.text.trim();
  const evidence = [...(input.attachments ?? [])];
  if (input.feishu_thread_id) evidence.push(input.feishu_thread_id);

  return BugHandoffSchema.parse({
    intent: "bug",
    ticket_pool: BUG_TICKET_POOL,
    confidence: classification.confidence,
    source: input.source,
    symptoms: extractSymptoms(text),
    urgency: inferBugUrgency(text),
    evidence,
    feishu_thread_id: input.feishu_thread_id,
    raw_summary: text.slice(0, 500),
  });
}

function buildRequirementHandoff(
  input: ClassifyInput,
  classification: IntentClassification
): RequirementHandoff {
  const text = input.text.trim();
  const firstLine =
    text
      .split(/\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? text;

  return RequirementHandoffSchema.parse({
    intent: "requirement",
    ticket_pool: REQUIREMENT_TICKET_POOL,
    confidence: classification.confidence,
    title: firstLine.slice(0, 80),
    description: text.slice(0, 800),
    priority: inferRequirementPriority(text),
    source: input.source,
    feishu_thread_id: input.feishu_thread_id,
    raw_summary: text.slice(0, 500),
  });
}

function buildSupportHandoff(
  input: ClassifyInput,
  classification: IntentClassification
): SupportHandoff {
  const text = input.text.trim();
  const firstLine =
    text
      .split(/\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? text;
  const request_type = inferSupportRequestType(text);
  const { username, user_id, project_name } = extractSupportContext(text);
  const needs_verification = request_type === "data_recovery";

  return SupportHandoffSchema.parse({
    intent: "support",
    ticket_pool: SUPPORT_TICKET_POOL,
    confidence: classification.confidence,
    request_type,
    title: firstLine.slice(0, 80),
    description: text.slice(0, 800),
    priority: inferSupportPriority(text),
    username,
    user_id,
    project_name,
    needs_verification,
    verification_status: needs_verification ? "pending" : undefined,
    source: input.source,
    feishu_thread_id: input.feishu_thread_id,
    raw_summary: text.slice(0, 500),
  });
}

function buildHandoff(
  input: ClassifyInput,
  classification: IntentClassification
): BugHandoff | RequirementHandoff | SupportHandoff | null {
  if (classification.intent === "bug" && classification.confidence >= 0.5) {
    return buildBugHandoff(input, classification);
  }
  if (
    classification.intent === "requirement" &&
    classification.confidence >= 0.5
  ) {
    return buildRequirementHandoff(input, classification);
  }
  if (classification.intent === "support" && classification.confidence >= 0.5) {
    return buildSupportHandoff(input, classification);
  }
  return null;
}

async function classifyWithMode(
  input: ClassifyInput,
  mode: ClassifierMode
): Promise<IntentClassification> {
  if (mode === "llm") {
    return classifyMessageIntentLlm(input);
  }
  return classifyMessageIntentHeuristic(input);
}

export async function runCustomerService(
  raw: CustomerServiceInput
): Promise<CustomerServiceResult> {
  const input = ClassifyInputSchema.parse({
    text: raw.text,
    feishu_thread_id: raw.feishu_thread_id,
    source: raw.source,
    attachments: raw.attachments,
  });
  const mode = resolveClassifierMode(
    raw.classifier_mode,
    Boolean(config.llm.apiKey)
  );

  const classification = await classifyWithMode(input, mode);
  const handoff = buildHandoff(input, classification);

  return {
    classification,
    handoff,
    classifier_mode: mode,
  };
}

export { classifyMessageIntentHeuristic };
