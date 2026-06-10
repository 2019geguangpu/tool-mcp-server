export type SupportContextFields = {
  username?: string;
  user_id?: string;
  project_name?: string;
};

function extractUserId(text: string): string | undefined {
  const labeled =
    text.match(/\bUID\s*[:：]\s*(\d{8,})/i)?.[1] ??
    text.match(/\buser[_\s]?id\s*[:：]\s*(\d{8,})/i)?.[1];
  if (labeled) return labeled;
  return undefined;
}

function extractProjectName(text: string): string | undefined {
  const labeled =
    text.match(/(?:project\s*name|游戏名|项目名|作品名|项目)\s*[:：]\s*(.+)/i)?.[1]?.trim() ??
    text.match(/\bmy\s+(.+?)\s+game\b/i)?.[1]?.trim();
  if (labeled) return labeled.replace(/[.。!！?？,，]+$/g, "").slice(0, 120);
  return undefined;
}

/** 从反馈正文提取运营处理常用字段 */
export function extractSupportContext(text: string): SupportContextFields {
  const username =
    text.match(/(?:username|用户(?:名)?|账号)\s*[:：]\s*@?([\w.-]+)/i)?.[1] ??
    text.match(/@([\w.-]{3,})/)?.[1];

  return {
    username: username || undefined,
    user_id: extractUserId(text),
    project_name: extractProjectName(text),
  };
}

export function inferSupportRequestType(
  text: string
): "data_recovery" | "account" | "billing" | "other" {
  if (
    /恢复|找回|误删|删除.{0,12}(作品|项目|数据|游戏)|草稿.{0,12}(删|丢|没)/.test(
      text
    ) ||
    (/deleted|lost|disappeared|missing|wiped|got deleted|removed/i.test(text) &&
      /draft|project|game/i.test(text))
  ) {
    return "data_recovery";
  }
  if (/账号|登录|密码|绑定|注销/.test(text)) {
    return "account";
  }
  if (/退款|扣费|订阅|账单|支付/.test(text)) {
    return "billing";
  }
  return "other";
}

export function inferSupportPriority(text: string): "low" | "medium" | "high" {
  if (/紧急|尽快|马上|阻塞/.test(text)) return "high";
  if (/不急|有空/.test(text)) return "low";
  return "medium";
}
