import type { BugHandoff } from "../schemas/handoff-bug.js";
import type { RequirementHandoff } from "../schemas/handoff-requirement.js";
import type { SupportHandoff } from "../schemas/handoff-support.js";
import type { ClassifyInput, IntentClassification } from "../schemas/intent.js";

export type ClassifierMode = "heuristic" | "llm";

export type CustomerServiceResult = {
  classification: IntentClassification;
  handoff: BugHandoff | RequirementHandoff | SupportHandoff | null;
  classifier_mode: ClassifierMode;
};

export type CustomerServiceInput = ClassifyInput & {
  classifier_mode?: ClassifierMode;
};

export type AgentDefinition = {
  name: string;
  promptFile: string;
  description: string;
};

export const CUSTOMER_SERVICE_AGENT: AgentDefinition = {
  name: "customer-service",
  promptFile: "customer-service.md",
  description: "识别飞书话题消息意图并产出 handoff",
};

export const BUG_AGENT: AgentDefinition = {
  name: "bug",
  promptFile: "bug-agent.md",
  description: "处理 bug 类反馈",
};

export const REQUIREMENT_AGENT: AgentDefinition = {
  name: "requirement",
  promptFile: "requirement-agent.md",
  description: "处理需求类反馈",
};

export const SUPPORT_AGENT: AgentDefinition = {
  name: "support",
  promptFile: "support-agent.md",
  description: "处理运营/客服个案工单",
};

export const VERIFICATION_AGENT: AgentDefinition = {
  name: "verification",
  promptFile: "verification-agent.md",
  description: "核实用户主张是否与线上一致",
};

export const AGENT_REGISTRY = [
  CUSTOMER_SERVICE_AGENT,
  BUG_AGENT,
  REQUIREMENT_AGENT,
  SUPPORT_AGENT,
  VERIFICATION_AGENT,
] as const;
