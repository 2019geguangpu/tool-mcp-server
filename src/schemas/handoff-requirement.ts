import { z } from "zod";

export const RequirementPrioritySchema = z.enum(["low", "medium", "high"]);

export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

/** 路由至产品需求工单池 */
export const REQUIREMENT_TICKET_POOL = "requirement" as const;

export const RequirementHandoffSchema = z.object({
  intent: z.literal("requirement"),
  ticket_pool: z.literal(REQUIREMENT_TICKET_POOL),
  confidence: z.number().min(0).max(1),
  title: z.string().min(1),
  description: z.string().min(1),
  priority: RequirementPrioritySchema,
  source: z.string().optional(),
  feishu_thread_id: z.string().optional(),
  raw_summary: z.string().min(1),
});

export type RequirementHandoff = z.infer<typeof RequirementHandoffSchema>;
