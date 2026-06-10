import type { ClassifyInput, IntentClassification } from "../../schemas/intent.js";

type SignalRule = {
  intent: IntentClassification["intent"];
  patterns: RegExp[];
  reason: string;
  weight: number;
};

const BUG_SIGNALS: SignalRule[] = [
  {
    intent: "bug",
    patterns: [/bug/i, /报错/, /异常/, /失败/, /无法/, /不能/, /崩溃/],
    reason: "含故障/失败类关键词",
    weight: 2,
  },
  {
    intent: "bug",
    patterns: [/超时/, /timeout/i, /timed out/i, /不稳定/],
    reason: "描述超时或稳定性问题",
    weight: 2.5,
  },
  {
    intent: "bug",
    patterns: [/复现/, /步骤/, /一直/, /频繁/, /循环/],
    reason: "描述可复现或频繁出现的异常",
    weight: 1.5,
  },
  {
    intent: "bug",
    patterns: [
      /playable.{0,15}(不|未|无法|没有|失败)/i,
      /playable 不/i,
      /不更新.{0,10}playable/i,
    ],
    reason: "playable 相关功能异常",
    weight: 2,
  },
  {
    intent: "bug",
    patterns: [/got it/i, /something'?s off/i],
    reason: "提及具体产品异常现象",
    weight: 2,
  },
  {
    intent: "bug",
    patterns: [/用户反馈/, /discord/i],
    reason: "来自用户反馈渠道且通常伴随问题描述",
    weight: 0.5,
  },
];

const REQUIREMENT_SIGNALS: SignalRule[] = [
  {
    intent: "requirement",
    patterns: [/需求/, /建议/, /能不能/, /能否/, /想要.{0,8}功能/, /功能.{0,8}(支持|增加|添加)/],
    reason: "表达面向产品的功能期望或改进建议",
    weight: 2,
  },
  {
    intent: "requirement",
    patterns: [/支持.{0,8}(导出|分享|接入|集成)/],
    reason: "明确提出能力诉求",
    weight: 2,
  },
];

const SUPPORT_SIGNALS: SignalRule[] = [
  {
    intent: "support",
    patterns: [/恢复/, /找回/, /误删/, /删除.{0,8}(作品|项目|数据)/],
    reason: "个案数据恢复，需运营/客服人工处理",
    weight: 3,
  },
  {
    intent: "support",
    patterns: [/username\s*[:：]/i, /project\s*name\s*[:：]/i, /用户反馈/],
    reason: "含用户标识或项目名，通常为个案协助",
    weight: 2,
  },
  {
    intent: "support",
    patterns: [/账号/, /登录/, /密码/, /退款/, /扣费/],
    reason: "账号或账务类个案",
    weight: 2.5,
  },
  {
    intent: "support",
    patterns: [/帮忙/, /人工/, /运营/],
    reason: "明确需要人工介入",
    weight: 2,
  },
];

const VENT_SIGNALS: SignalRule[] = [
  {
    intent: "vent",
    patterns: [/太烂/, /垃圾/, /无语/, /降智/, /吐槽/, /受不了/],
    reason: "以情绪宣泄为主",
    weight: 2,
  },
  {
    intent: "vent",
    patterns: [/什么玩意/, /离谱/, /服了/],
    reason: "强烈负面情绪表达",
    weight: 1.5,
  },
];

const ALL_SIGNALS = [
  ...BUG_SIGNALS,
  ...REQUIREMENT_SIGNALS,
  ...SUPPORT_SIGNALS,
  ...VENT_SIGNALS,
];

function scoreByIntent(text: string): Map<
  IntentClassification["intent"],
  { score: number; reasons: string[] }
> {
  const scores = new Map<
    IntentClassification["intent"],
    { score: number; reasons: string[] }
  >([
    ["bug", { score: 0, reasons: [] }],
    ["requirement", { score: 0, reasons: [] }],
    ["support", { score: 0, reasons: [] }],
    ["vent", { score: 0, reasons: [] }],
    ["unknown", { score: 0, reasons: [] }],
  ]);

  for (const rule of ALL_SIGNALS) {
    if (rule.patterns.some((p) => p.test(text))) {
      const entry = scores.get(rule.intent)!;
      entry.score += rule.weight;
      if (!entry.reasons.includes(rule.reason)) {
        entry.reasons.push(rule.reason);
      }
    }
  }

  return scores;
}

function pickPrimary(
  scores: Map<
    IntentClassification["intent"],
    { score: number; reasons: string[] }
  >
): {
  intent: IntentClassification["intent"];
  confidence: number;
  reasons: string[];
  secondary: IntentClassification["intent"][];
} {
  const ranked = [...scores.entries()]
    .filter(([intent]) => intent !== "unknown")
    .sort((a, b) => b[1].score - a[1].score);

  const [topIntent, topEntry] = ranked[0] ?? [
    "unknown",
    { score: 0, reasons: [] },
  ];
  const [, secondEntry] = ranked[1] ?? ["unknown", { score: 0, reasons: [] }];

  if (topEntry.score === 0) {
    return {
      intent: "unknown",
      confidence: 0.3,
      reasons: ["未匹配到足够强的意图信号，需人工或 LLM 复核"],
      secondary: [],
    };
  }

  const margin = topEntry.score - (secondEntry?.score ?? 0);
  const confidence = Math.min(
    0.95,
    0.55 + topEntry.score * 0.08 + margin * 0.05
  );

  const secondary = ranked
    .slice(1)
    .filter(
      ([, entry]) => entry.score > 0 && entry.score >= topEntry.score * 0.6
    )
    .map(([intent]) => intent);

  return {
    intent: topIntent as IntentClassification["intent"],
    confidence: Number(confidence.toFixed(2)),
    reasons: topEntry.reasons,
    secondary,
  };
}

export function classifyMessageIntentHeuristic(
  input: ClassifyInput
): IntentClassification {
  const text = input.text.trim();
  const { intent, confidence, reasons, secondary } = pickPrimary(
    scoreByIntent(text)
  );

  const result: IntentClassification = {
    intent,
    confidence,
    reasons,
  };

  if (secondary.length > 0) {
    result.secondary_intents = secondary;
  }

  return result;
}
