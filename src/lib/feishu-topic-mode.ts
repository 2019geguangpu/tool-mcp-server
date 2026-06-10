/** 飞书话题消息监听范围 */
export type FeishuTopicMode = "all" | "topic_root" | "topic_reply";

const VALID: FeishuTopicMode[] = ["all", "topic_root", "topic_reply"];

const ALIASES: Record<string, FeishuTopicMode> = {
  all: "all",
  any: "all",
  any_topic_message: "all",
  all_topic_messages: "all",
  topic_root: "topic_root",
  root: "topic_root",
  topic_reply: "topic_reply",
  reply: "topic_reply",
};

export function parseFeishuTopicMode(raw: string | undefined): FeishuTopicMode {
  const key = (raw ?? "all").trim().toLowerCase();
  const mode = ALIASES[key];
  if (mode) return mode;
  throw new Error(
    `无效的 FEISHU_TOPIC_MODE="${raw}"，允许值：${VALID.join(" | ")}（默认 all = 首帖 + 回复）`
  );
}

export function describeFeishuTopicMode(mode: FeishuTopicMode): string {
  switch (mode) {
    case "all":
      return "话题首帖与话题内回复";
    case "topic_root":
      return "仅话题首帖";
    case "topic_reply":
      return "仅话题内回复";
  }
}
