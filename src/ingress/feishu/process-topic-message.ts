import { runCustomerService } from "../../agents/customer-service/index.js";
import { logger } from "../../logger.js";
import type { CustomerServiceResult } from "../../agents/types.js";
import {
  classifyTopicMessageShape,
  parseFeishuMessageText,
} from "./parse-im-message.js";
import type { FeishuImMessage, FeishuImSender } from "./types.js";

export async function processTopicMessage(options: {
  message: FeishuImMessage;
  sender: FeishuImSender;
  matchReason: string;
}): Promise<CustomerServiceResult | null> {
  const { message, sender, matchReason } = options;
  const text = parseFeishuMessageText(message);
  const { isTopicRoot, isTopicReply } = classifyTopicMessageShape(message);

  if (!text) {
    logger.info("feishu_topic_skip_empty_text", {
      message_id: message.message_id,
      message_type: message.message_type,
      match_reason: matchReason,
    });
    return null;
  }

  logger.info("feishu_topic_analyze_start", {
    message_id: message.message_id,
    chat_id: message.chat_id,
    thread_id: message.thread_id,
    parent_id: message.parent_id,
    match_reason: matchReason,
    is_topic_root: isTopicRoot,
    is_topic_reply: isTopicReply,
    sender_type: sender.sender_type,
    text_preview: text.slice(0, 120),
  });

  const result = await runCustomerService({
    text,
    feishu_thread_id: message.thread_id,
    source: "feishu_group",
    classifier_mode: "heuristic",
  });

  logger.info("feishu_topic_analyze_done", {
    message_id: message.message_id,
    thread_id: message.thread_id,
    intent: result.classification.intent,
    confidence: result.classification.confidence,
    has_handoff: Boolean(result.handoff),
    handoff_intent: result.handoff?.intent ?? null,
    match_reason: matchReason,
    is_topic_root: isTopicRoot,
    is_topic_reply: isTopicReply,
  });

  return result;
}
