import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { MessageDedup } from "./message-dedup.js";
import { normalizeMessageReceiveEvent } from "./parse-im-message.js";
import { processTopicMessage } from "./process-topic-message.js";
import { shouldProcessTopicMessage } from "./topic-filter.js";

const dedup = new MessageDedup();

export async function handleImMessageReceiveV1(data: unknown): Promise<void> {
  const payload = normalizeMessageReceiveEvent(data);
  const message = payload?.message;
  const sender = payload?.sender;

  if (!message?.message_id) {
    logger.warn("feishu_event_skip_invalid", { reason: "missing_message" });
    return;
  }

  if (sender?.sender_type === "bot") {
    logger.debug("feishu_event_skip_bot", { message_id: message.message_id });
    return;
  }

  if (dedup.has(message.message_id)) {
    logger.debug("feishu_event_skip_duplicate", {
      message_id: message.message_id,
    });
    return;
  }
  dedup.add(message.message_id);

  const decision = shouldProcessTopicMessage(message, {
    watchChatId: config.feishu.watchChatId,
    topicMode: config.feishu.topicMode,
  });

  if (!decision.accept) {
    logger.debug("feishu_event_skip_filter", {
      message_id: message.message_id,
      chat_id: message.chat_id,
      thread_id: message.thread_id,
      parent_id: message.parent_id,
      reason: decision.reason,
      topic_mode: config.feishu.topicMode,
    });
    return;
  }

  void processTopicMessage({
    message,
    sender: sender ?? {},
    matchReason: decision.reason,
  }).catch((error: unknown) => {
    const errMessage = error instanceof Error ? error.message : String(error);
    logger.error("feishu_topic_analyze_error", {
      message_id: message.message_id,
      thread_id: message.thread_id,
      message: errMessage,
    });
  });
}
