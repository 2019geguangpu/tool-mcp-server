import * as Lark from "@larksuiteoapi/node-sdk";
import { config } from "../../config.js";
import { describeFeishuTopicMode } from "../../lib/feishu-topic-mode.js";
import { logger } from "../../logger.js";
import { handleImMessageReceiveV1 } from "./on-message-receive.js";

function assertFeishuAgentWorkerConfigured(): void {
  if (!config.feishu.appId || !config.feishu.appSecret) {
    throw new Error(
      "未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，无法启动飞书 Agent Worker。"
    );
  }
  if (!config.feishu.watchChatId) {
    throw new Error(
      "未配置 CHAT_ID（或 FEISHU_WATCH_CHAT_ID），无法限定监听的话题群。"
    );
  }
}

export async function startFeishuAgentWorker(): Promise<void> {
  assertFeishuAgentWorkerConfigured();

  const baseConfig = {
    appId: config.feishu.appId,
    appSecret: config.feishu.appSecret,
  };

  const wsClient = new Lark.WSClient({
    ...baseConfig,
    loggerLevel: Lark.LoggerLevel.info,
  });

  logger.info("feishu_agent_worker_starting", {
    watch_chat_id: config.feishu.watchChatId,
    topic_mode: config.feishu.topicMode,
    topic_mode_desc: describeFeishuTopicMode(config.feishu.topicMode),
  });

  wsClient.start({
    eventDispatcher: new Lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        try {
          await handleImMessageReceiveV1(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const stack = error instanceof Error ? error.stack : undefined;
          logger.error("feishu_event_handler_error", { message, stack });
        }
      },
    }),
  });

  logger.info("feishu_agent_worker_ready", {
    transport: "ws",
    event: "im.message.receive_v1",
  });
}
