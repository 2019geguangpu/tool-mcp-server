import type { MessageIntent } from "./intent.js";

/** 可产出 handoff、需进入工单池的意图 */
export type ActionableIntent = Exclude<MessageIntent, "vent" | "unknown">;

/** 一意图一工单池：handoff.intent / ticket_pool 即路由键 */
export const INTENT_TICKET_POOL: Record<ActionableIntent, ActionableIntent> = {
  bug: "bug",
  requirement: "requirement",
  support: "support",
};
