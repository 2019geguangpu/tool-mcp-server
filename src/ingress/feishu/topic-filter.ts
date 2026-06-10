import type { FeishuTopicMode } from "../../lib/feishu-topic-mode.js";
import type { FeishuImMessage } from "./types.js";
import { classifyTopicMessageShape } from "./parse-im-message.js";

export function shouldProcessTopicMessage(
  message: FeishuImMessage,
  options: {
    watchChatId: string;
    topicMode: FeishuTopicMode;
  }
): { accept: boolean; reason: string } {
  if (message.chat_type && message.chat_type !== "group") {
    return { accept: false, reason: "not_group_chat" };
  }

  if (options.watchChatId && message.chat_id !== options.watchChatId) {
    return { accept: false, reason: "chat_id_mismatch" };
  }

  if (!message.thread_id?.trim()) {
    return { accept: false, reason: "not_topic_message" };
  }

  const { isTopicRoot, isTopicReply } = classifyTopicMessageShape(message);

  switch (options.topicMode) {
    case "all":
      if (isTopicRoot || isTopicReply) {
        return { accept: true, reason: isTopicRoot ? "topic_root" : "topic_reply" };
      }
      return { accept: false, reason: "topic_shape_unknown" };
    case "topic_root":
      return isTopicRoot
        ? { accept: true, reason: "topic_root" }
        : { accept: false, reason: "topic_reply_skipped" };
    case "topic_reply":
      return isTopicReply
        ? { accept: true, reason: "topic_reply" }
        : { accept: false, reason: "topic_root_skipped" };
  }
}
