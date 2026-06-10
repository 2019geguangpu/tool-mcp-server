import { config } from "../../config.js";
import { logger } from "../../logger.js";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

function assertLlmConfigured(): void {
  if (!config.llm.apiKey) {
    throw new Error(
      "未配置 SILICONFLOW_API_KEY，无法使用 LLM 分类。请在 .env 中填写或改用 classifier_mode=heuristic。"
    );
  }
}

export async function chatCompletion(options: {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  assertLlmConfigured();

  const url = `${config.llm.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.llm.chatModel,
        messages: options.messages,
        temperature: options.temperature ?? 0.1,
        max_tokens: options.maxTokens ?? 512,
      }),
    });

    const body = (await res.json()) as ChatCompletionResponse;
    if (!res.ok) {
      const detail = body.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`SiliconFlow 请求失败: ${detail}`);
    }

    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("SiliconFlow 返回空内容");
    }

    logger.debug("llm_chat_completion_ok", {
      model: config.llm.chatModel,
      finish_reason: body.choices?.[0]?.finish_reason,
      content_length: content.length,
    });

    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SiliconFlow 请求超时（>${config.llm.timeoutMs}ms）`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
