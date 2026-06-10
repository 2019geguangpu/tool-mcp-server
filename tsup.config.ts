import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "view-logs": "scripts/view-logs.ts",
    "classify-topic": "scripts/classify-topic.ts",
    "feishu-agent-worker": "scripts/feishu-agent-worker.ts",
  },
  format: ["esm"],
  platform: "node",
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
});
