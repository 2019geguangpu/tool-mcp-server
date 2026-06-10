import fs from "fs/promises";
import path from "path";
import { config } from "../../config.js";

const PROMPTS_DIR = path.join(config.projectRoot, "prompts");

export async function loadPrompt(filename: string): Promise<string> {
  const filePath = path.join(PROMPTS_DIR, filename);
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 prompt 文件 ${filePath}: ${message}`);
  }
}

export function promptsDir(): string {
  return PROMPTS_DIR;
}
