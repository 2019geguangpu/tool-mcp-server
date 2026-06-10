import { z } from "zod";
import { VerificationStatusSchema } from "./verification.js";

export const SupportPrioritySchema = z.enum(["low", "medium", "high"]);

export type SupportPriority = z.infer<typeof SupportPrioritySchema>;

/** 客服/运营需人工介入的请求类型 */
export const SupportRequestTypeSchema = z.enum([
  "data_recovery",
  "account",
  "billing",
  "other",
]);

export type SupportRequestType = z.infer<typeof SupportRequestTypeSchema>;

/** 路由至运营/客服工单池 */
export const SUPPORT_TICKET_POOL = "support" as const;

export const SupportHandoffSchema = z.object({
  intent: z.literal("support"),
  ticket_pool: z.literal(SUPPORT_TICKET_POOL),
  confidence: z.number().min(0).max(1),
  request_type: SupportRequestTypeSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  priority: SupportPrioritySchema,
  /** 从正文提取的用户标识，如 @jackhow6728 */
  username: z.string().optional(),
  /** 从正文提取的用户数字 ID（UID） */
  user_id: z.string().optional(),
  /** 从正文提取的项目/作品名 */
  project_name: z.string().optional(),
  /** data_recovery 等需先查库核实用户主张时为 true */
  needs_verification: z.boolean().optional(),
  /** 核实进度；新建 handoff 且 needs_verification 时为 pending */
  verification_status: VerificationStatusSchema.optional(),
  source: z.string().optional(),
  feishu_thread_id: z.string().optional(),
  raw_summary: z.string().min(1),
});

export type SupportHandoff = z.infer<typeof SupportHandoffSchema>;
