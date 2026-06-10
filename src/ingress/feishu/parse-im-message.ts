import type { FeishuImMessage, FeishuMessageReceiveEvent } from "./types.js";

export function normalizeMessageReceiveEvent(
  data: unknown
): FeishuMessageReceiveEvent | null {
  if (!data || typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const event = root.event;
  if (event && typeof event === "object") {
    return event as FeishuMessageReceiveEvent;
  }

  if (root.message && typeof root.message === "object") {
    return {
      sender: root.sender as FeishuMessageReceiveEvent["sender"],
      message: root.message as FeishuImMessage,
    };
  }

  return null;
}

export function parseFeishuMessageText(message: FeishuImMessage): string {
  if (!message.content?.trim()) return "";

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    return message.content.trim();
  }

  if (message.message_type === "text") {
    return String(body.text ?? "").trim();
  }

  if (message.message_type === "post") {
    const title = String(body.title ?? "").trim();
    const text = extractPostPlainText(body.content);
    return [title, text].filter(Boolean).join("\n").trim();
  }

  return "";
}

function extractPostPlainText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const lines: string[] = [];

  for (const paragraph of content) {
    if (!Array.isArray(paragraph)) continue;
    for (const node of paragraph) {
      if (!node || typeof node !== "object") continue;
      const item = node as Record<string, unknown>;
      if (item.tag === "text" && typeof item.text === "string") {
        lines.push(item.text);
      }
    }
  }

  return lines.join("").trim();
}

export function classifyTopicMessageShape(message: FeishuImMessage): {
  isTopicRoot: boolean;
  isTopicReply: boolean;
} {
  const hasThread = Boolean(message.thread_id?.trim());
  const hasParent = Boolean(message.parent_id?.trim());
  return {
    isTopicRoot: hasThread && !hasParent,
    isTopicReply: hasThread && hasParent,
  };
}
