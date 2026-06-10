#!/usr/bin/env node
/**
 * 飞书话题群 Agent Worker：长连接接收 im.message.receive_v1，调用客服 Agent 分析意图。
 *
 * 前置：
 * - 开放平台订阅「接收消息 v2.0」，订阅方式选「使用长连接接收事件」
 * - 机器人已加入目标话题群；.env 配置 FEISHU_APP_* 与 CHAT_ID
 * - 消息推送权限（二选一）：
 *   A. 开通「获取群聊中所有消息」im:message.group_msg（敏感权限，话题帖无需 @）
 *   B. 仅开通 @ 机器人权限时，用户须在话题帖里 @机器人 才会推送事件
 *
 * 用法：
 *   pnpm run feishu:agent-worker
 */
import { startFeishuAgentWorker } from "../src/ingress/feishu/event-listener.js";
import { logger } from "../src/logger.js";

startFeishuAgentWorker().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error("feishu_agent_worker_fatal", { message, stack });
  process.exit(1);
});
