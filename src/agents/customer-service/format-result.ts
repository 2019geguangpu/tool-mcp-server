import type { CustomerServiceResult } from "../types.js";

export function formatCustomerServiceResult(result: CustomerServiceResult): string {
  const { classification, handoff, classifier_mode } = result;
  const lines = [
    "【客服 Agent 分析结果】",
    "",
    `意图: ${classification.intent}`,
    `置信度: ${classification.confidence}`,
    `依据: ${classification.reasons.join("；")}`,
  ];

  if (classification.secondary_intents?.length) {
    lines.push(`次要意图: ${classification.secondary_intents.join(", ")}`);
  }

  lines.push(`分类模式: ${classifier_mode}`, "");

  if (handoff) {
    lines.push(`工单池: ${handoff.ticket_pool}`);
    if (handoff.intent === "support") {
      if (handoff.needs_verification) {
        lines.push(
          `需核实: 是（verification_status=${handoff.verification_status ?? "pending"}）`
        );
        lines.push(
          "下一步: live MCP 探表+query_live_select → integrations MCP interpret_claim_verification"
        );
      }
    }
    lines.push("", "【Handoff】", JSON.stringify(handoff, null, 2));
  } else {
    lines.push("（未产出 handoff，可能为情绪发泄、未知意图或置信度不足）");
  }

  return lines.join("\n");
}
