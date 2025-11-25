import { config } from "dotenv";
import { z } from "zod";

// 環境変数のスキーマ定義
const envSchema = z.object({
  TARGET_URL: z.string().url().default("https://yumemi.notion.site/"),
  OUTPUT_DIR: z.string().default("output"),
  VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1920),
  VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(1080),
  PAGE_LOAD_TIMEOUT: z.coerce.number().int().positive().default(60000),
  CONTENT_STABILIZATION_DELAY: z.coerce.number().int().nonnegative().default(3000),
  DEV_SERVER_PORT: z.coerce.number().int().positive().default(3000),
});

// 環境変数をパースして検証
const parseEnv = (async () => {
  config();
  const result = await envSchema.safeParseAsync(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(result.error.format());
    throw new Error("Environment validation failed");
  }

  return result.data;
})();

export const getEnv = async () => await parseEnv;
