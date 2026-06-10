import { z } from "zod";

export const BugUrgencySchema = z.enum(["low", "medium", "high"]);

export type BugUrgency = z.infer<typeof BugUrgencySchema>;

/** 路由至研发/缺陷工单池 */
export const BUG_TICKET_POOL = "bug" as const;

export const BugHandoffSchema = z.object({
  intent: z.literal("bug"),
  ticket_pool: z.literal(BUG_TICKET_POOL),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
  symptoms: z.array(z.string()).min(1),
  urgency: BugUrgencySchema,
  evidence: z.array(z.string()),
  feishu_thread_id: z.string().optional(),
  raw_summary: z.string().min(1),
});

export type BugHandoff = z.infer<typeof BugHandoffSchema>;
