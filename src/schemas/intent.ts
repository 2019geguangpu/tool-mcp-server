import { z } from "zod";

/** 客服 Agent 对用户消息的主意图分类 */
export const MessageIntentSchema = z.enum([
  "bug",
  "requirement",
  "support",
  "vent",
  "unknown",
]);

export type MessageIntent = z.infer<typeof MessageIntentSchema>;

export const IntentClassificationSchema = z.object({
  intent: MessageIntentSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string()).min(1),
  /** 复合意图，如同时含 bug 描述与情绪发泄 */
  secondary_intents: z.array(MessageIntentSchema).optional(),
});

export type IntentClassification = z.infer<typeof IntentClassificationSchema>;

export const ClassifyInputSchema = z.object({
  text: z.string().min(1),
  feishu_thread_id: z.string().optional(),
  source: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

export type ClassifyInput = z.infer<typeof ClassifyInputSchema>;
