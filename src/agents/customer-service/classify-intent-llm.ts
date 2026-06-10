import {
  IntentClassificationSchema,
  type ClassifyInput,
  type IntentClassification,
} from "../../schemas/intent.js";
import { loadPrompt } from "../shared/load-prompt.js";
import { parseLlmJsonObject } from "../shared/parse-llm-json.js";
import { chatCompletion } from "../shared/run-llm.js";

function buildUserPrompt(input: ClassifyInput): string {
  const meta: string[] = [];
  if (input.source) meta.push(`来源: ${input.source}`);
  if (input.feishu_thread_id) meta.push(`飞书话题: ${input.feishu_thread_id}`);
  if (input.attachments?.length) {
    meta.push(`附件: ${input.attachments.join(", ")}`);
  }

  return [
    "请分析以下用户反馈并输出 IntentClassification JSON（仅 JSON，无其它文字）。",
    meta.length ? `\n${meta.join("\n")}` : "",
    "\n---\n",
    input.text.trim(),
  ].join("");
}

export async function classifyMessageIntentLlm(
  input: ClassifyInput
): Promise<IntentClassification> {
  const systemPrompt = await loadPrompt("customer-service.md");
  const content = await chatCompletion({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserPrompt(input) },
    ],
    temperature: 0.1,
    maxTokens: 512,
  });

  const parsed = parseLlmJsonObject(content);
  return IntentClassificationSchema.parse(parsed);
}
