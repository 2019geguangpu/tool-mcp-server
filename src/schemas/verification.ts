import { z } from "zod";

/** 用户主张是否成立的核实结论 */
export const VerificationVerdictSchema = z.enum([
  "verified",
  "refuted",
  "partially_true",
  "inconclusive",
]);

export type VerificationVerdict = z.infer<typeof VerificationVerdictSchema>;

/** handoff 上的核实进度（待查 / 已出结论） */
export const VerificationStatusSchema = z.enum([
  "pending",
  "verified",
  "refuted",
  "inconclusive",
]);

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ProjectClaimCheckSchema = z.object({
  user_id: z.string().min(1),
  project_name: z.string().optional(),
  claim_summary: z.string().optional(),
});

export type ProjectClaimCheck = z.infer<typeof ProjectClaimCheckSchema>;

export const ProjectClaimVerificationSchema = z.object({
  user_id: z.string(),
  project_name: z.string().optional(),
  verdict: VerificationVerdictSchema,
  verification_status: VerificationStatusSchema,
  summary: z.string().min(1),
  evidence: z.array(z.string()),
  matched_projects: z.array(z.record(z.unknown())),
  draft_projects: z.array(z.record(z.unknown())),
});

export type ProjectClaimVerification = z.infer<
  typeof ProjectClaimVerificationSchema
>;
